# MailMind AI

> An AI-powered Gmail assistant that syncs your inbox, summarises every conversation, answers natural-language questions about your emails, and drafts replies — all powered by Google Gemini and stored in a pgvector-enabled Supabase database.

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python)](https://python.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL+pgvector-3ECF8E?logo=supabase)](https://supabase.com)

---

## Features

| Feature | Description |
|---|---|
| **Google OAuth sign-in** | One-click login with Gmail permissions granted via Supabase OAuth PKCE flow |
| **Gmail inbox sync** | Pulls the latest unseen messages (up to 10 per sync) directly from the Gmail REST API |
| **AI email categorisation** | Gemini classifies every email as Work, Personal, Finance, Newsletter, Job, or Notification |
| **Newsletter deduplication** | Duplicate newsletters from the same sender + subject within 7 days are automatically skipped during sync |
| **AI thread summarisation** | Every conversation thread receives an adaptive bullet-point summary; model fallback chain (flash-lite → flash → 2.0-flash) handles quota limits |
| **Summary repair endpoint** | `POST /sync/repair-summaries` re-generates all missing summaries after a quota reset |
| **Vector embeddings** | Each email is embedded as a 768-dim vector using `text-embedding-004` and stored in pgvector |
| **RAG AI chat** | Natural-language questions answered using cosine-similarity retrieval of your real emails as context |
| **Keyword fallback search** | If vector search returns no results, a keyword substring search is used as a fallback |
| **Persistent chat history** | Every Q&A turn is stored in `chat_history` and passed as context to subsequent turns |
| **AI reply drafting** | Generate a tone-adjusted reply draft for any thread; review before sending |
| **Gmail reply sending** | Sends replies back via Gmail API with correct RFC 2822 threading headers (`In-Reply-To`, `References`) |
| **AI email composer** | Generate brand-new emails from a natural-language instruction; send immediately or save as Gmail draft |
| **Newsletter clustering** | Newsletter emails grouped by topic using pairwise cosine similarity (threshold 0.70) + Gemini consolidation |
| **Silent token refresh** | Google OAuth access tokens refreshed automatically when within 60 seconds of expiry |

---

## Screenshots

### 1. AI Compose Email Page
![AI Compose Email Page](docs/screenshots/1.jpeg)

**Key Capabilities:** Natural language instructions • Tone selection • Length selection • Editable draft generation
*Demonstrates the AI Compose functionality, enabling users to generate editable email drafts by providing straightforward natural language instructions.*

---

### 2. Inbox + AI Thread Summary
![Inbox + AI Thread Summary](docs/screenshots/2.jpeg)

**Key Capabilities:** Email categorization • Thread view • AI-generated summary of entire conversation
*Showcases the modernized inbox experience powered by AI categorization and cohesive summaries of the entire conversation context.*

---

### 3. AI Chat Assistant
![AI Chat Assistant](docs/screenshots/3.jpeg)

**Key Capabilities:** RAG-powered inbox search • Natural language Q&A over emails • Context-aware responses
*Illustrates the Retrieval-Augmented Generation (RAG) capabilities, allowing users to perform complex, natural language queries against their synchronized emails.*

---

### 4. Project Alpha Thread Summary
![Project Alpha Thread Summary](docs/screenshots/4.jpeg)

**Key Capabilities:** Thread summarization • Action items • Deadlines • Key decisions extraction
*Highlights the advanced summarization engine accurately parsing conversations to extract critical operational details.*

---

### 5. AI Reply Generator
![AI Reply Generator](docs/screenshots/5.jpeg)

**Key Capabilities:** Context-aware reply drafting • Multiple tone styles • Thread-aware email responses
*Demonstrates the intelligent reply drafting system generating contextually appropriate responses based on the full thread history.*

---

### 6. Gmail Verification
![Gmail Verification](docs/screenshots/6.jpeg)

**Key Capabilities:** Reply successfully delivered through Gmail API • Appears inside original Gmail thread • End-to-end proof of functionality
*Serves as definitive proof of end-to-end functionality, verifying that an AI-generated reply is successfully transmitted and appended natively in Gmail.*

---

## Architecture Overview

```
Browser → Next.js 16 (port 3000) → proxy rewrites → FastAPI (port 8000)
                                                         │
                                          ┌──────────────┼──────────────┐
                                          ▼              ▼              ▼
                                     Gmail API     Gemini API     Supabase
                                    (REST v1)   (flash + embed)  (PostgreSQL
                                                                  + pgvector)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete data flow diagrams, database schema, security design, and all design decisions.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router) | 16.2.9 |
| Frontend | React | 19.2.4 |
| Frontend | TypeScript | 5 |
| Frontend | Tailwind CSS | v4 |
| Frontend | Framer Motion | 12.40 |
| Frontend | Recharts | 3.8 |
| Frontend | Lucide React | 1.20 |
| Backend | Python | 3.11+ |
| Backend | FastAPI | ≥ 0.110 |
| Backend | Uvicorn (ASGI) | ≥ 0.28 |
| Backend | Pydantic | v2 |
| Backend | httpx | ≥ 0.27 |
| Backend | PyJWT + cryptography | ≥ 2.8 / ≥ 42 |
| Database | Supabase (PostgreSQL) | managed |
| Vector | pgvector (HNSW index) | built-in |
| Auth | Supabase Auth (Google OAuth PKCE) | — |
| AI | Google Gemini API | `gemini-2.5-flash-lite` primary |
| AI | Gemini Embeddings | `text-embedding-004` (768 dims) |

---

## Project Structure

```
gmail-assistant/
│
├── backend/                              # Python FastAPI backend
│   ├── app/
│   │   ├── main.py                       # FastAPI app entry point, CORS, router registration
│   │   ├── config.py                     # pydantic-settings; loads .env.local from repo root
│   │   ├── schemas.py                    # Pydantic request/response models
│   │   ├── dependencies/
│   │   │   └── auth.py                   # JWT auth: HS256 local decode → Supabase API fallback
│   │   ├── routers/
│   │   │   ├── auth.py                   # POST /auth/google — save OAuth tokens
│   │   │   ├── sync.py                   # POST /sync, POST /sync/repair-summaries
│   │   │   ├── reply.py                  # POST /reply, POST /reply/send
│   │   │   ├── compose.py                # POST /compose, POST /compose/send
│   │   │   ├── chat.py                   # POST /chat — RAG Q&A
│   │   │   └── newsletters.py            # GET/POST /newsletters/deduplicate
│   │   └── services/
│   │       ├── gemini.py                 # All Gemini calls + 3-model fallback chain
│   │       ├── gmail.py                  # Gmail REST API client (list, fetch, send, draft, refresh)
│   │       ├── embeddings.py             # text-embedding-004 with 3-model fallback
│   │       ├── retrieval.py              # pgvector RPC search + keyword fallback
│   │       ├── newsletter.py             # Cosine similarity clustering + Gemini consolidation
│   │       └── supabase_client.py        # Supabase client factory (anon + service-role)
│   ├── requirements.txt
│   └── diagnose_summarization.py         # Offline debug script (not part of production API)
│
├── src/                                  # Next.js 16 App Router frontend
│   ├── app/
│   │   ├── layout.tsx                    # Root layout
│   │   ├── page.tsx                      # Root redirect → /dashboard
│   │   ├── globals.css
│   │   ├── login/page.tsx                # Google OAuth sign-in page
│   │   ├── dashboard/page.tsx            # Stats, sync button, recent activity
│   │   ├── inbox/
│   │   │   ├── page.tsx                  # Thread list
│   │   │   └── [threadId]/page.tsx       # Thread detail + email viewer
│   │   ├── chat/page.tsx                 # RAG AI chat
│   │   ├── reply/page.tsx                # AI reply composer
│   │   ├── compose/page.tsx              # AI email composer
│   │   ├── categories/page.tsx           # Category-filtered inbox
│   │   ├── settings/page.tsx             # User profile + connection status
│   │   └── newsletter-insights/page.tsx  # Newsletter cluster viewer
│   ├── components/
│   │   ├── ui/                           # Reusable primitives: Button, Card, Badge, Input, etc.
│   │   ├── dashboard/                    # Dashboard-specific components
│   │   └── inbox/                        # Thread preview components
│   ├── lib/
│   │   └── supabase.ts                   # Supabase client helpers
│   ├── types/
│   │   └── index.ts                      # TypeScript interfaces: EmailThread, EmailMessage, etc.
│   └── middleware.ts                     # Route protection + cookie session refresh
│
├── schema.sql                            # Complete Supabase schema: tables, RLS, indexes, RPC
├── next.config.ts                        # Next.js config with API proxy rewrites
├── package.json                          # Node dependencies
├── .env.example                          # Environment variable template
├── ARCHITECTURE.md                       # System architecture documentation
├── SUBMISSION.md                         # Technical submission notes
└── README.md                             # This file
```

---

## Environment Variables

Copy `.env.example` to `.env.local` at the **repository root** (used by both Next.js and FastAPI):

```bash
cp .env.example .env.local
```

Then fill in every value:

```env
# Supabase — https://supabase.com/dashboard/project/_/settings/api
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...      # Never expose to browser

# Supabase JWT Secret — https://supabase.com/dashboard/project/_/settings/api
# Found under "JWT Settings" → "JWT Secret"
SUPABASE_JWT_SECRET=your-supabase-jwt-secret

# Google Gemini — https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...

# Google OAuth — https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

| Variable | Required | Used by | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Frontend + Backend | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Frontend + Backend | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Backend only | Full DB access — keep secret |
| `SUPABASE_JWT_SECRET` | ✅ | Backend only | Fast local JWT verification |
| `GEMINI_API_KEY` | ✅ | Backend only | All AI features |
| `GOOGLE_CLIENT_ID` | ✅ | Backend only | OAuth token refresh |
| `GOOGLE_CLIENT_SECRET` | ✅ | Backend only | OAuth token refresh |

---

## Installation Guide

### Prerequisites

- **Node.js** 20 or later
- **Python** 3.11 or later
- **A Supabase project** (free tier sufficient)
- **A Google Cloud project** with OAuth 2.0 credentials and Gmail API enabled
- **A Gemini API key** from Google AI Studio

---

## Backend Setup

```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
# source venv/bin/activate

# Install all Python dependencies
pip install -r requirements.txt
```

Verify the installation:
```bash
python -c "import fastapi, google.generativeai, supabase; print('OK')"
```

---

## Frontend Setup

```bash
# From the repository root
npm install
```

---

## Gmail OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Library**
2. Search for and enable the **Gmail API**
3. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
4. Set **Application type** to `Web application`
5. Add **Authorised redirect URIs**:
   ```
   http://localhost:3000/auth/callback
   ```
   (Add your production URL when deploying)
6. Copy **Client ID** and **Client Secret** into `.env.local`
7. In your **Supabase Dashboard**:
   - Go to **Authentication** → **Providers** → **Google**
   - Enable Google provider
   - Paste your **Client ID** and **Client Secret**
   - Copy the **Supabase callback URL** shown (e.g. `https://your-project.supabase.co/auth/v1/callback`)
   - Add that URL to your Google OAuth **Authorised redirect URIs** as well

---

## Gemini API Setup

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **Create API Key**
3. Copy the key into `.env.local` as `GEMINI_API_KEY`

> **Free tier limits:** 20 requests/day for `gemini-2.5-flash-lite`. If this limit is hit during sync, use the repair endpoint after the daily quota resets (midnight Pacific Time):
> ```bash
> curl -X POST http://localhost:3000/api/sync/repair-summaries \
>   -H "Authorization: Bearer YOUR_SUPABASE_JWT"
> ```

---

## Database Setup

1. Open the **SQL Editor** in your [Supabase Dashboard](https://supabase.com/dashboard)
2. Paste the entire contents of [`schema.sql`](./schema.sql) and run it

This single script will:
- Enable `uuid-ossp` and `vector` (pgvector) extensions
- Create all six tables: `users`, `threads`, `emails`, `email_embeddings`, `chat_history`, `newsletter_clusters`
- Enable Row Level Security on every table with user-isolation policies
- Create B-tree performance indexes
- Create the HNSW vector index on `email_embeddings.embedding` for cosine similarity search
- Create the `match_emails(query_embedding, match_threshold, match_count, user_uuid)` stored procedure

---

## Running Locally

Start both servers in separate terminals:

**Terminal 1 — Backend:**
```bash
cd backend
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS / Linux
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

**First-time workflow:**
1. Click **Sign in with Google** — grant Gmail read + send permissions
2. Go to **Dashboard** and click **Sync**
3. Wait for sync to complete (10–30 seconds depending on message count)
4. Browse **Inbox**, use **Chat**, draft a **Reply**, or view **Newsletter Insights**

**Interactive API docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## API Endpoints

All endpoints require `Authorization: Bearer {supabase_access_token}` except `/health`.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Service health check — `{ status: "healthy", version: "1.0.0" }` |

### Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/google` | Save Google OAuth `provider_token` + `provider_refresh_token` after Supabase OAuth sign-in |

**Request body:**
```json
{
  "provider_token": "ya29.a0...",
  "provider_refresh_token": "1//0g...",
  "expires_in": 3599
}
```

### Synchronisation

| Method | Path | Description |
|---|---|---|
| `POST` | `/sync` | Sync up to 10 latest Gmail messages; categorise, embed, and summarise |
| `POST` | `/sync?thread_id={id}` | Re-generate summary for a specific thread |
| `POST` | `/sync/repair-summaries` | Re-summarise all threads where `summary IS NULL` (with 2s delay between calls) |

**Sync response:**
```json
{
  "success": true,
  "emailsSynced": 7,
  "threadsUpdated": 3
}
```

**Repair response:**
```json
{
  "success": true,
  "total_checked": 10,
  "summaries_generated": 8,
  "skipped": 1,
  "failed": 1,
  "failures": [{ "thread_id": "...", "subject": "...", "error": "..." }],
  "message": "Repair complete. 8 summary(ies) generated, 1 skipped, 1 failed."
}
```

### Email Reply

| Method | Path | Description |
|---|---|---|
| `POST` | `/reply` | Generate an AI reply draft for a thread |
| `POST` | `/reply/send` | Send the reply via Gmail API with proper threading headers |

**`/reply` request:**
```json
{
  "threadId": "uuid",
  "instruction": "Decline the meeting politely",
  "tone": "Professional"
}
```

**`/reply/send` request:**
```json
{
  "threadId": "uuid",
  "replyBody": "Thank you for the invitation..."
}
```

### Email Compose

| Method | Path | Description |
|---|---|---|
| `POST` | `/compose` | Generate a new email from a natural-language instruction |
| `POST` | `/compose/send` | Send or save-as-draft the composed email via Gmail API |

**`/compose` request:**
```json
{
  "instruction": "Write a follow-up email to the client about the project status",
  "tone": "Professional",
  "length": "medium"
}
```

**`/compose/send` request:**
```json
{
  "to": "recipient@example.com",
  "subject": "Project Status Update",
  "emailBody": "Hi...",
  "action": "send"
}
```
`action` is either `"send"` or `"draft"`.

### AI Chat

| Method | Path | Description |
|---|---|---|
| `POST` | `/chat` | Answer a question about the inbox using RAG retrieval |

**Request:**
```json
{
  "question": "What did Alice say about the Q3 deadline?",
  "history": [
    { "role": "user", "content": "Previous question" },
    { "role": "assistant", "content": "Previous answer" }
  ]
}
```

### Newsletter Insights

| Method | Path | Description |
|---|---|---|
| `GET` | `/newsletters/deduplicate` | Return cached clusters (compute on-the-fly if none cached) |
| `POST` | `/newsletters/deduplicate` | Force-recompute and refresh newsletter clusters |

---

## AI Features

### Email Categorisation
Gemini `gemini-2.5-flash-lite` (temperature 0.1) classifies each email into one of six categories during sync. Default is `"Work"` on failure. Categories: Work, Personal, Finance, Newsletter, Job, Notification.

### Thread Summarisation
After each sync, all modified threads are summarised using an adaptive prompt that outputs structured bullets (Main topic, Important information, Actions required, Deadlines). Model fallback chain handles quota exhaustion:
```
gemini-2.5-flash-lite → gemini-2.5-flash → gemini-2.0-flash
```
Quoted reply lines and `"On ... wrote:"` dividers are stripped before the prompt is constructed.

### Vector Embeddings
Each email is encoded as a 768-dimensional vector using Google's `text-embedding-004` model. Input: `"Subject: {subject}\n\nBody: {body}"`. Stored in pgvector with HNSW index (cosine distance). Fallback models: `gemini-embedding-001`, `gemini-embedding-2`.

### RAG Chat
User questions are embedded with the same model and matched against stored email vectors using cosine similarity (threshold 0.2). Top 10 matching emails are included as Gemini context. If vector search yields nothing, keyword substring matching provides a fallback. Multi-turn conversation history is preserved per session and passed to every Gemini call.

### AI Reply Generation
The entire thread history is assembled chronologically as context. Gemini drafts a reply following the user's instruction and requested tone (Professional, Friendly, Formal, Short). The user reviews and edits the draft before sending.

### AI Email Compose
Generates a complete `{ subject, body }` email from a natural-language instruction, tone, and length preference. Response is returned as JSON. The user can then send it immediately or save it as a Gmail draft.

### Newsletter Clustering
All newsletter emails are grouped by semantic similarity (cosine threshold 0.70). Each cluster is passed to `gemini-2.5-flash` which consolidates multiple newsletters into a single topic title and bullet-point summary. Single-email clusters are summarised individually. Results are cached in `newsletter_clusters`.

---

## Troubleshooting

### "No summary available" on thread cards after sync

The Gemini free tier allows 20 requests/day for `gemini-2.5-flash-lite`. Quota exhaustion mid-sync leaves `threads.summary = NULL`. After the daily quota resets (midnight Pacific Time):

```bash
curl -X POST http://localhost:3000/api/sync/repair-summaries \
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN"
```

### "Google OAuth access expired. Please reconnect settings." (HTTP 412)

The refresh token was revoked (e.g. Google account password changed, or app access revoked in Google account settings). Sign out and sign in again to issue a new refresh token.

### Sync returns `emailsSynced: 0` immediately

If `last_synced_at` is set and no new messages arrived after that timestamp, sync returns 0. This is expected behaviour.  
To force a full re-index, clear `last_synced_at` in the Supabase `users` table:
```sql
UPDATE users SET last_synced_at = NULL WHERE id = 'your-user-uuid';
```

### "Gmail API List failed: 401"

The Google access token is expired and the automatic refresh failed. Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correctly set in `.env.local` and that the backend server is running.

### Backend returns 401 "Authentication token missing"

The `Authorization: Bearer` header is not being forwarded. This can happen if the Next.js proxy is not running or `next.config.ts` rewrites are misconfigured. Confirm the frontend dev server is running on port 3000 and the backend on port 8000.

### `FutureWarning: google.generativeai package has ended support`

This warning is emitted by the `google-generativeai` PyPI package. It does not affect functionality in the current version. A future migration to the `google-genai` package will be required.

### Chat returns "I cannot find this information in your email sync history"

Either the relevant emails have not been synced yet, or their embeddings were not generated (possible if `text-embedding-004` hit a quota limit during sync). Trigger a new sync and check the backend logs for embedding errors.

---

## Future Roadmap

- [ ] **Async summarisation queue** — decouple Gemini calls from the sync HTTP response (Celery / ARQ / Supabase Edge Functions)
- [ ] **Gmail `historyId` incremental sync** — replace timestamp polling for faster, more reliable syncing
- [ ] **Gmail push notifications** — `users.watch` + Pub/Sub for automatic sync on new mail
- [ ] **Per-user Gemini API keys** — `users.gemini_api_key` column is reserved and ready
- [ ] **Streaming chat responses** — Server-Sent Events for real-time token output
- [ ] **PostgreSQL full-text search** — `tsvector` index on `emails.body` for higher-quality keyword fallback
- [ ] **Production CORS hardening** — restrict `allow_origins` to specific origin
- [ ] **Scheduled summary repair** — Supabase Cron to run repair-summaries daily
- [ ] **Mobile optimisation** — improved responsive layouts for inbox and chat views
- [ ] **Proper newsletter clustering** — replace O(n²) pairwise similarity with k-means or DBSCAN
- [ ] **Remove dev bypass token** — `dev-test-bypass-token` in `auth.py` must be removed before production
