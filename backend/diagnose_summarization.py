"""
diagnose_summarization.py
--------------------------------------------------------------------------------
Traces the full summarization pipeline for every thread that has no summary.

For each thread prints:
  1. Thread ID
  2. Subject
  3. Thread content length (chars)
  4. Gemini request payload (reconstructed)
  5. Gemini response text (or error)
  6. Exception traceback (if any)
  7. Whether summary generation was skipped
  8. Whether summary was saved to threads.summary
  9. SQL update statement result (Supabase response)

Run from the backend/ directory:
    python diagnose_summarization.py

Or run without updating DB (read-only dry-run):
    python diagnose_summarization.py --dry-run
"""

import asyncio
import json
import os
import sys
import traceback
import logging
import io
from datetime import datetime, timezone

# ── Load env vars the same way config.py does ────────────────────────────────
from dotenv import load_dotenv
load_dotenv()
if os.path.exists("../.env.local"):
    load_dotenv("../.env.local", override=True)
elif os.path.exists(".env.local"):
    load_dotenv(".env.local", override=True)

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("diagnose_summarization")

DRY_RUN = "--dry-run" in sys.argv

# Force UTF-8 output on Windows to avoid cp1252 UnicodeEncodeError
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
else:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# Colour helpers (ANSI - works in Windows Terminal / PowerShell)
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def section(title: str):
    print(f"\n{BOLD}{CYAN}{'-'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'-'*60}{RESET}")

def ok(msg):    print(f"  {GREEN}[OK]  {msg}{RESET}")
def warn(msg):  print(f"  {YELLOW}[WARN] {msg}{RESET}")
def err(msg):   print(f"  {RED}[FAIL] {msg}{RESET}")
def info(msg):  print(f"  {CYAN}[INFO] {msg}{RESET}")

# ── Import app modules (after env is loaded) ──────────────────────────────────
try:
    from app.config import settings
    from app.services.supabase_client import get_supabase_admin_client
    from app.services.gemini import summarize_email_thread, configure_genai
    import google.generativeai as genai
except ImportError as e:
    print(f"\n{RED}[FATAL] Could not import app modules: {e}{RESET}")
    print("Make sure you are running from the backend/ directory with the venv active.")
    sys.exit(1)


# ── Pre-flight checks ─────────────────────────────────────────────────────────
async def preflight():
    section("PRE-FLIGHT: Configuration")

    if settings.is_gemini_configured:
        ok(f"GEMINI_API_KEY loaded (length={len(settings.gemini_api_key)})")
    else:
        err("GEMINI_API_KEY is missing or is a placeholder value.")
        sys.exit(1)

    if settings.supabase_url:
        ok(f"SUPABASE_URL: {settings.supabase_url}")
    else:
        err("NEXT_PUBLIC_SUPABASE_URL is not set.")
        sys.exit(1)

    if settings.supabase_service_role_key:
        ok(f"SUPABASE_SERVICE_ROLE_KEY loaded (length={len(settings.supabase_service_role_key)})")
    else:
        err("SUPABASE_SERVICE_ROLE_KEY is not set.")
        sys.exit(1)

    if DRY_RUN:
        warn("DRY-RUN mode — no writes will be made to threads.summary")
    else:
        info("Live mode — will attempt to write summaries if generation succeeds")


# ── Fetch threads with no summary ─────────────────────────────────────────────
def fetch_unsummarized_threads(supabase) -> list:
    section("STEP 1: Fetching threads with missing/empty summary")

    # Fetch threads where summary is null or empty string
    res = supabase.table("threads").select("id, subject, summary, category, created_at, updated_at").execute()

    if not res.data:
        warn("No threads found in database at all.")
        return []

    total = len(res.data)
    unsummarized = [t for t in res.data if not t.get("summary") or t["summary"].strip() == ""]
    summarized   = [t for t in res.data if t.get("summary") and t["summary"].strip() != ""]

    ok(f"Total threads in DB: {total}")
    ok(f"Threads WITH summary: {len(summarized)}")
    warn(f"Threads WITHOUT summary (target): {len(unsummarized)}")

    if unsummarized:
        print()
        for t in unsummarized:
            print(f"    • [{t['id'][:8]}...] \"{t['subject']}\"  category={t.get('category','?')}  updated={t.get('updated_at','?')[:10]}")

    return unsummarized


# ── Fetch emails for a thread ─────────────────────────────────────────────────
def fetch_thread_emails(supabase, thread_id: str) -> list:
    res = supabase.table("emails").select(
        "id, sender, body, created_at"
    ).eq("thread_id", thread_id).order("created_at", desc=False).execute()
    return res.data or []


# ── Reconstruct the Gemini prompt (mirrors gemini.py) ────────────────────────
def reconstruct_gemini_payload(formatted_emails: list) -> str:
    email_transcript = ""
    for i, e in enumerate(formatted_emails):
        body = e.get("body") or ""
        email_transcript += f"--- Email #{i + 1} ---\nFrom: {e.get('sender')}\nDate: {e.get('date')}\nContent:\n{body}\n\n"

    return f"""You are MailMind AI, an intelligent email assistant.

Your task is to summarize ONLY the email thread provided.

STRICT RULES:
1. Use ONLY information contained inside the provided email thread.
...

EMAIL THREAD:
{email_transcript}

Summary:"""


# ── Core diagnostic per thread ────────────────────────────────────────────────
async def diagnose_thread(supabase, thread: dict, index: int, total: int):
    thread_id = thread["id"]
    subject   = thread.get("subject", "(no subject)")

    section(f"THREAD {index}/{total}  [{thread_id[:8]}...]")

    # ── 1. Thread ID & Subject ───────────────────────────────────────────────
    print(f"  {'Thread ID:':<28} {thread_id}")
    print(f"  {'Subject:':<28} {subject}")
    print(f"  {'Category:':<28} {thread.get('category', 'N/A')}")
    print(f"  {'Created:':<28} {thread.get('created_at', 'N/A')[:19]}")
    print(f"  {'Updated:':<28} {thread.get('updated_at', 'N/A')[:19]}")
    print(f"  {'Current summary:':<28} {repr(thread.get('summary', None))}")

    # ── 2. Fetch emails in thread ────────────────────────────────────────────
    print()
    info("Fetching emails from this thread...")
    emails = fetch_thread_emails(supabase, thread_id)

    if not emails:
        err("NO EMAILS found for this thread in the emails table.")
        warn("→ SKIP REASON: emails table has 0 rows for this thread_id.")
        warn("→ Summary generation was SKIPPED (no content to summarize).")
        print(f"  {'Summary saved:':<28} NO")
        return

    ok(f"Found {len(emails)} email(s) in thread.")

    # ── 3. Thread content length ─────────────────────────────────────────────
    formatted_emails = [{"sender": e["sender"], "body": e["body"] or "", "date": e["created_at"]} for e in emails]
    total_chars = sum(len(e["body"]) for e in formatted_emails)
    print(f"  {'Thread content length:':<28} {total_chars} chars  ({len(emails)} messages)")

    if total_chars == 0:
        warn("All email bodies are EMPTY (0 chars).")
        warn("-> SKIP REASON: Gemini will receive an effectively empty thread body.")

    # -- 4. Gemini request payload --------------------------------------------
    print()
    info("Reconstructed Gemini request payload (first 600 chars of email transcript):")
    payload_preview = reconstruct_gemini_payload(formatted_emails)
    print(f"{YELLOW}{'-'*60}{RESET}")
    print(payload_preview[:600] + ("..." if len(payload_preview) > 600 else ""))
    print(f"{YELLOW}{'-'*60}{RESET}")
    print(f"  {'Full payload length:':<28} {len(payload_preview)} chars")

    # -- 5 & 6. Call Gemini — capture response or exception -------------------
    print()
    info("Calling summarize_email_thread() ...")

    gemini_response_text = None
    exception_occurred = False
    generation_skipped = False
    summary_saved = False
    update_result = None

    try:
        gemini_response_text = await summarize_email_thread(formatted_emails)

        ok(f"Gemini responded successfully.")
        print(f"\n  {BOLD}Gemini Response:{RESET}")
        print(f"{GREEN}{'-'*60}{RESET}")
        print(gemini_response_text)
        print(f"{GREEN}{'-'*60}{RESET}")
        print(f"  {'Response length:':<28} {len(gemini_response_text)} chars")

    except Exception as exc:
        exception_occurred = True
        generation_skipped = True
        err(f"Gemini call FAILED with exception: {type(exc).__name__}: {exc}")
        print()
        print(f"{RED}  -- Exception Traceback ------------------------------------------{RESET}")
        traceback.print_exc(file=sys.stdout)
        print(f"{RED}  ----------------------------------------------------------------{RESET}")

    # -- 7. Was generation skipped? -------------------------------------------
    print()
    if generation_skipped:
        err(f"{'Summary generation skipped:':<28} YES  (exception occurred above)")
    else:
        ok(f"{'Summary generation skipped:':<28} NO  (Gemini returned a result)")

    # ── 8 & 9. Save to threads.summary ──────────────────────────────────────
    if gemini_response_text and not exception_occurred:
        if DRY_RUN:
            warn(f"{'Summary saved to threads.summary:':<28} SKIPPED (dry-run mode)")
            warn("Would have written:")
            print(f"    UPDATE threads SET summary=<{len(gemini_response_text)} chars> WHERE id='{thread_id}'")
        else:
            info("Writing summary to threads.summary ...")
            try:
                update_result = supabase.table("threads").update({
                    "summary": gemini_response_text,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", thread_id).execute()

                rows_affected = len(update_result.data) if update_result.data else 0
                if rows_affected > 0:
                    summary_saved = True
                    ok(f"{'Summary saved:':<28} YES  ({rows_affected} row(s) updated)")
                    print(f"  {'SQL update result:':<28} {json.dumps(update_result.data[0] if update_result.data else {})[:200]}")
                else:
                    err(f"{'Summary saved:':<28} NO  — update returned 0 rows (RLS block or thread_id mismatch?)")
                    print(f"  {'Update response data:':<28} {update_result.data}")

            except Exception as db_exc:
                err(f"{'Summary saved:':<28} NO  -- DB write exception: {db_exc}")
                traceback.print_exc(file=sys.stdout)
    else:
        err(f"{'Summary saved:':<28} NO  — generation failed, nothing to write")


# ── Root-cause analysis summary ───────────────────────────────────────────────
def print_root_cause_legend():
    section("ROOT-CAUSE LEGEND")
    print(f"""
  The following are the known skip/failure paths in sync.py:

  {YELLOW}PATH A -- Thread already existed, email already existed:{RESET}
    Line 132-134: existing_email.data -> continue
    -> Thread is never added to modified_thread_ids
    -> Summarization loop never runs for this thread
    -> Summary column stays NULL forever

  {YELLOW}PATH B -- Newsletter deduplication skip:{RESET}
    Line 151-153: duplicate_check.data -> continue
    -> Email and thread row are never created
    -> Thread not in modified_thread_ids

  {YELLOW}PATH C -- Thread insert failed silently:{RESET}
    Line 171-173: not new_thread_res.data -> continue
    -> Thread created but no DB id returned
    -> Never added to modified_thread_ids

  {YELLOW}PATH D -- Email insert failed silently:{RESET}
    Line 187-189: not new_email_res.data -> continue
    -> email_db_id missing
    -> Thread id never added to modified_thread_ids

  {YELLOW}PATH E -- Gemini summarization exception caught silently:{RESET}
    Line 225-226: except Exception as summary_err -> logger.error (no re-raise)
    -> Thread stays unsummarized, no retry

  {YELLOW}PATH F -- Empty email body from Gmail:{RESET}
    get_message_body() returns "" for some MIME types
    -> Gemini gets blank content, may still respond or may return empty

  {RED}CRITICAL: modified_thread_ids only contains threads from the CURRENT sync batch.{RESET}
  Any thread that was synced in a previous run but had a Gemini failure
  will NEVER be re-summarized unless explicitly triggered via POST /sync?thread_id=<id>
    """)


# ── Entry point ───────────────────────────────────────────────────────────────
async def main():
    print(f"\n{BOLD}{'='*60}{RESET}")
    print(f"{BOLD}  MailMind AI - Summarization Pipeline Diagnostic{RESET}")
    print(f"{BOLD}{'='*60}{RESET}")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print(f"  Mode:      {'DRY-RUN (read-only)' if DRY_RUN else 'LIVE (will attempt DB writes)'}")

    await preflight()

    try:
        supabase = get_supabase_admin_client()
        ok("Supabase admin client initialized.")
    except Exception as e:
        err(f"Failed to initialize Supabase admin client: {e}")
        sys.exit(1)

    unsummarized = fetch_unsummarized_threads(supabase)

    if not unsummarized:
        section("RESULT")
        ok("No threads are missing summaries. Nothing to diagnose.")
        return

    for i, thread in enumerate(unsummarized, start=1):
        await diagnose_thread(supabase, thread, i, len(unsummarized))

    print_root_cause_legend()

    section("COMPLETE")
    print(f"  Diagnosed {len(unsummarized)} thread(s) with missing summaries.")
    if DRY_RUN:
        info("Re-run WITHOUT --dry-run to attempt automatic repair of fixable threads.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
