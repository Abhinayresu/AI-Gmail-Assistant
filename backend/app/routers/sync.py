import asyncio
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import get_current_user_id
from app.services.supabase_client import get_supabase_admin_client
from app.services.gmail import (
    refresh_google_access_token,
    fetch_gmail_message_ids,
    fetch_gmail_message_details
)
from app.services.gemini import categorize_email, summarize_email_thread
from app.services.retrieval import store_email_embedding

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Synchronization"])

SYNC_LIMIT = 10

@router.post("/sync")
async def sync_gmail_inbox(
    thread_id: str = None,
    user_id: str = Depends(get_current_user_id)
):
    try:
        supabase = get_supabase_admin_client()

        if thread_id:
            logger.info(f"[Sync Router] Re-summarizing specific thread {thread_id} for user {user_id}")
            
            # Verify the thread belongs to this user
            thread_check = supabase.table("threads").select("user_id").eq("id", thread_id).execute()
            if not thread_check.data:
                raise HTTPException(status_code=404, detail="Thread not found")
            if thread_check.data[0]["user_id"] != user_id:
                raise HTTPException(status_code=403, detail="Not authorized to access this thread")

            # Fetch emails for this thread
            emails_res = supabase.table("emails").select(
                "sender, body, created_at"
            ).eq("thread_id", thread_id).order("created_at", desc=False).execute()

            if not emails_res.data:
                raise HTTPException(status_code=404, detail="No emails found in this thread to summarize")

            formatted_emails = [{
                "sender": e["sender"],
                "body": e["body"],
                "date": e["created_at"]
            } for e in emails_res.data]

            logger.info(f"[Sync Router] Summarizing thread {thread_id} using Gemini...")
            summary = await summarize_email_thread(formatted_emails)

            supabase.table("threads").update({
                "summary": summary,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", thread_id).execute()

            return {
                "success": True,
                "emailsSynced": 0,
                "threadsUpdated": 1,
                "message": "Thread summary regenerated successfully"
            }

        # 1. Fetch user credentials from DB
        profile_res = supabase.table("users").select(
            "google_access_token, google_refresh_token, google_token_expires_at, last_synced_at"
        ).eq("id", user_id).single().execute()

        if not profile_res.data:
            raise HTTPException(status_code=404, detail="User profile not initialized in database")

        profile = profile_res.data
        access_token = profile.get("google_access_token")
        refresh_token = profile.get("google_refresh_token")
        expires_at_str = profile.get("google_token_expires_at")
        last_synced_at = profile.get("last_synced_at")

        # 2. Check token expiration and refresh if needed
        is_expired = False
        if expires_at_str:
            expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
            # Expired or expiring within 60 seconds
            if (expires_at - datetime.now(timezone.utc)).total_seconds() < 60:
                is_expired = True

        if (is_expired or not access_token) and refresh_token:
            try:
                logger.info(f"[Sync Router] Refreshing Google OAuth access token for user {user_id}")
                refresh_res = await refresh_google_access_token(refresh_token)
                access_token = refresh_res["accessToken"]
                
                # Save new access token
                new_expires = (datetime.now(timezone.utc) + timedelta(seconds=refresh_res["expiresIn"])).isoformat()
                supabase.table("users").update({
                    "google_access_token": access_token,
                    "google_token_expires_at": new_expires
                }).eq("id", user_id).execute()
            except Exception as token_err:
                logger.error(f"[Sync Router] Access token refresh failed: {token_err}")
                raise HTTPException(status_code=412, detail="Google OAuth access expired. Please reconnect settings.")

        if not access_token:
            raise HTTPException(status_code=412, detail="Google OAuth credentials are missing or expired.")

        # 3. Poll message IDs from Gmail
        logger.info(f"[Sync Router] Listing messages since: {last_synced_at or 'Beginning'}")
        message_refs = await fetch_gmail_message_ids(access_token, last_synced_at, SYNC_LIMIT)

        if not message_refs:
            # Update sync stamp even if no messages
            supabase.table("users").update({
                "last_synced_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", user_id).execute()

            return {
                "success": True,
                "emailsSynced": 0,
                "threadsUpdated": 0,
                "message": "Inbox is already up to date"
            }

        emails_synced = 0
        modified_thread_ids = set()

        # 4. Fetch details and process each message
        for ref in message_refs:
            msg_id = ref["id"]
            
            # Check if email is already stored
            existing_email = supabase.table("emails").select("id").eq("gmail_message_id", msg_id).execute()
            if existing_email.data:
                continue

            try:
                logger.info(f"[Sync Router] Fetching details for message {msg_id}")
                details = await fetch_gmail_message_details(access_token, msg_id)
                
                # Classify email category using Gemini
                category = await categorize_email(details["subject"], details["body"])

                # Newsletter Deduplication requirement:
                # Before saving if category is "Newsletter", check if same sender and subject received in last 7 days
                if category == "Newsletter":
                    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
                    duplicate_check = supabase.table("emails").select(
                        "id, sender, created_at, threads!inner(subject)"
                    ).eq("sender", details["sender"]).eq("threads.subject", details["subject"]).gt("created_at", seven_days_ago).execute()
                    
                    if duplicate_check.data:
                        logger.info(f"[Sync Router] Newsletter deduplication: skipping duplicate item from {details['sender']} with subject \"{details['subject']}\"")
                        continue

                # Fetch or create thread container row in Supabase
                thread_db_id = ""
                existing_thread = supabase.table("threads").select("id").eq("user_id", user_id).eq("gmail_thread_id", details["threadId"]).execute()
                
                if existing_thread.data:
                    thread_db_id = existing_thread.data[0]["id"]
                else:
                    new_thread_res = supabase.table("threads").insert({
                        "user_id": user_id,
                        "gmail_thread_id": details["threadId"],
                        "subject": details["subject"],
                        "category": category,
                        "created_at": details["date"],
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).execute()
                    
                    if not new_thread_res.data:
                        logger.error(f"[Sync Router] Failed to insert thread for details: {details['threadId']}")
                        continue
                    thread_db_id = new_thread_res.data[0]["id"]

                # Insert email row
                new_email_res = supabase.table("emails").insert({
                    "thread_id": thread_db_id,
                    "gmail_message_id": details["id"],
                    "sender": details["sender"],
                    "receiver": details["receiver"],
                    "body": details["body"],
                    "category": category,
                    "created_at": details["date"]
                }).execute()

                if not new_email_res.data:
                    logger.error(f"[Sync Router] Failed to insert email message for {details['id']}")
                    continue
                email_db_id = new_email_res.data[0]["id"]

                # Generate and store embedding vectors for pgvector search
                await store_email_embedding(supabase, email_db_id, details["subject"], details["body"])

                emails_synced += 1
                modified_thread_ids.add(thread_db_id)

            except Exception as detail_err:
                logger.error(f"[Sync Router] Failed to process message details for {msg_id}: {detail_err}")

        # 5. Re-summarize modified threads using Gemini
        threads_updated = 0
        for thread_id in modified_thread_ids:
            try:
                emails_res = supabase.table("emails").select(
                    "sender, body, created_at"
                ).eq("thread_id", thread_id).order("created_at", desc=False).execute()

                if emails_res.data:
                    formatted_emails = [{
                        "sender": e["sender"],
                        "body": e["body"],
                        "date": e["created_at"]
                    } for e in emails_res.data]

                    logger.info(f"[Sync Router] Summarizing thread {thread_id} using Gemini...")
                    summary = await summarize_email_thread(formatted_emails)

                    supabase.table("threads").update({
                        "summary": summary,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }).eq("id", thread_id).execute()

                    threads_updated += 1
            except Exception as summary_err:
                logger.error(f"[Sync Router] Summarization failed for thread {thread_id}: {summary_err}")

        # 6. Update Sync timestamp in profile
        supabase.table("users").update({
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", user_id).execute()

        return {
            "success": True,
            "emailsSynced": emails_synced,
            "threadsUpdated": threads_updated
        }
    except Exception as e:
        logger.error(f"[Sync Router] Global sync failure: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync/repair-summaries")
async def repair_missing_summaries(
    user_id: str = Depends(get_current_user_id)
):
    """
    Finds all threads belonging to the authenticated user that have no summary
    and re-runs Gemini summarization on each one.

    Uses a 2-second delay between Gemini calls to stay within rate limits.
    Threads that already have a summary are skipped without any API call.
    Uses the SUMMARIZE_MODEL_CHAIN fallback (flash-lite -> flash -> 2.0-flash).

    Returns:
        total_checked   : threads with NULL summary found in DB
        summaries_generated : threads successfully summarized this run
        skipped         : threads that already had a summary (safety guard)
        failed          : threads where all Gemini models failed
        failures        : list of {thread_id, subject, error} for failed threads
    """
    supabase = get_supabase_admin_client()
    logger.info(f"[Repair] Starting repair-summaries for user {user_id}")

    # 1. Find all threads for this user that are missing a summary
    threads_res = supabase.table("threads").select(
        "id, subject, summary"
    ).eq("user_id", user_id).is_("summary", "null").execute()

    threads_to_repair = threads_res.data or []
    total_checked = len(threads_to_repair)

    logger.info(f"[Repair] Found {total_checked} thread(s) with NULL summary.")

    if not threads_to_repair:
        return {
            "success": True,
            "total_checked": 0,
            "summaries_generated": 0,
            "skipped": 0,
            "failed": 0,
            "failures": [],
            "message": "No threads with missing summaries found."
        }

    summaries_generated = 0
    skipped = 0
    failed = 0
    failures = []

    for i, thread in enumerate(threads_to_repair):
        thread_id = thread["id"]
        subject = thread.get("subject", "(no subject)")

        # 2. Guard: skip threads that somehow already have a summary
        if thread.get("summary") and thread["summary"].strip():
            logger.info(f"[Repair] Skipping thread '{subject}' — already has summary.")
            skipped += 1
            continue

        logger.info(
            f"[Repair] [{i + 1}/{total_checked}] Processing thread: '{subject}' "
            f"(id={thread_id[:8]}...)"
        )

        # 3. Fetch emails for this thread
        emails_res = supabase.table("emails").select(
            "sender, body, created_at"
        ).eq("thread_id", thread_id).order("created_at", desc=False).execute()

        if not emails_res.data:
            logger.warning(
                f"[Repair] Thread '{subject}' has no emails in DB — skipping."
            )
            skipped += 1
            continue

        formatted_emails = [
            {
                "sender": e["sender"],
                "body": e["body"],
                "date": e["created_at"]
            }
            for e in emails_res.data
        ]

        # 4. Attempt summarization with model fallback chain
        try:
            summary = await summarize_email_thread(formatted_emails)

            update_res = supabase.table("threads").update({
                "summary": summary,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }).eq("id", thread_id).execute()

            rows_updated = len(update_res.data) if update_res.data else 0
            if rows_updated > 0:
                summaries_generated += 1
                logger.info(
                    f"[Repair] Summary saved for thread '{subject}' "
                    f"({len(summary)} chars)."
                )
            else:
                failed += 1
                error_msg = "DB update returned 0 rows (possible RLS issue)"
                logger.error(f"[Repair] {error_msg} for thread '{subject}'")
                failures.append({"thread_id": thread_id, "subject": subject, "error": error_msg})

        except Exception as repair_err:
            failed += 1
            error_msg = str(repair_err)
            logger.error(
                f"[Repair] All Gemini models failed for thread '{subject}': {error_msg}"
            )
            failures.append({"thread_id": thread_id, "subject": subject, "error": error_msg})

        # 5. Rate-limit-safe delay between Gemini calls
        if i < total_checked - 1:
            logger.info("[Repair] Waiting 2s before next Gemini call...")
            await asyncio.sleep(2)

    logger.info(
        f"[Repair] Complete — checked={total_checked}, "
        f"generated={summaries_generated}, skipped={skipped}, failed={failed}"
    )

    return {
        "success": True,
        "total_checked": total_checked,
        "summaries_generated": summaries_generated,
        "skipped": skipped,
        "failed": failed,
        "failures": failures,
        "message": (
            f"Repair complete. {summaries_generated} summary(ies) generated, "
            f"{skipped} skipped, {failed} failed."
        )
    }
