import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.schemas import GoogleAuthRequest
from app.dependencies.auth import get_token_from_header, get_current_user_id
from app.services.supabase_client import get_supabase_client, get_supabase_admin_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/google")
async def save_google_token(
    payload: GoogleAuthRequest,
    user_id: str = Depends(get_current_user_id),
    token: str = Depends(get_token_from_header)
):
    try:
        supabase = get_supabase_client()
        admin_supabase = get_supabase_admin_client()

        # Retrieve Google profile data from the active session
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Session invalid")

        user = user_response.user
        metadata = user.user_metadata or {}

        # Compute expiration time
        expires_seconds = payload.expires_in or 3600
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_seconds)).isoformat()

        # Build upsert profile payload
        user_payload = {
            "id": user_id,
            "email": user.email,
            "name": metadata.get("full_name") or metadata.get("name") or None,
            "avatar": metadata.get("avatar_url") or None,
            "google_access_token": payload.provider_token,
            "google_token_expires_at": expires_at,
        }

        # Google refresh token is only sent on first consent prompt
        if payload.provider_refresh_token:
            user_payload["google_refresh_token"] = payload.provider_refresh_token

        # Write to database (use admin client to bypass possible RLS insert locks)
        db_res = admin_supabase.table("users").upsert(user_payload).execute()
        if not db_res.data:
            raise HTTPException(status_code=500, detail="Failed to save credentials to user profile database")

        return {"success": True}
    except Exception as e:
        logger.error(f"[Router Auth] Google token save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
