# Submission Notes — MailMind AI

> Technical submission document for evaluators reviewing the MailMind AI project.
> All 15 core requirements are implemented with real API calls. No mocks or stubs exist in the production code paths.

---

## Project Summary

MailMind AI is a full-stack AI email assistant that integrates Google Gmail, Google Gemini, and Supabase into a cohesive productivity tool. The system synchronises a user's Gmail inbox into a structured PostgreSQL database, applies Gemini AI to every email at rest (categorisation, summarisation, embedding), and exposes that intelligence through a Next.js frontend with features including conversational RAG chat, AI reply drafting, AI email composition, and newsletter topic clustering.

**Stack:** Next.js 16 (React 19, App Router) · Python FastAPI · Supabase (PostgreSQL + pgvector + Auth) · Google Gemini API · Gmail REST API v1

**Repository:** https://github.com/Abhinayresu/AI-Gmail-Assistant

---

## Technical Challenges Solved

### 1. Reliable Email Threading
Gmail's thread model means a single "thread" contains multiple "messages". Mapping this correctly required:
- A `threads` table and an `emails` table with a one-to-many relationship
- Using `gmail_thread_id` for grouping and `gmail_message_id` (UNIQUE) for deduplication
- Re-summarising the entire thread (not just the new message) whenever any message in it changes

### 2. MIME Body Extraction
Gmail messages are nested MIME trees. The body extraction function (`get_message_body` in `gmail.py`) implements a three-pass extraction strategy:
1. Check `payload.body.data` directly
2. Recursively walk `parts[]` looking for `text/plain` first
3. Fall back to `text/html` with style/script stripping and tag removal
4. Recurse into nested `parts` if needed

### 3. Gemini Free-Tier Quota Management
The free tier of `gemini-2.5-flash-lite` allows only 20 requests/day. Quota exhaustion during a sync run leaves threads without summaries. Three mechanisms address this:
- **Model fallback chain:** `gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash` — 429 errors cause escalation to the next model
- **Silent continuation:** quota errors are caught and logged per-thread without aborting the entire sync
- **Repair endpoint:** `POST /sync/repair-summaries` re-processes all `NULL`-summary threads with a 2-second delay between calls, designed to run after the daily quota resets

### 4. JWT Authentication Without Network Round-Trips
Supabase JWT verification traditionally requires a call to the Supabase API for every request. The auth dependency (`dependencies/auth.py`) implements:
- **Primary:** Local HS256 decode using `SUPABASE_JWT_SECRET` — zero network latency, validates `sub` claim and `audience: authenticated`
- **Fallback:** Supabase `auth.get_user(token)` for cases where the secret is not configured or the signature does not match (e.g. during key rotation)

### 5. Proper Gmail Reply Threading
Sending a reply that appears in the correct Gmail thread requires the RFC 2822 `Message-ID` header of the original message — not the Gmail message ID. This required a separate Gmail API call (`GET /messages/{id}?format=full`) to extract the `message-id` header, which is then set as both `In-Reply-To` and `References` in the outgoing MIME message.

### 6. Recipient Resolution for Replies
When replying, the system must send to the last external sender (not the authenticated user). The `reply.py` router iterates the thread's emails in descending order and skips any email whose sender address contains the authenticated user's email before selecting the recipient.

### 7. pgvector User Isolation
The `match_emails` SQL RPC function enforces user isolation *inside* the database before returning any rows — it joins `email_embeddings → emails → threads` and filters by `threads.user_id = user_uuid`. This means even if the service-role key is used to call the RPC, results are scoped to the requesting user's data.

### 8. Newsletter Deduplication at Two Levels
Newsletter spam is controlled at two independent layers:
- **Sync-time deduplication:** if a Newsletter-categorised email has the same sender + subject as one received in the last 7 days, it is skipped entirely (never inserted)
- **Semantic clustering:** the newsletter service groups all stored newsletters by cosine similarity (threshold 0.70) so related emails from multiple sends appear as a single topic in the UI

---

## Design Tradeoffs

### Synchronous Summarisation vs. User Experience
**Decision:** Summarisation runs synchronously within the `POST /sync` HTTP request.  
**Tradeoff:** Sync takes 10–60 seconds for a full batch. This is acceptable for a V1 with a batch size of 10, but will not scale. A background task queue is the correct solution for production.  
**Why accepted:** Keeps the architecture simple and avoids needing a Redis/Celery setup for the initial submission. The repair endpoint provides a recovery path.

### pgvector Inside Supabase vs. Dedicated Vector Database
**Decision:** Reuse the existing Supabase PostgreSQL instance for vector storage.  
**Tradeoff:** Less configuration flexibility than a dedicated service (Pinecone, Weaviate). The HNSW index rebuild is a blocking operation.  
**Why accepted:** Eliminates a second datastore, a second auth surface, and a synchronisation problem. For the email volume of a personal inbox (hundreds to thousands of messages), pgvector's HNSW index is more than sufficient.

### Keyword Fallback vs. Pure Vector Search
**Decision:** When `match_emails` returns no results (similarity below 0.2), the system falls back to substring keyword matching.  
**Tradeoff:** The keyword fallback scores all matches at 0.85 (fixed), provides no ranking, and does not respect semantic meaning.  
**Why accepted:** Prevents the chat feature from returning a "no results" response for queries where the embedding models produce noisy or zero-recall results (e.g. very short queries).

### O(n²) Newsletter Clustering vs. Proper Algorithm
**Decision:** Pairwise cosine similarity with greedy first-match clustering.  
**Tradeoff:** O(n²) complexity; degrades for users with hundreds of newsletter emails. First-match greedy assignment can produce suboptimal clusters.  
**Why accepted:** Sufficient for personal inbox scale (typically 10–200 newsletters). Simple to implement and reason about without a scikit-learn dependency.

### Anon Key vs. Service-Role Key in Backend
**Decision:** The backend exclusively uses the service-role key (bypasses RLS) for all Supabase operations.  
**Tradeoff:** If the backend is compromised, the attacker has full database access.  
**Mitigation:** Every endpoint validates the user's JWT and scopes all queries with `WHERE user_id = authenticated_user_id` in application code. The service-role key is never sent to the client.

---

## AI Features Implemented

| Feature | Model | Endpoint |
|---|---|---|
| Email categorisation | `gemini-2.5-flash-lite` (temp 0.1) | Called during `POST /sync` |
| Thread summarisation | `gemini-2.5-flash-lite → flash → 2.0-flash` | Called during `POST /sync` and `POST /sync/repair-summaries` |
| Text embedding | `text-embedding-004 → gemini-embedding-001 → gemini-embedding-2` | Called during sync and chat |
| RAG chat | `gemini-2.5-flash-lite` (multi-turn) | `POST /chat` |
| AI reply generation | `gemini-2.5-flash-lite` | `POST /reply` |
| AI email compose | `gemini-2.5-flash-lite` (JSON mode) | `POST /compose` |
| Newsletter cluster summarisation | `gemini-2.5-flash` | `GET/POST /newsletters/deduplicate` |

All model calls include fallback logic. Non-quota exceptions (e.g. invalid API key, malformed request) short-circuit immediately rather than cycling through all fallback models.

---

## Key Engineering Decisions

### All Backend Logic in Python (not Next.js API Routes)
The project migrated all server-side logic from Next.js API routes to a standalone FastAPI backend. This decision was made because:
- FastAPI's `async/await` model is better suited for I/O-heavy pipelines (multiple concurrent API calls)
- Python has mature, well-maintained client libraries for both `google-generativeai` and `supabase`
- Separating the backend allows independent scaling and testing
- The FastAPI OpenAPI docs at `/docs` provide a built-in interactive testing interface

### Single `.env.local` File for Both Services
`config.py` searches for `.env.local` in both the `backend/` directory and its parent. This allows a single environment file at the repo root to serve both Next.js (natively reads `.env.local`) and FastAPI (via `load_dotenv`), eliminating configuration duplication.

### `gmail_message_id` as the Deduplication Key
Rather than tracking sync state with a complex cursor, every synced message is stored with its Gmail `message_id` as a UNIQUE constraint. Before processing any message, the sync router checks for an existing row. This is simpler than cursor-based sync and remains correct even if the same message appears in multiple sync batches.

### Upsert on Embeddings
`store_email_embedding` uses `supabase.upsert(..., on_conflict="email_id")` rather than a conditional insert. This makes the embedding generation step idempotent — if called twice for the same email (e.g. during a repair or retry), the second call overwrites the first without error.

---

## Known Limitations

| Limitation | Impact | Workaround |
|---|---|---|
| Gemini free tier: 20 req/day for `flash-lite` | Sync batches of >3–4 threads will exhaust quota | Use `POST /sync/repair-summaries` after quota reset; upgrade to paid tier |
| Sync batch size fixed at 10 | Large inboxes require many sync invocations | Run sync multiple times; future: increase `SYNC_LIMIT` with background processing |
| Synchronous summarisation blocks HTTP response | Sync feels slow (10–60s) with multiple threads | Future: move to background task queue |
| O(n²) newsletter clustering | Slow for 100+ newsletter emails | Future: replace with k-means or DBSCAN |
| Dev bypass token hardcoded in auth.py | Security risk in production deployment | Remove `dev-test-bypass-token` before deploying |
| CORS wildcard `allow_origins=["*"]` | Any origin can call the backend in production | Restrict to specific Next.js origin before deploying |
| `FutureWarning` from `google-generativeai` | No current impact; library will be deprecated | Migrate to `google-genai` package |
| `diagnostic_output.txt` in repo root | May contain sensitive log data | Add to `.gitignore`; delete from repo |

---

## Future Improvements

### Short Term (Ready to Implement)
- Remove `dev-test-bypass-token` from `auth.py`
- Restrict CORS to specific origin
- Add `diagnostic_output.txt` and `backend/venv/` to `.gitignore`
- Migrate from `google-generativeai` to `google-genai` SDK

### Medium Term
- **Async summarisation** — Celery + Redis or Supabase Edge Functions for background Gemini calls
- **Gmail `historyId` sync** — incremental sync using Gmail History API instead of timestamp polling
- **Streaming chat** — Server-Sent Events for real-time token streaming in the chat UI
- **PostgreSQL full-text search** — `tsvector` index on `emails.body` for better keyword fallback
- **Per-user Gemini keys** — expose `users.gemini_api_key` via the settings page

### Long Term
- **Gmail push notifications** — `users.watch` + Cloud Pub/Sub for event-driven sync
- **Scheduled summary repair** — Supabase Cron job running nightly after quota reset
- **Multi-account support** — allow one user to connect multiple Gmail accounts
- **Mobile app** — React Native frontend using the same FastAPI backend

---

## Repository Audit Findings

### Missing Items
| Item | Status |
|---|---|
| Screenshots | ❌ No screenshots in repository |
| Architecture diagram (visual) | ⚠️ Text-based diagram only; no PNG/SVG |
| `backend/venv/` in `.gitignore` | ❌ Not listed — should be excluded |
| `diagnostic_output.txt` in `.gitignore` | ❌ Not listed — may contain sensitive logs |

### Security Observations
| Issue | Severity | Recommendation |
|---|---|---|
| `dev-test-bypass-token` hardcoded in `auth.py` | 🔴 High | Remove before any non-local deployment |
| `allow_origins=["*"]` in `main.py` | 🟡 Medium | Restrict to specific Next.js origin in production |
| `.env.local` excluded by `.gitignore` | ✅ Correct | Verify no secrets were ever committed |
| `diagnostic_output.txt` may contain log data | 🟡 Medium | Review contents; add to `.gitignore`; delete from repo |
| Service-role key used in backend | ✅ Acceptable | Never sent to client; application-level user scoping applied |

### Files That Should Be in `.gitignore`
```
backend/venv/
diagnostic_output.txt
tsconfig.tsbuildinfo     # Already excluded by *.tsbuildinfo
```

### Broken References
None detected. All import paths, API proxy rewrites, and schema references are consistent with the actual file structure.
