import logging
from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import get_current_user_id
from app.services.supabase_client import get_supabase_admin_client
from app.services.newsletter import generate_newsletter_clusters

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/newsletters", tags=["Newsletters Insights"])

@router.get("/deduplicate")
async def get_newsletter_clusters(user_id: str = Depends(get_current_user_id)):
    try:
        supabase = get_supabase_admin_client()
        
        # Check if clusters already computed in database
        response = supabase.table("newsletter_clusters").select(
            "topic, summary, source_emails, created_at"
        ).eq("user_id", user_id).execute()

        if response.data:
            # Map database keys to expected casing for frontend
            formatted_data = []
            for item in response.data:
                formatted_data.append({
                    "topic": item["topic"],
                    "summary": item["summary"],
                    "sourceEmails": item["source_emails"],
                    "created_at": item["created_at"]
                })
            return {"success": True, "clusters": formatted_data}

        # If empty, calculate on-the-fly
        logger.info(f"[Newsletters Router] Clusters empty in database. Generating on-the-fly for {user_id}")
        clusters = await generate_newsletter_clusters(supabase, user_id)
        return {"success": True, "clusters": clusters}
    except Exception as e:
        logger.error(f"[Newsletters Router] GET deduplicate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/deduplicate")
async def force_recalculate_clusters(user_id: str = Depends(get_current_user_id)):
    try:
        supabase = get_supabase_admin_client()
        
        logger.info(f"[Newsletters Router] Force recalculating newsletter clusters for {user_id}")
        clusters = await generate_newsletter_clusters(supabase, user_id)
        return {"success": True, "clusters": clusters}
    except Exception as e:
        logger.error(f"[Newsletters Router] POST deduplicate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
