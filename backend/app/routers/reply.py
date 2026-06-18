import logging
from datetime import datetime, timezone, timedelta
import re
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from app.schemas import ReplyRequest, ReplySendRequest
from app.dependencies.auth import get_current_user_id
from app.services.supabase_client import get_supabase_admin_client
from app.services.gemini import generate_email_reply
from app.services.gmail import send_gmail_email, refresh_google_access_token, fetch_gmail_message_details

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reply", tags=["Email Reply"])

def log_auth_header(request: Request, authorization: str = Header(None)):
    logger.info(f"[Reply Router] Incoming Authorization header: {authorization}")
    logger.info(f"[Reply Router] Incoming cookies: {request.cookies}")
    return authorization

@router.post("")
async def generate_thread_reply(
    payload: ReplyRequest,
    _log: str = Depends(log_auth_header),
    user_id: str = Depends(get_current_user_id)
):
    try:
        supabase = get_supabase_admin_client()

        # 1. Fetch thread messages from Supabase order by created_at ascending
        emails_res = supabase.table("emails").select(
            "sender, receiver, body, created_at"
        ).eq("thread_id", payload.threadId).order("created_at", desc=False).execute()

        if not emails_res.data:
            raise HTTPException(status_code=404, detail="No emails found in this thread")

        # Format context
        context_parts = []
        for idx, e in enumerate(emails_res.data):
            context_parts.append(
                f"Email #{idx + 1}\n"
                f"From: {e.get('sender')}\n"
                f"To: {e.get('receiver')}\n"
                f"Date: {e.get('created_at')}\n"
                f"Content:\n{e.get('body')}"
            )
        thread_context = "\n\n=====================\n\n".join(context_parts)

        # 2. Call Gemini
        logger.info(f"[Reply Router] Drafting reply for thread {payload.threadId} (Tone: {payload.tone})")
        draft = await generate_email_reply(thread_context, payload.instruction, payload.tone)

        return {"success": True, "reply": draft}
    except Exception as e:
        logger.error(f"[Reply Router] Draft generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/send")
async def send_thread_reply(
    payload: ReplySendRequest,
    _log: str = Depends(log_auth_header),
    user_id: str = Depends(get_current_user_id)
):
    try:
        supabase = get_supabase_admin_client()

        # 1. Fetch user credentials
        profile_res = supabase.table("users").select(
            "google_access_token, google_refresh_token, google_token_expires_at, email"
        ).eq("id", user_id).single().execute()

        if not profile_res.data:
            raise HTTPException(status_code=404, detail="User profile not initialized in database")

        profile = profile_res.data
        access_token = profile.get("google_access_token")
        refresh_token = profile.get("google_refresh_token")
        expires_at_str = profile.get("google_token_expires_at")
        sender_email = profile.get("email") or "you@mailmind.ai"

        # Check token expiration and refresh if needed
        is_expired = False
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            if (expires_at - datetime.now(timezone.utc)).total_seconds() < 60:
                is_expired = True

        if (is_expired or not access_token) and refresh_token:
            try:
                logger.info(f"[Reply Router] Refreshing Google OAuth access token for user {user_id}")
                refresh_res = await refresh_google_access_token(refresh_token)
                access_token = refresh_res["accessToken"]
                
                # Save new access token
                new_expires = (datetime.now(timezone.utc) + timedelta(seconds=refresh_res["expiresIn"])).isoformat()
                supabase.table("users").update({
                    "google_access_token": access_token,
                    "google_token_expires_at": new_expires
                }).eq("id", user_id).execute()

                logger.info(f"Access token refreshed successfully")
                logger.info(f"New expiry: {new_expires}")
            except Exception as token_err:
                logger.error(f"[Reply Router] Access token refresh failed: {token_err}")
                raise HTTPException(status_code=412, detail="Google OAuth access expired. Please reconnect settings.")

        if not access_token:
            raise HTTPException(status_code=412, detail="Google OAuth credentials are missing or expired.")

        # 2. Fetch original thread context
        thread_res = supabase.table("threads").select(
            "gmail_thread_id, subject, category"
        ).eq("id", payload.threadId).single().execute()

        if not thread_res.data:
            raise HTTPException(status_code=404, detail="Original thread context not found in DB")
        
        thread = thread_res.data

        # 3. Fetch latest email in thread to extract headers and sender
        emails_res = supabase.table("emails").select(
            "sender, gmail_message_id"
        ).eq("thread_id", payload.threadId).order("created_at", desc=True).execute()

        if not emails_res.data:
            raise HTTPException(status_code=404, detail="Original email details not found in DB")

        # Find the latest email that was NOT sent by the current user
        latest_external_email = None
        for e in emails_res.data:
            sender_val = e.get("sender", "")
            if sender_email.lower() not in sender_val.lower():
                latest_external_email = e
                break

        # Fallback to the latest email in the thread if all were sent by the user (shouldn't normally happen)
        if not latest_external_email:
            latest_external_email = emails_res.data[0]

        original_gmail_id = emails_res.data[0]["gmail_message_id"]

        # Fetch actual RFC822 Message-ID header from Gmail API for correct threading
        try:
            original_details = await fetch_gmail_message_details(access_token, original_gmail_id)
            original_message_id = original_details.get("messageIdHeader")
        except Exception as api_err:
            logger.warning(f"Could not fetch messageIdHeader from Gmail: {api_err}")
            original_message_id = f"<{original_gmail_id}@mail.gmail.com>"

        # Extract recipient email address
        selected_sender = latest_external_email["sender"]
        match = re.search(r"<([^>]+)>", selected_sender)
        recipient_email = match.group(1) if match else selected_sender

        logger.info(f"Recipient Resolution: sender_email={sender_email}, selected external sender={selected_sender}, final recipient_email={recipient_email}")

        # Compose subject header
        subject = thread["subject"]
        if not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"

        # 4. Dispatch email to Gmail
        logger.info(f"Using access token prefix: {access_token[:20]}")
        logger.info(f"[Reply Router] Dispatched reply on thread {payload.threadId} to {recipient_email}")
        sent_data = await send_gmail_email(
            access_token,
            recipient_email,
            subject,
            payload.replyBody,
            thread["gmail_thread_id"],
            original_message_id
        )

        logger.info(f"Gmail returned 200: Message ID={sent_data['id']}, Thread ID={sent_data['threadId']}")
        print(f"Gmail returned 200: Message ID={sent_data['id']}, Thread ID={sent_data['threadId']}")

        # 5. Log the reply message in Supabase
        supabase.table("emails").insert({
            "thread_id": payload.threadId,
            "gmail_message_id": sent_data["id"],
            "sender": sender_email,
            "receiver": recipient_email,
            "body": payload.replyBody,
            "category": thread["category"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()

        # Update thread timestamps
        supabase.table("threads").update({
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", payload.threadId).execute()

        return {"success": True, "messageId": sent_data["id"]}
    except Exception as e:
        logger.error(f"[Reply Router] Send reply failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gmail API send failed: {str(e)}")
