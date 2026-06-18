import logging
from fastapi import APIRouter, Depends, HTTPException
from app.schemas import ChatRequest
from app.dependencies.auth import get_current_user_id
from app.services.supabase_client import (
    get_supabase_client,
    get_supabase_admin_client
)
from app.services.retrieval import search_relevant_emails
from app.services.gemini import query_emails_chat

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI Chat"])

@router.post("/chat")
async def chat_with_emails(
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_id)
):
    try:
        supabase = get_supabase_admin_client()


        # 1. RAG Context Retrieval: Calculate similarity embeddings and search DB
        matched_emails = await search_relevant_emails(supabase, user_id, payload.question, 10)

        # Format retrieved contexts
        if matched_emails:
            context_parts = []
            for idx, e in enumerate(matched_emails):
                context_parts.append(
                    f"--- Email #{idx + 1} ---\n"
                    f"Subject: {e.get('subject', '(No Subject)')}\n"
                    f"From: {e.get('sender')}\n"
                    f"To: {e.get('receiver')}\n"
                    f"Date: {e.get('created_at')}\n"
                    f"Similarity Score: {int(e.get('similarity', 0.85) * 100)}%\n"
                    f"Content:\n{e.get('body')}"
                )
            emails_context = "\n\n".join(context_parts)
        else:
            emails_context = "No relevant emails matching your query were found in your inbox database."

        # 2. Format chat history for Gemini (roles: 'user' or 'model')
        formatted_history = []
        if payload.history:
            for turn in payload.history:
                role = "model" if turn.get("role") == "assistant" else "user"
                content = turn.get("content")
                if content:
                    formatted_history.append({
                        "role": role,
                        "parts": [{"text": str(content)}]
                    })

        # 3. Call Gemini to answer question using context
        logger.info(f"[Chat Router] Submitting prompt: \"{payload.question[:35]}\" with {len(matched_emails)} emails context")
        answer = await query_emails_chat(payload.question, emails_context, formatted_history)

        # 4. Log chat conversation history in Supabase
        supabase.table("chat_history").insert({
            "user_id": user_id,
            "question": payload.question,
            "answer": answer
        }).execute()

        return {"success": True, "answer": answer}
    except Exception as e:
        logger.error(f"[Chat Router] Query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
