# Migration Report: Next.js API Routes to FastAPI Backend

This report documents the architectural refactor of the **MailMind AI** application from Next.js 15 serverless route handlers to a production-grade Python **FastAPI** backend.

---

## 1. Migrated Files and Resources

The business logic previously residing in **8 Next.js route files** was fully migrated to Python and structured within the `backend/` workspace directory:

### Next.js API Files Migrated and Removed
* `src/app/api/auth/save-token/route.ts` ➔ Migrated to `backend/app/routers/auth.py`
* `src/app/api/sync/route.ts` ➔ Migrated to `backend/app/routers/sync.py`
* `src/app/api/sync/send/route.ts` ➔ Migrated to `backend/app/routers/reply.py`
* `src/app/api/reply/route.ts` ➔ Migrated to `backend/app/routers/reply.py`
* `src/app/api/chat/route.ts` ➔ Migrated to `backend/app/routers/chat.py`
* `src/app/api/compose/route.ts` ➔ Migrated to `backend/app/routers/compose.py`
* `src/app/api/compose/send/route.ts` ➔ Migrated to `backend/app/routers/compose.py`
* `src/app/api/newsletters/cluster/route.ts` ➔ Migrated to `backend/app/routers/newsletters.py`

### TypeScript Service Modules Deleted
To prevent code duplication, the entire Next.js service module folder `src/services/` was deleted:
* `src/services/gmail.ts` (Removed)
* `src/services/gemini.ts` (Removed)
* `src/services/embeddings.ts` (Removed)
* `src/services/retrieval.ts` (Removed)
* `src/services/newsletter.ts` (Removed)

---

## 2. New FastAPI Architecture

The Python backend is fully integrated inside the `backend/` directory with the following structure:

```
backend/
├── requirements.txt            # Python package dependencies
├── .env.example                # Config template
├── app/
│   ├── main.py                 # FastAPI Application & router registrations
│   ├── config.py               # Pydantic Settings env loader
│   ├── schemas.py              # Pydantic Request/Response models
│   ├── dependencies/
│   │   └── auth.py             # Cryptographic JWT validation dependency
│   ├── routers/
│   │   ├── auth.py             # google auth tokens handler
│   │   ├── sync.py             # gmail messages sync loop
│   │   ├── chat.py             # vector RAG chat endpoint
│   │   ├── compose.py          # standalone compose & drafting
│   │   ├── reply.py            # thread reply & sending
│   │   └── newsletters.py      # similarity clustering router
│   └── services/
│       ├── supabase_client.py  # Supabase client instantiation
│       ├── gmail.py            # Async httpx client connection to googleapis
│       ├── gemini.py           # Gemini 2.5 Flash completion wrappers
│       ├── embeddings.py       # text-embedding-004 vector calculations
│       ├── retrieval.py        # pgvector similarity searches
│       └── newsletter.py       # Cosine Similarity clustering pipeline
```

---

## 3. New API Routes & Mappings

The Next.js configuration maps incoming frontend calls to Uvicorn using Next.js proxy server rewrites in [next.config.ts](file:///c:/Users/abhin/OneDrive/Documents/anitgravity/gmail-assistant/next.config.ts):

| Frontend Request | Backend Route | Method | Payload / Models |
| :--- | :--- | :--- | :--- |
| `/api/auth/save-token` | `/auth/google` | `POST` | `GoogleAuthRequest` |
| `/api/sync` | `/sync` | `POST` | None |
| `/api/chat` | `/chat` | `POST` | `ChatRequest` |
| `/api/compose` | `/compose` | `POST` | `ComposeRequest` |
| `/api/compose/send` | `/compose/send` | `POST` | `ComposeSendRequest` |
| `/api/reply` | `/reply` | `POST` | `ReplyRequest` |
| `/api/sync/send` | `/reply/send` | `POST` | `ReplySendRequest` |
| `/api/newsletters/cluster` | `/newsletters/deduplicate` | `GET` / `POST` | None |
| None (Health Status) | `/health` | `GET` | None |

---

## 4. Local Authentication Mechanism

FastAPI uses a reusable dependency `get_current_user_id(token: str = Depends(get_token_from_header))`:
1. It extracts the Supabase JWT token from the `Authorization: Bearer <token>` request header.
2. If `SUPABASE_JWT_SECRET` is configured in `.env.local`, it performs **local cryptographic verification** using `pyjwt` (HS256 algorithm). This validates signatures and expiration times with **zero external API roundtrips**, yielding sub-millisecond execution.
3. If the local secret is missing or verification bails, it gracefully falls back to checking the session against Supabase's `auth.get_user(token)` API endpoint to guarantee uptime.

---

## 5. Local Backend Configuration

Populate a `.env` file in the `backend/` directory or update the root `.env.local`. The configuration loader reads both:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-supabase.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret-for-local-token-verification
GEMINI_API_KEY=your-gemini-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```
