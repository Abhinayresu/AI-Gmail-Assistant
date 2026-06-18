from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr

class GoogleAuthRequest(BaseModel):
    provider_token: str
    provider_refresh_token: Optional[str] = None
    expires_in: int

class ChatRequest(BaseModel):
    question: str
    history: Optional[List[Dict[str, Any]]] = None

class SummarizeRequest(BaseModel):
    threadId: str


class ComposeRequest(BaseModel):
    instruction: str
    tone: str
    length: str

class ComposeSendRequest(BaseModel):
    to: str
    subject: str
    emailBody: str
    action: str  # "send" or "draft"

class ReplyRequest(BaseModel):
    threadId: str
    instruction: str
    tone: str

class ReplySendRequest(BaseModel):
    threadId: str
    replyBody: str
