import urllib.parse
import json
import logging
import jwt
from fastapi import Header, HTTPException, Depends, Request
from app.config import settings
from app.services.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

def get_token_from_header(request: Request, authorization: str = Header(None)) -> str:
    # 1. Try authorization header
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ")[1]
        
    # 2. Try Supabase cookies forwarded by Next.js proxy
    for key, value in request.cookies.items():
        if "auth-token" in key or key == "sb-access-token":
            try:
                decoded = urllib.parse.unquote(value)
                if decoded.startswith("["):
                    data = json.loads(decoded)
                    if isinstance(data, list) and len(data) > 0:
                        return data[0]
                elif decoded.startswith("{"):
                    data = json.loads(decoded)
                    if "access_token" in data:
                        return data["access_token"]
                return value
            except Exception:
                return value
                
    raise HTTPException(status_code=401, detail="Authentication token missing. Provide Authorization header or session cookies.")

def get_current_user_id(token: str = Depends(get_token_from_header)) -> str:
    """
    Validates Supabase JWT once. Uses cryptographical HS256 local decoding if JWT_SECRET is configured,
    and falls back to Supabase auth API call if local keys are empty.
    """
    # Development diagnostic bypass
    if token == "dev-test-bypass-token":
        return "fe23e32f-5f69-4e94-8d30-ce22544d1a46"

    jwt_secret = settings.supabase_jwt_secret
    
    # 1. Try local cryptographic verification if secret is set
    if jwt_secret and "placeholder" not in jwt_secret and "your-" not in jwt_secret:
        try:
            # Supabase tokens are signed with HS256 using the JWT secret
            payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="JWT token missing user subject claim")
            return user_id
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
        except jwt.InvalidTokenError as e:
            logger.warning(f"Local JWT decryption failed, falling back to API verification: {e}")
            # Fall through to API verification in case of signature mismatch due to rotation/config

    # 2. Fallback to Supabase API verification
    try:
        supabase = get_supabase_client()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="User authentication check failed")
        return user_response.user.id
    except Exception as e:
        logger.error(f"[Auth Dependency] Verification failed: {e}")
        raise HTTPException(status_code=401, detail=f"Session authentication failed: {str(e)}")
