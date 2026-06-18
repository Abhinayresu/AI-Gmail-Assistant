# MailMind AI — Architecture

> **Version 1.0.0** · Python FastAPI + Next.js 16 + Supabase + Google Gemini

---

## Executive Overview

MailMind AI is a full-stack, AI-augmented email management system that connects to a user's Gmail inbox and transforms it into a queryable, summarised, and reply-capable knowledge base. The system is built around four pillars:

1. **Data Ingestion** — Gmail API integration with thread-aware synchronisation
2. **AI Processing** — Google Gemini for categorisation, summarisation, reply drafting, and email composition
3. **Vector Intelligence** — 768-dimensional text embeddings stored in pgvector enabling semantic search over the inbox
4. **Conversational Interface** — RAG (Retrieval-Augmented Generation) chat that grounds every AI answer in real email data

All 15 core requirements are implemented with real API calls. No mocks or stubs exist in the production code paths.

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT BROWSER                              │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Next.js 16 Frontend  (port 3000)                │   │
│  │                                                              │   │
│  │  /login   /dashboard   /inbox   /chat   /reply   /compose    │   │
│  │  /categories   /settings   /newsletter-insights             │   │
│  │                                                              │   │
│  │  middleware.ts ──── Supabase Auth (cookie session check)     │   │
│  └───────────────────────┬──────────────────────────────────────┘   │
└──────────────────────────┼──────────────────────────────────────────┘
                           │ HTTP (Next.js rewrites proxy)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend  (port 8000)                      │
│                                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐  │
│  │  /auth   │ │  /sync   │ │  /reply  │ │ /compose │ │  /chat  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬────┘  │
│       │             │             │             │             │       │
│  ┌────▼─────────────▼─────────────▼─────────────▼─────────────▼──┐  │
│  │              Service Layer                                      │  │
│  │  gemini.py  │  gmail.py  │  embeddings.py  │  retrieval.py    │  │
│  │  newsletter.py           │  supabase_client.py                 │  │
│  └──────────┬──────────────────────────────────┬─────────────────┘  │
└─────────────┼──────────────────────────────────┼────────────────────┘
              │                                   │
              ▼                                   ▼
┌─────────────────────────┐        ┌──────────────────────────────────┐
│   Google APIs           │        │   Supabase (PostgreSQL)          │
│                         │        │                                  │
│  Gmail REST API v1      │        │  tables: users, threads, emails  │
│  OAuth2 /token          │        │  email_embeddings (pgvector)     │
│  Gemini API             │        │  chat_history                    │
│  text-embedding-004     │        │  newsletter_clusters             │
└─────────────────────────┘        │                                  │
                                   │  HNSW index (cosine distance)    │
                                   │  match_emails() RPC function     │
                                   │  Row Level Security (all tables) │
                                   │  Supabase Auth (JWT issuance)    │
                                   └──────────────────────────────────┘
```

---

## Frontend Architecture

**Framework:** Next.js 16.2.9 with App Router, React 19.2.4, TypeScript 5, React Compiler enabled.

### Route Map

| Route | Description |
|---|---|
| `/login` | Google OAuth sign-in; triggers Supabase `signInWithOAuth` |
| `/dashboard` | Stats overview, sync button, recent activity chart |
| `/inbox` | Paginated thread list with per-thread email viewer |
| `/inbox/[threadId]` | Individual thread detail view |
| `/chat` | RAG AI chat interface with persistent history |
| `/reply` | AI reply draft builder for an existing thread |
| `/compose` | AI standalone email composer |
| `/categories` | Inbox filtered by category (Work / Personal / Finance / etc.) |
| `/settings` | User profile and OAuth connection status |
| `/newsletter-insights` | Newsletter cluster viewer |

### Session & Route Protection

`src/middleware.ts` runs on every non-static request. It calls `supabase.auth.getUser()` server-side using `@supabase/ssr` cookie handling. Unauthenticated users accessing protected paths (`/dashboard`, `/inbox`, `/chat`, `/reply`, `/categories`, `/settings`) are redirected to `/login`. Authenticated users on `/` or `/login` are redirected to `/dashboard`.

### API Proxy

All backend calls flow through Next.js URL rewrites configured in `next.config.ts`. The frontend never exposes the backend port to the browser.

```
/api/auth/save-token         → http://127.0.0.1:8000/auth/google
/api/sync/repair-summaries   → http://127.0.0.1:8000/sync/repair-summaries
/api/sync                    → http://127.0.0.1:8000/sync
/api/sync/send               → http://127.0.0.1:8000/reply/send
/api/reply                   → http://127.0.0.1:8000/reply
/api/chat                    → http://127.0.0.1:8000/chat
/api/compose                 → http://127.0.0.1:8000/compose
/api/compose/send            → http://127.0.0.1:8000/compose/send
/api/newsletters/cluster     → http://127.0.0.1:8000/newsletters/deduplicate
```

### UI Libraries

| Library | Version | Use |
|---|---|---|
| Tailwind CSS | v4 | Utility-first styling |
| Framer Motion | 12.40 | Page transitions and component animations |
| Recharts | 3.8 | Dashboard statistics charts |
| Lucide React | 1.20 | Icon library |

---

## Backend Architecture

**Framework:** FastAPI 0.110+ served by Uvicorn 0.28+. All handlers are `async`. The entry point is `backend/app/main.py`.

### Router Registration

```python
app.include_router(auth.router)         # /auth
app.include_router(sync.router)         # /sync, /sync/repair-summaries
app.include_router(chat.router)         # /chat
app.include_router(compose.router)      # /compose, /compose/send
app.include_router(reply.router)        # /reply, /reply/send
app.include_router(newsletters.router)  # /newsletters/deduplicate
```

### Service Layer

| Service | File | Responsibility |
|---|---|---|
| Gemini | `gemini.py` | Categorisation, summarisation (with 3-model fallback), reply generation, email composition, multi-turn chat |
| Gmail | `gmail.py` | List messages, fetch full message details, send email, create draft, refresh OAuth token |
| Embeddings | `embeddings.py` | Generate 768-dim embeddings via `text-embedding-004` with 3-model fallback |
| Retrieval | `retrieval.py` | Store embeddings, run pgvector RPC search, keyword fallback search |
| Newsletter | `newsletter.py` | Cosine-similarity clustering, Gemini consolidation, DB cache write |
| Supabase Client | `supabase_client.py` | Factory for anon client (auth-scoped) and admin client (service role, bypasses RLS) |

### Authentication Dependency

Every protected route uses `Depends(get_current_user_id)` from `dependencies/auth.py`:

1. Extract Bearer token from `Authorization` header OR Supabase session cookies forwarded by Next.js
2. **Primary path:** Local HS256 JWT decode using `SUPABASE_JWT_SECRET` (zero network round-trip, audience: `"authenticated"`)
3. **Fallback:** Supabase `auth.get_user(token)` API call (when JWT secret is absent or signature mismatches)

### Configuration

`config.py` uses `pydantic-settings` and loads `.env.local` from both the `backend/` directory and its parent, allowing a single environment file at the repo root to serve both Next.js and FastAPI.

---

## Database Design

**Engine:** PostgreSQL (Supabase managed), `pgvector` extension for vector similarity, `uuid-ossp` for UUID generation. Row Level Security is enabled on every table.

### Entity Relationship

```
users (1) ──< threads (many) ──< emails (many) ──< email_embeddings (1)
users (1) ──< chat_history (many)
users (1) ──< newsletter_clusters (many)
```

### Table Reference

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Mirrors Supabase Auth user UUID exactly |
| `email` | TEXT UNIQUE | Google account email |
| `name` | TEXT | Full name from OAuth metadata |
| `avatar` | TEXT | Profile picture URL from OAuth metadata |
| `google_access_token` | TEXT | Short-lived Gmail API access token |
| `google_refresh_token` | TEXT | Long-lived token for silent refresh |
| `google_token_expires_at` | TIMESTAMPTZ | Access token expiry |
| `last_synced_at` | TIMESTAMPTZ | `after:` filter anchor for next sync |
| `gemini_api_key` | TEXT | Reserved (not used in current implementation) |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit timestamps |

**RLS:** `auth.uid() = id` for SELECT and UPDATE.

#### `threads`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Internal thread identifier |
| `user_id` | UUID FK → users | Owner |
| `gmail_thread_id` | TEXT | Gmail's native thread ID |
| `subject` | TEXT | Thread subject line |
| `summary` | TEXT | Gemini-generated summary (NULL until processed) |
| `category` | TEXT | Work / Personal / Finance / Newsletter / Job / Notification |
| `created_at` / `updated_at` | TIMESTAMPTZ | Date of first email / last modification |

**Indexes:** `(user_id)`, `(gmail_thread_id)` · **RLS:** Full access scoped to owner.

#### `emails`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Internal message identifier |
| `thread_id` | UUID FK → threads CASCADE | Parent thread |
| `gmail_message_id` | TEXT UNIQUE | Gmail message ID — prevents duplicate sync |
| `sender` | TEXT | Full `From:` header |
| `receiver` | TEXT | Full `To:` header |
| `body` | TEXT | Plain text body; HTML-stripped if no plain text available |
| `category` | TEXT | Mirrors thread category |
| `created_at` | TIMESTAMPTZ | Parsed RFC 2822 date header |

**Indexes:** `(thread_id)`, `(gmail_message_id)` · **RLS:** Access via JOIN to threads.

#### `email_embeddings`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Row identifier |
| `email_id` | UUID UNIQUE FK → emails CASCADE | One embedding per email |
| `embedding` | vector(768) | 768-dim float vector from `text-embedding-004` |

**Indexes:** `(email_id)` (B-tree), HNSW index `(embedding vector_cosine_ops)` for ANN search.  
**RLS:** Two-level JOIN: `email_embeddings → emails → threads` scoped to owner.

**`match_emails` RPC:**
```sql
-- Returns top-N emails by cosine similarity for a given user
SELECT e.id, t.subject, e.sender, e.receiver, e.body, e.created_at,
       1 - (ee.embedding <=> query_embedding) AS similarity
FROM email_embeddings ee
JOIN emails e ON e.id = ee.email_id
JOIN threads t ON t.id = e.thread_id
WHERE t.user_id = user_uuid
  AND 1 - (ee.embedding <=> query_embedding) > match_threshold
ORDER BY ee.embedding <=> query_embedding
LIMIT match_count;
```

#### `chat_history`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Row identifier |
| `user_id` | UUID FK → users CASCADE | Owner |
| `question` | TEXT | User's question |
| `answer` | TEXT | Gemini's answer |
| `created_at` | TIMESTAMPTZ | Exchange timestamp |

**RLS:** Scoped to owner.

#### `newsletter_clusters`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Row identifier |
| `user_id` | UUID FK → users CASCADE | Owner |
| `topic` | TEXT | Gemini-generated cluster title |
| `summary` | TEXT | Bullet-point consolidation of the cluster |
| `source_emails` | JSONB | Array of `{id, sender, subject, created_at}` for member emails |
| `created_at` | TIMESTAMPTZ | Cluster generation timestamp |

**RLS:** Scoped to owner. Refreshed atomically: `DELETE + INSERT` on every recalculation.

---

## Gmail OAuth Flow

```
1. User clicks "Sign in with Google" on /login
   └─ Frontend: supabase.auth.signInWithOAuth({
        provider: "google",
        options: { scopes: "https://www.googleapis.com/auth/gmail.readonly
                            https://www.googleapis.com/auth/gmail.send" }
      })

2. Browser redirected → Google consent screen
   └─ User grants Gmail read + send permissions

3. Google → redirects to /auth/callback with authorization_code

4. Supabase Auth handles PKCE exchange:
   └─ Supabase: authorization_code → { access_token, refresh_token, session, provider_token }
   └─ provider_token = Google access token
   └─ Supabase session JWT issued for the app

5. Frontend receives Supabase session
   └─ provider_token + expires_in + provider_refresh_token extracted
   └─ POST /api/auth/save-token (→ FastAPI POST /auth/google)
     └─ Body: { provider_token, provider_refresh_token?, expires_in }
     └─ Backend validates Supabase JWT
     └─ Backend upserts users table:
        { google_access_token, google_refresh_token, google_token_expires_at }
     └─ google_refresh_token stored ONLY on first consent (when Google sends it)

6. User redirected to /dashboard
```

---

## Gmail Sync Flow

```
POST /sync  (triggered by user on dashboard)

1. Validate JWT → user_id

2. Fetch user profile from users table:
   { google_access_token, google_refresh_token, google_token_expires_at, last_synced_at }

3. Token expiry check:
   └─ If token expires within 60 seconds OR is missing:
      └─ POST https://oauth2.googleapis.com/token { grant_type: refresh_token }
      └─ UPDATE users: { google_access_token, google_token_expires_at }

4. Fetch message IDs from Gmail:
   GET https://gmail.googleapis.com/gmail/v1/users/me/messages
   Params: { maxResults: 10, q: "after:{last_synced_at_epoch}" }

5. For each message_id:
   a. Check emails table: WHERE gmail_message_id = msg_id → skip if exists
   b. GET /gmail/v1/users/me/messages/{id}?format=full
      └─ Parse headers: subject, from, to, date (RFC 2822 → ISO 8601)
      └─ Extract body: text/plain first, HTML-stripped fallback, recursive MIME walk
   c. categorize_email(subject, body) → Gemini → one of 6 categories
   d. If Newsletter: check for duplicate (same sender + subject in last 7 days) → skip if found
   e. Upsert thread row (gmail_thread_id lookup), insert email row
   f. store_email_embedding(email_id, subject, body) → 768-dim vector → email_embeddings
   g. Add thread_id to modified_thread_ids

6. For each modified thread:
   └─ Fetch all emails ordered by created_at ASC
   └─ summarize_email_thread(emails) → Gemini (with model fallback chain)
   └─ UPDATE threads.summary

7. UPDATE users.last_synced_at = now()

8. Return { emailsSynced, threadsUpdated }
```

---

## Threading Architecture

MailMind mirrors Gmail's native threading model:

- Each Gmail **thread** (conversation) maps to one row in `threads`
- Each Gmail **message** within that thread maps to one row in `emails`
- The `gmail_thread_id` is used to group messages; the `gmail_message_id` (UNIQUE constraint) prevents duplicate sync
- The `threads` table holds the AI-computed artefacts (summary, category) at the conversation level
- When a new message arrives in an existing thread (matched by `gmail_thread_id`), the thread row is updated and the entire conversation is re-summarised

---

## Email Categorisation Flow

```
categorize_email(subject, body) in gemini.py

1. Build prompt:
   "Classify into exactly one of: Work, Personal, Finance, Newsletter, Job, Notification.
    Output ONLY the category word."

2. Call gemini-2.5-flash-lite with temperature=0.1

3. Parse response text → match against valid_categories list (case-insensitive)

4. Default "Work" if no match found or if exception occurs

5. Category written to:
   - threads.category (new thread creation)
   - emails.category (every email row)
```

**Newsletter deduplication** runs immediately after categorisation: if the Gemini response is "Newsletter", the sync router checks for an email from the same sender with the same subject received in the last 7 days before proceeding to insert.

---

## Email Summarisation Flow

```
summarize_email_thread(emails: list) in gemini.py

Model Fallback Chain (SUMMARIZE_MODEL_CHAIN):
  gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash

1. Build email_transcript:
   For each email:
     clean_email_body(body):
       - Strip lines starting with ">" (quoted replies)
       - Strip "On ... wrote:" dividers
     Append: "--- Email #{n} ---\nFrom: {sender}\nDate: {date}\nContent:\n{clean_body}\n"

2. Build prompt (adaptive, role-agnostic):
   "You are MailMind AI. Summarize ONLY the provided email thread.
    Output: • Main topic • Important information • Actions required • Deadlines or dates"

3. Try gemini-2.5-flash-lite:
   → Success: return response.text
   → 429 / ResourceExhausted: log warning, continue to next model

4. Try gemini-2.5-flash:
   → Success: return
   → 429: continue

5. Try gemini-2.0-flash:
   → Success: return
   → Non-quota error at any step: raise immediately (no further fallback)

6. If all models exhausted: raise last exception

Callers:
  - sync.py: runs automatically for every modified thread during sync
  - sync.py POST /sync?thread_id=: re-summarise a specific thread on demand
  - sync.py POST /sync/repair-summaries: bulk repair all threads with NULL summary
    └─ 2-second asyncio.sleep() between each Gemini call for rate limit safety
```

---

## Embedding Generation Flow

```
store_email_embedding(supabase, email_id, subject, body) in retrieval.py
  └─ calls get_embedding(text) in embeddings.py

get_embedding(text):

Input text: "Subject: {subject}\n\nBody: {body}"

Embedding Model Fallback Chain:
  models/text-embedding-004 → models/gemini-embedding-001 → models/gemini-embedding-2

For each model:
  genai.embed_content(model=model_name, content=text, task_type="retrieval_document")
  If "embedding" in result: return result["embedding"][:768]
  If exception: log warning, try next model

If all models fail: raise RuntimeError("All embedding models failed.")

Storage:
  supabase.table("email_embeddings").upsert(
    { email_id: email_id, embedding: vector_768 },
    on_conflict="email_id"
  )
  └─ UPSERT prevents duplicate embeddings if email is re-processed
```

---

## RAG Chat Flow

```
POST /chat  { question, history[] }

1. Validate JWT → user_id

2. search_relevant_emails(supabase, user_id, question, limit=10):

   a. get_embedding(question) → 768-dim query vector

   b. supabase.rpc("match_emails", {
        query_embedding: vector,
        match_threshold: 0.2,
        match_count: 10,
        user_uuid: user_id
      })
      → Executes HNSW cosine similarity search scoped to user

   c. If RPC returns no results:
      run_keyword_fallback_search(query, user_id):
        - Split query into meaningful words (>3 chars, exclude stop words)
        - Fetch recent emails for user
        - Substring match in subject + body + sender
        - Returns matches with similarity score of 0.85 (fixed fallback score)

3. Format context string from matched emails (subject, sender, date, body, similarity %)

4. Format chat history as Gemini Content objects:
   [{ role: "user"|"model", parts: [{ text: "..." }] }]
   (Frontend "assistant" role mapped to Gemini "model")

5. model.start_chat(history=formatted_history).send_message(prompt)
   Prompt: MailMind AI system role + Email Context + User Query

6. INSERT into chat_history(user_id, question, answer)

7. Return { answer }
```

---

## AI Reply Generation Flow

```
Stage 1 — Draft Generation:
POST /reply  { threadId, instruction, tone }

1. Validate JWT → user_id
2. Fetch all emails in thread ordered by created_at ASC
3. Build thread_context string (From, To, Date, Content per email)
4. generate_email_reply(thread_context, instruction, tone) via gemini-2.5-flash-lite:
   "Draft a reply. Apply user's instructions. Respect tone: {tone}.
    Output ONLY the email body text."
5. Return { reply: draft_text }

Stage 2 — Sending:
POST /reply/send  { threadId, replyBody }

1. Validate JWT → user_id
2. Fetch + conditionally refresh Google access token (< 60s expiry → refresh)
3. Fetch thread (gmail_thread_id, subject, category)
4. Fetch latest email that was NOT sent by the current user
   (iterate emails ordered DESC, skip emails where sender contains user's email)
5. Fetch RFC822 Message-ID header from Gmail API for the latest email in thread
   (GET /gmail/v1/users/me/messages/{id} — needed for correct email threading)
6. Build MIME message:
   - To: recipient_email (extracted from latest external sender via regex <email>)
   - Subject: "Re: {original_subject}" (prefix added if not already present)
   - In-Reply-To: {RFC822 Message-ID}
   - References: {same RFC822 Message-ID}
   - Body: replyBody (plain text)
7. base64url encode MIME → POST /gmail/v1/users/me/messages/send { raw, threadId }
8. INSERT sent message into emails table
9. UPDATE threads.updated_at
10. Return { messageId }
```

---

## Gmail Reply Sending Flow

```
gmail.py: send_gmail_email(access_token, to, subject, body, thread_id?, in_reply_to_header?)

1. Construct MIMEText(body, "plain", "utf-8")
2. Set headers:
   - msg["To"] = to
   - msg["Subject"] = subject
   - If thread_id AND in_reply_to_header:
       msg["In-Reply-To"] = in_reply_to_header
       msg["References"] = in_reply_to_header
3. base64url encode: msg.as_string() → urlsafe_b64encode → strip "=" padding
4. POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send
   Headers: { Authorization: Bearer {token}, Content-Type: application/json }
   Body: { raw: base64url, threadId?: gmail_thread_id }
5. Parse response: { id: message_id, threadId: gmail_thread_id }
```

For **compose/send** (new thread), the same function is called without `thread_id` and `in_reply_to_header`. Compose also supports `POST /gmail/v1/users/me/drafts` for save-as-draft mode.

---

## Newsletter Categorisation and Clustering Flow

```
POST /newsletters/deduplicate (force recalculate)
GET  /newsletters/deduplicate (serve cached or compute)

Phase 1 — Fetch Newsletter Emails:
  SELECT emails JOIN threads WHERE emails.category = 'Newsletter'
    AND threads.user_id = user_uuid

Phase 2 — Fetch / Generate Embeddings:
  For each newsletter email:
    Fetch from email_embeddings by email_id
    If missing: call get_embedding("Subject: {s}\n\nBody: {b}")
      → UPSERT into email_embeddings (fills gaps)

Phase 3 — Pairwise Cosine Similarity Clustering:
  SIM_THRESHOLD = 0.70
  Pure Python cosine similarity (dot product / (norm_a * norm_b))
  Greedy first-match clustering:
    For each email:
      Compare embedding with first email of each existing cluster
      If sim >= 0.70: join that cluster
      Else: create new cluster

Phase 4 — Gemini Consolidation per Cluster:
  For clusters with > 1 email (using gemini-2.5-flash):
    Build transcript of newsletters (up to 1500 chars body each)
    Prompt: "Consolidate into a topic title + bullet-point summary"
    Response: JSON { topic, summary }
  For single-email clusters:
    Prompt: "Summarize in 2-3 bullet points"

Phase 5 — Cache to Database:
  DELETE existing clusters for user
  INSERT new cluster rows
  Return results

Note: GET endpoint returns cached clusters from newsletter_clusters table.
      Clusters are recomputed on every POST request.
```

---

## Security Design

### Token Storage
- Google access tokens and refresh tokens are stored in `users` table, protected by RLS (`auth.uid() = id`)
- Only the backend (service-role key) can write to `users`; the frontend (anon key) can only read its own row
- The `SUPABASE_SERVICE_ROLE_KEY` never reaches the browser — it is used exclusively in the Python backend

### API Authentication
- Every FastAPI route uses `Depends(get_current_user_id)` as a mandatory dependency
- Token extraction: `Authorization: Bearer {jwt}` header OR Supabase session cookies (`sb-access-token`, `auth-token` key patterns)
- Local HS256 JWT verification avoids network round-trips for the common case
- `jwt.ExpiredSignatureError` returns HTTP 401 with "Session expired" message
- Development bypass token (`dev-test-bypass-token`) hard-codes a fixed user ID — **must be removed for production**

### Row Level Security
- All six tables have RLS enabled
- User isolation is enforced at the PostgreSQL layer regardless of the client used
- `email_embeddings` policy traverses two JOINs to verify ownership
- The `match_emails` RPC function filters by `user_uuid` parameter before returning results

### CORS
- Currently set to `allow_origins=["*"]` in `main.py` (acceptable for local development)
- **Must be restricted to the specific Next.js origin in production**

### Known Security Issues
- `.env.local` is listed in `.gitignore` under `.env*` pattern — but the file exists at the repo root. Verify it was not committed with real secrets before pushing to GitHub.
- `diagnostic_output.txt` (53 KB) at repo root may contain sensitive log data and should be added to `.gitignore`
- `tsconfig.tsbuildinfo` is excluded by `.gitignore` but was observed in the working directory

---

## Design Decisions

### Why Next.js?
The App Router provides server-side middleware for route protection without a dedicated auth server. Built-in rewrite rules proxy all backend calls through the same origin, eliminating CORS complexity. The React Compiler (enabled via `babel-plugin-react-compiler`) provides automatic memoisation. SSR-safe Supabase session handling via `@supabase/ssr` and cookie-based sessions is a first-class citizen of the App Router.

### Why FastAPI?
FastAPI's native `async/await` support is essential for the I/O-heavy sync pipeline, which performs concurrent Gmail API calls, Gemini API calls, and Supabase queries. Pydantic v2 eliminates request parsing boilerplate. Auto-generated OpenAPI docs at `/docs` provided immediate interactive testing during development. The `Depends()` injection system cleanly separates the auth concern from business logic in every route.

### Why Supabase?
Supabase bundles three required services under one managed platform: PostgreSQL (with pgvector), Auth (Google OAuth PKCE + JWT issuance), and Row Level Security. This removed the need for a separate identity provider, a separate vector database, and a separate authorisation layer. The service-role key gives the Python backend unrestricted write access while the anon key limits the frontend to only the authenticated user's data.

### Why PostgreSQL (via Supabase)?
Mature, ACID-compliant, and hosts the pgvector extension within the same instance as the application data — no separate vector database service needed. The `match_emails` stored procedure enforces user isolation inside the database before returning results, reducing the attack surface of the retrieval layer.

### Why pgvector?
Running vector search inside the same PostgreSQL instance as the application data eliminates a network hop, avoids synchronisation problems between two datastores, and keeps the infrastructure footprint small. The HNSW index provides sub-millisecond approximate nearest-neighbour search for the 768-dimensional embedding space. The `<=>`  cosine distance operator is native to pgvector.

### Why Google Gemini?
Gemini provides both the generative capability (categorisation, summarisation, reply drafting, composition, RAG chat) and the embedding capability (`text-embedding-004`) under a single API key and billing account. The free tier enables full local development. The multi-model fallback chain (`flash-lite → flash → 2.0-flash`) handles quota exhaustion gracefully.

### Why Gmail API (not IMAP)?
The Gmail REST API provides thread-aware message listing, RFC 2822 header access for proper email threading (`In-Reply-To`, `References`), and sending capabilities with threadId attachment — all in a single authenticated HTTP call. IMAP would require managing a persistent connection and implementing threading logic manually.

---

## Scalability Considerations

### Current Limitations
- **Sync batch size** fixed at 10 messages (`SYNC_LIMIT = 10`). Large inboxes require many sequential sync invocations.
- **Summarisation is synchronous** and blocks the HTTP response. With multiple threads each requiring a Gemini call, sync can take 10–60 seconds.
- **Gemini free tier**: 20 requests/day for `gemini-2.5-flash-lite`. Exhaustion leaves `threads.summary = NULL`. Use `POST /sync/repair-summaries` after quota reset.
- **Newsletter clustering** uses O(n²) pairwise cosine similarity in Python. Degrades beyond a few hundred newsletter emails.
- **No background task queue**. All AI processing happens synchronously within the HTTP request lifecycle.
- **Single refresh token per user**. Revocation requires re-authentication through the full OAuth flow.

### Future Improvements
- **Async summarisation queue** (Celery, ARQ, or Supabase Edge Functions) to decouple AI processing from the sync HTTP response
- **Gmail `historyId`-based incremental sync** to replace timestamp-based polling
- **Gmail push notifications** (`users.watch` + Pub/Sub) for event-driven sync on new mail
- **Per-user Gemini API keys** (`users.gemini_api_key` column is already reserved)
- **Streaming chat responses** via Server-Sent Events for real-time token output in the chat UI
- **Production CORS hardening** — restrict `allow_origins` to specific origin
- **Scheduled summary repair** via Supabase Cron
- **PostgreSQL full-text search** on `emails.body` (`tsvector`) as a higher-quality keyword fallback
- **Proper clustering algorithm** (k-means, DBSCAN) for newsletter grouping at scale
