import base64
import email
import logging
from email.mime.text import MIMEText
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

def is_placeholder(val: str) -> bool:
    if not val:
        return True
    return "placeholder" in val or "your-" in val

async def refresh_google_access_token(refresh_token: str) -> dict:
    client_id = settings.google_client_id
    client_secret = settings.google_client_secret

    if is_placeholder(client_id) or is_placeholder(client_secret) or is_placeholder(refresh_token):
        raise ValueError("Google OAuth Client ID, Secret, or Refresh Token are placeholder values or missing. Please configure them in your .env.local file.")

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                }
            )

            if res.status_code != 200:
                raise ValueError(f"Failed to refresh Google token: {res.status_code} - {res.text}")

            data = res.json()
            return {
                "accessToken": data["access_token"],
                "expiresIn": data["expires_in"]
            }
    except Exception as e:
        logger.error(f"[Gmail Service] Token refresh failed: {e}")
        raise e

async def fetch_gmail_message_ids(
    access_token: str,
    last_sync_time_iso: str = None,
    max_results: int = 20
) -> list:
    if access_token.startswith("mock-access-token"):
        raise ValueError("Gmail operations require real API credentials. Access token is placeholder/mock.")

    try:
        query_params = {"maxResults": str(max_results)}
        
        if last_sync_time_iso:
            # Parse ISO date and get seconds since epoch
            from datetime import datetime
            dt = datetime.fromisoformat(last_sync_time_iso.replace("Z", "+00:00"))
            epoch_seconds = int(dt.timestamp())
            query_params["q"] = f"after:{epoch_seconds}"

        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                },
                params=query_params
            )

            if res.status_code != 200:
                raise ValueError(f"Gmail API List failed: {res.status_code} - {res.text}")

            data = res.json()
            return data.get("messages") or []
    except Exception as e:
        logger.error(f"[Gmail Service] Listing messages failed: {e}")
        return []

def get_message_body(payload: dict) -> str:
    if not payload:
        return ""
    
    # 1. Check if body is in the payload itself
    body_data = payload.get("body", {}).get("data")
    if body_data:
        try:
            return base64.urlsafe_b64decode(body_data).decode("utf-8")
        except Exception:
            pass

    # 2. Iterate recursively on parts
    parts = payload.get("parts")
    if parts:
        return parse_parts(parts)

    return ""

def parse_parts(parts: list) -> str:
    # A. Search for plain text MIME first
    for p in parts:
        if p.get("mimeType") == "text/plain":
            body_data = p.get("body", {}).get("data")
            if body_data:
                try:
                    return base64.urlsafe_b64decode(body_data).decode("utf-8")
                except Exception:
                    pass

    # B. Fallback to HTML parsing
    for p in parts:
        if p.get("mimeType") == "text/html":
            body_data = p.get("body", {}).get("data")
            if body_data:
                try:
                    raw_html = base64.urlsafe_b64decode(body_data).decode("utf-8")
                    # Basic strip of tags to save storage
                    import re
                    # Remove styles/scripts
                    raw_html = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", raw_html, flags=re.I)
                    raw_html = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", raw_html, flags=re.I)
                    # Strip other HTML tags
                    raw_html = re.sub(r"<[^>]*>", " ", raw_html)
                    # Deduplicate whitespace
                    raw_html = re.sub(r"\s+", " ", raw_html).strip()
                    return raw_html
                except Exception:
                    pass

    # C. Recursively search children
    for p in parts:
        child_parts = p.get("parts")
        if child_parts:
            body = parse_parts(child_parts)
            if body:
                return body

    return ""

async def fetch_gmail_message_details(access_token: str, message_id: str) -> dict:
    if access_token.startswith("mock-access-token") or message_id.startswith("mock-msg-"):
        raise ValueError("Gmail operations require real API credentials.")

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{message_id}?format=full",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                }
            )

            if res.status_code != 200:
                raise ValueError(f"Gmail API Get failed for message {message_id}: {res.status_code} - {res.text}")

            data = res.json()
            payload = data.get("payload") or {}
            headers = payload.get("headers") or []

            def get_header(name: str) -> str:
                for h in headers:
                    if h.get("name", "").lower() == name.lower():
                        return h.get("value") or ""
                return ""

            import email.utils
            from datetime import datetime, timezone

            subject = get_header("subject") or "(No Subject)"
            sender = get_header("from") or "Unknown Sender"
            receiver = get_header("to") or "Unknown Recipient"
            date_str = get_header("date") or ""
            message_id_header = get_header("message-id") or f"<{message_id}@gmail.com>"

            # Parse RFC 2822 email Date header to ISO 8601 format
            try:
                dt = email.utils.parsedate_to_datetime(date_str)
                date_iso = dt.isoformat()
            except Exception:
                date_iso = datetime.now(timezone.utc).isoformat()

            body = get_message_body(payload)

            return {
                "id": message_id,
                "threadId": data.get("threadId"),
                "subject": subject,
                "sender": sender,
                "receiver": receiver,
                "body": body,
                "date": date_iso,
                "messageIdHeader": message_id_header
            }
    except Exception as e:
        logger.error(f"[Gmail Service] Failed to retrieve email details for {message_id}: {e}")
        raise e

async def send_gmail_email(
    access_token: str,
    to: str,
    subject: str,
    body: str,
    thread_id: str = None,
    in_reply_to_header: str = None
) -> dict:
    if access_token.startswith("mock-access-token"):
        raise ValueError("Gmail operations require real API credentials.")

    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["To"] = to
        msg["Subject"] = subject
        
        if thread_id and in_reply_to_header:
            msg["In-Reply-To"] = in_reply_to_header
            msg["References"] = in_reply_to_header

        raw_msg = msg.as_string()
        base64url = base64.urlsafe_b64encode(raw_msg.encode("utf-8")).decode("utf-8").replace("=", "")

        payload = {"raw": base64url}
        if thread_id:
            payload["threadId"] = thread_id

        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json=payload
            )

            if res.status_code != 200:
                raise ValueError(f"Gmail API Send failed: {res.status_code} - {res.text}")

            data = res.json()
            return {
                "id": data["id"],
                "threadId": data["threadId"]
            }
    except Exception as e:
        logger.error(f"[Gmail Service] Send email failed: {e}")
        raise e

async def create_gmail_draft(
    access_token: str,
    to: str,
    subject: str,
    body: str
) -> dict:
    if access_token.startswith("mock-access-token"):
        raise ValueError("Gmail operations require real API credentials.")

    try:
        msg = MIMEText(body, "plain", "utf-8")
        msg["To"] = to
        msg["Subject"] = subject
        
        raw_msg = msg.as_string()
        base64url = base64.urlsafe_b64encode(raw_msg.encode("utf-8")).decode("utf-8").replace("=", "")

        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "message": {
                        "raw": base64url
                    }
                }
            )

            if res.status_code != 200:
                raise ValueError(f"Gmail API Draft Create failed: {res.status_code} - {res.text}")

            data = res.json()
            return {"id": data["id"]}
    except Exception as e:
        logger.error(f"[Gmail Service] Draft creation failed: {e}")
        raise e
