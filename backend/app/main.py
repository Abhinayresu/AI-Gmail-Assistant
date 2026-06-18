import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, sync, chat, compose, reply, newsletters

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger("backend")

app = FastAPI(
    title="MailMind AI Backend",
    description="Python FastAPI backend engine orchestrating Gmail sync, Gemini models, pgvector search, and newsletter clustering.",
    version="1.0.0"
)

# Configure CORS Middleware (Allow Next.js dev and production URLs)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for simple Next.js local proxies, tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(chat.router)
app.include_router(compose.router)
app.include_router(reply.router)
app.include_router(newsletters.router)

@app.get("/health", tags=["Health Status"])
async def health_check():
    """
    Standard service health check endpoint.
    """
    return {
        "status": "healthy",
        "service": "MailMind AI Backend Engine",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting MailMind AI Backend Engine...")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)

