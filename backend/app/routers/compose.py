import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.schemas import ComposeRequest, ComposeSendRequest
from app.dependencies.auth import get_current_user_id
from app.services.supabase_client import get_supabase_admin_client
from app.services.gemini import generate_new_email, categorize_email
from app.services.gmail import send_gmail_email, create_gmail_draft, refresh_google_access_token
from app.services.retrieval import store_email_embedding

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/compose", tags=["Email Compose"])

@router.post("")
async def generate_compose_draft(
    payload: ComposeRequest,
    user_id: str = Depends(get_current_user_id)
):
    try:
        logger.info(f"[Compose Router] Generating standalone AI draft")
        email_data = await generate_new_email(
            payload.instruction,
            payload.tone,
            payload.length
        )
        return {
            "success": True,
            "subject": email_data["subject"],
            "body": email_data["body"]
        }
    except Exception as e:
        logger.error(f"[Compose Router] Drafting failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/send")
async def send_composed_email(
    payload: ComposeSendRequest,
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
                logger.info(f"[Compose Router] Refreshing Google OAuth access token for user {user_id}")
                refresh_res = await refresh_google_access_token(refresh_token)
                access_token = refresh_res["accessToken"]
                
                # Save new access token
                new_expires = (datetime.now(timezone.utc) + timedelta(seconds=refresh_res["expiresIn"])).isoformat()
                supabase.table("users").update({
                    "google_access_token": access_token,
                    "google_token_expires_at": new_expires
                }).eq("id", user_id).execute()
            except Exception as token_err:
                logger.error(f"[Compose Router] Access token refresh failed: {token_err}")
                raise HTTPException(status_code=412, detail="Google OAuth access expired. Please reconnect settings.")

        if not access_token:
            raise HTTPException(status_code=412, detail="Google OAuth credentials are missing or expired.")

        if payload.action == "draft":
            logger.info(f"[Compose Router] Creating Gmail draft for {payload.to}")
            draft_data = await create_gmail_draft(access_token, payload.to, payload.subject, payload.emailBody)
            return {"success": True, "draftId": draft_data["id"]}

        # Action is 'send'
        logger.info(f"[Compose Router] Dispatching email to {payload.to}")
        sent_data = await send_gmail_email(
            access_token,
            payload.to,
            payload.subject,
            payload.emailBody
        )

        # Categorize sent email
        category = await categorize_email(payload.subject, payload.emailBody)

        # Insert new thread container
        new_thread_res = supabase.table("threads").insert({
            "user_id": user_id,
            "gmail_thread_id": sent_data["threadId"],
            "subject": payload.subject,
            "category": category,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "summary": f"• Drafted and sent a new email thread to {payload.to}.\n• Topic discussed: \"{payload.subject}\"."
        }).execute()

        if not new_thread_res.data:
            raise HTTPException(status_code=500, detail="Failed to log thread container in database")
        thread_db_id = new_thread_res.data[0]["id"]

        # Insert email details
        new_email_res = supabase.table("emails").insert({
            "thread_id": thread_db_id,
            "gmail_message_id": sent_data["id"],
            "sender": sender_email,
            "receiver": payload.to,
            "body": payload.emailBody,
            "category": category,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()

        if not new_email_res.data:
            raise HTTPException(status_code=500, detail="Failed to record email details in database")
        email_db_id = new_email_res.data[0]["id"]

        # Compute embeddings
        await store_email_embedding(supabase, email_db_id, payload.subject, payload.emailBody)

        return {"success": True, "messageId": sent_data["id"], "threadId": thread_db_id}
    except Exception as e:
        logger.error(f"[Compose Router] Compose dispatcher failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gmail API compose/send failed: {str(e)}")
