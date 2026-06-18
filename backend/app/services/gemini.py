import asyncio
import json
import logging
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

# Ordered fallback chain — tries cheapest model first, escalates on 429
SUMMARIZE_MODEL_CHAIN = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]

def configure_genai():
    if not settings.is_gemini_configured:
        raise ValueError(
            "Gemini API key is not configured. "
            "Please add a valid GEMINI_API_KEY to your environment variables."
        )
    genai.configure(api_key=settings.gemini_api_key)

def get_genai():
    configure_genai()
    return genai

# ── Email categorization ──────────────────────────────────────────────────────

async def categorize_email(subject: str, body: str) -> str:
    configure_genai()
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        prompt = (
            "Analyze the following email subject and body. "
            "Classify it into exactly one of these categories: "
            "Work, Personal, Finance, Newsletter, Job, Notification.\n"
            "Do not output any introductory or explanatory text. "
            "Output ONLY the category word.\n\n"
            f"Subject: {subject}\nBody: {body}\n\nCategory:"
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(temperature=0.1)
        )
        text = response.text.strip()
        valid_categories = ["Work", "Personal", "Finance", "Newsletter", "Job", "Notification"]
        for cat in valid_categories:
            if cat.lower() in text.lower():
                return cat
        return "Work"
    except Exception as e:
        logger.error(f"[Gemini Service] Classification failed: {e}. Falling back to 'Work'")
        return "Work"

# ── Body cleaning ─────────────────────────────────────────────────────────────

def clean_email_body(body: str) -> str:
    if not body:
        return ""
    import re
    lines = body.splitlines()
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip quoted lines (starting with >)
        if stripped.startswith(">"):
            continue
        # Skip common reply dividers/headers
        if re.search(r"^on\s+.*wrote\s*:\s*$", stripped, re.IGNORECASE):
            continue
        cleaned_lines.append(line)
    return "\n".join(cleaned_lines).strip()

# ── Summarization with model fallback chain ───────────────────────────────────

async def summarize_email_thread(emails: list) -> str:
    """
    Summarize an email thread using Gemini.

    Tries models in SUMMARIZE_MODEL_CHAIN order.
    On 429 ResourceExhausted, moves to the next model.
    Raises the final exception if all models are exhausted.
    """
    configure_genai()

    email_transcript = ""
    for i, e in enumerate(emails):
        cleaned_body = clean_email_body(e.get("body"))
        email_transcript += (
            f"--- Email #{i + 1} ---\n"
            f"From: {e.get('sender')}\n"
            f"Date: {e.get('date')}\n"
            f"Content:\n{cleaned_body}\n\n"
        )

    prompt = f"""You are MailMind AI.

Summarize ONLY the provided email thread.

Rules:

* Use only information present in the thread.
* Ignore previous emails, chat history, memories, vector search results, and unrelated context.
* Ignore HTML, CSS, tracking links, unsubscribe links, and email signatures.
* Do not invent facts.
* Do not assume missing information.
* Adapt naturally to any email type:

  * work
  * personal
  * finance
  * newsletters
  * job applications
  * support tickets
  * notifications

Output:

\u2022 Main topic

\u2022 Important information

\u2022 Actions required

\u2022 Deadlines or dates (if any)

THREAD:

{email_transcript}
"""

    last_exception = None

    for model_name in SUMMARIZE_MODEL_CHAIN:
        try:
            logger.info(f"[Gemini Service] Trying summarization with model: {model_name}")
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            result = response.text.strip()
            logger.info(f"[Gemini Service] Summarization succeeded with model: {model_name}")
            return result

        except Exception as e:
            error_str = str(e)
            is_quota_error = (
                "429" in error_str
                or "ResourceExhausted" in type(e).__name__
                or "quota" in error_str.lower()
                or "RESOURCE_EXHAUSTED" in error_str
            )

            if is_quota_error:
                logger.warning(
                    f"[Gemini Service] Model '{model_name}' hit quota limit (429). "
                    f"Falling back to next model in chain."
                )
                last_exception = e
                continue  # try next model
            else:
                # Non-quota error — don't try other models
                logger.error(f"[Gemini Service] Summarization failed on '{model_name}': {e}")
                raise e

    # All models exhausted
    logger.error(
        f"[Gemini Service] All models in fallback chain exhausted. "
        f"Last error: {last_exception}"
    )
    raise last_exception

# ── Reply generation ──────────────────────────────────────────────────────────

async def generate_email_reply(thread_context: str, user_instruction: str, tone: str) -> str:
    configure_genai()
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        prompt = (
            "You are a professional email assistant. "
            "Draft a reply to the email conversation context.\n"
            "Apply the user's specific instructions and respect the requested tone.\n\n"
            f"Thread context:\n{thread_context}\n\n"
            f'User instructions for reply:\n"{user_instruction}"\n\n'
            f"Requested Tone: {tone}\n\n"
            "Draft the reply now. Output ONLY the text of the email reply. "
            "Do not add metadata, explanations or email wrappers unless part of the body.\n\n"
            "Email Reply Draft:"
        )
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"[Gemini Service] Reply generation failed: {e}")
        raise e

# ── Chat / RAG query ──────────────────────────────────────────────────────────

async def query_emails_chat(query: str, emails_context: str, chat_history: list) -> str:
    configure_genai()
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")

        # Convert history to google.generativeai Content objects
        history_formatted = []
        for turn in chat_history:
            history_formatted.append(
                genai.types.Content(
                    role=turn.get("role"),
                    parts=[
                        genai.types.Part.from_text(text=p.get("text", ""))
                        for p in turn.get("parts", [])
                    ]
                )
            )

        chat = model.start_chat(history=history_formatted)
        prompt = (
            "You are MailMind AI, an email virtual assistant. "
            "You help the user search and understand their inbox.\n"
            "Answer the user's question using the provided context of email threads. "
            "Be concise, direct, and refer to specific senders or subject lines when available. "
            "If the information is not present in the context, say that you cannot find "
            "this information in their email sync history.\n\n"
            f"Email Context:\n{emails_context}\n\n"
            f"User Query: {query}"
        )
        response = chat.send_message(prompt)
        return response.text.strip()
    except Exception as e:
        logger.error(f"[Gemini Service] Chat agent query failed: {e}")
        raise e

# ── Standalone email compose ──────────────────────────────────────────────────

async def generate_new_email(instruction: str, tone: str, length: str) -> dict:
    configure_genai()
    try:
        model = genai.GenerativeModel("gemini-2.5-flash-lite")
        prompt = (
            "You are a professional email virtual assistant. "
            "Write a brand new email based on the following specifications:\n"
            f'- Instructions: "{instruction}"\n'
            f'- Tone: "{tone}"\n'
            f'- Length styling: "{length}"\n\n'
            "You must return your response in the following exact JSON schema:\n"
            '{{\n'
            '  "subject": "The generated email subject line",\n'
            '  "body": "The generated email body text"\n'
            '}}\n'
            "Output only the JSON block. "
            "Do not add any markup language or introduction tags outside of the JSON."
        )
        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.7
            )
        )
        text = response.text.strip()
        data = json.loads(text)
        if "subject" not in data or "body" not in data:
            raise ValueError("Invalid schema returned by Gemini.")
        return data
    except Exception as e:
        logger.error(f"[Gemini Service] Standalone compose failed: {e}")
        raise e
