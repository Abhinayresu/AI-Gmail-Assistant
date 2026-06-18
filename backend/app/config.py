import os
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Search for env files in current folder, parent folder, and workspace root
load_dotenv()
if os.path.exists("../.env.local"):
    load_dotenv("../.env.local")
elif os.path.exists(".env.local"):
    load_dotenv(".env.local")

class Settings(BaseSettings):
    supabase_url: str = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    supabase_anon_key: str = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    @property
    def is_gemini_configured(self) -> bool:
        k = self.gemini_api_key
        return bool(k and "placeholder" not in k and "your-" not in k)

    @property
    def is_google_configured(self) -> bool:
        cid = self.google_client_id
        sec = self.google_client_secret
        return bool(cid and sec and "placeholder" not in cid and "placeholder" not in sec)

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
