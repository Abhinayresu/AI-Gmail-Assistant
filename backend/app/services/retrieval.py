import logging
import traceback
from supabase import Client
from app.services.embeddings import get_embedding

logger = logging.getLogger(__name__)

async def store_email_embedding(
    supabase: Client,
    email_id: str,
    subject: str,
    body: str
) -> None:
    try:
        text_to_embed = f"Subject: {subject}\n\nBody: {body}"
        embedding = await get_embedding(text_to_embed)

        # Print embedding diagnostic details
        logger.info(type(embedding))
        logger.info(len(embedding))
        logger.info(embedding[:5])

        res = supabase.table("email_embeddings").upsert(
            {
                "email_id": email_id,
                "embedding": embedding,
            },
            on_conflict="email_id"
        ).execute()
        
        logger.info(f"[Retrieval Service] Stored embedding for email: {email_id}")
    except Exception as e:
        logger.error(f"[Retrieval Service] Storing embedding failed for email {email_id}: {e}")
        logger.error(traceback.format_exc())

async def search_relevant_emails(
    supabase: Client,
    user_uuid: str,
    query: str,
    limit: int = 10
) -> list:
    try:
        # 1. Generate Query embedding
        logger.info(f"[Retrieval Service] Generating query embedding for chat query: {query[:30]}...")
        query_embedding = await get_embedding(query)

        # 2. Call Supabase RPC match function
        # Supabase Python RPC calls: client.rpc("function_name", {params})
        response = supabase.rpc("match_emails", {
            "query_embedding": query_embedding,
            "match_threshold": 0.2,
            "match_count": limit,
            "user_uuid": user_uuid,
        }).execute()

        # If data is returned, process matches
        if response.data:
            return response.data
        
        logger.warning("[Retrieval Service] RPC match_emails returned no results or is missing. Running keyword fallback.")
        return await run_keyword_fallback_search(supabase, user_uuid, query, limit)
    except Exception as e:
        logger.error(f"[Retrieval Service] Vector similarity search failed. Running keyword search fallback: {e}")
        return await run_keyword_fallback_search(supabase, user_uuid, query, limit)

async def run_keyword_fallback_search(
    supabase: Client,
    user_uuid: str,
    query: str,
    limit: int
) -> list:
    try:
        # Split terms and extract a clean query word
        words = [w for w in query.split() if len(w) > 3 and w.lower() not in ["what", "show", "discussion", "about", "find", "from"]]
        clean_word = words[0] if words else query

        # Fetch emails
        response = supabase.table("emails").select(
            "id, sender, receiver, body, created_at, threads(subject, user_id)"
        ).order("created_at", desc=True).execute()

        if not response.data:
            return []

        filtered_results = []
        for e in response.data:
            thread = e.get("threads") or {}
            # Enforce user isolation
            if thread.get("user_id") != user_uuid:
                continue

            text_to_match = f"{thread.get('subject', '')} {e.get('body', '')} {e.get('sender', '')}".lower()
            if clean_word.lower() in text_to_match:
                filtered_results.append({
                    "email_id": e["id"],
                    "subject": thread.get("subject") or "(No Subject)",
                    "sender": e["sender"],
                    "receiver": e["receiver"],
                    "body": e["body"],
                    "created_at": e["created_at"],
                    "similarity": 0.85 # Fallback score
                })

                if len(filtered_results) >= limit:
                    break

        return filtered_results
    except Exception as e:
        logger.error(f"[Retrieval Service] Keyword fallback search failed: {e}")
        return []
