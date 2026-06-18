import logging
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

def configure_genai():
    if not settings.is_gemini_configured:
        raise ValueError("Gemini API key is not configured. Please add a valid GEMINI_API_KEY to your environment variables.")
    genai.configure(api_key=settings.gemini_api_key)

async def get_embedding(text: str) -> list[float]:
    configure_genai()
    
    candidate_models = [
        "models/text-embedding-004",
        "models/gemini-embedding-001",
        "models/gemini-embedding-2"
    ]
    
    for model_name in candidate_models:
        try:
            result = genai.embed_content(
                model=model_name,
                content=text,
                task_type="retrieval_document"
            )
            if "embedding" in result:
                return result["embedding"][:768]
        except Exception as e:
            logger.warning(
                f"Embedding model failed: {model_name} -> {e}"
            )
            continue
            
    raise RuntimeError(
        "All embedding models failed."
    )

