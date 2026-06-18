from supabase import create_client, Client
from app.config import settings

def get_supabase_client() -> Client:
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise ValueError("Supabase URL and Anon Key are not configured in environment variables.")
    return create_client(settings.supabase_url, settings.supabase_anon_key)

def get_supabase_admin_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise ValueError("Supabase URL and Service Role Key are not configured in environment variables.")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
