-- =====================================================================
-- MailMind AI Supabase Schema Script
-- =====================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Drop existing tables if they exist (clean setup)
DROP FUNCTION IF EXISTS match_emails(vector, float, int, uuid);
DROP TABLE IF EXISTS newsletter_clusters CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS email_embeddings CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS threads CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 3. Create Tables

-- USERS Table
CREATE TABLE users (
    id UUID PRIMARY KEY, -- Maps directly to Supabase Auth User UUID
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar TEXT,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expires_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    gemini_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- THREADS Table
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gmail_thread_id TEXT NOT NULL,
    subject TEXT,
    summary TEXT,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

-- EMAILS Table
CREATE TABLE emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    gmail_message_id TEXT UNIQUE NOT NULL,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

-- EMAIL_EMBEDDINGS Table (pgvector 768-dimensions for text-embedding-004)
CREATE TABLE email_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email_id UUID UNIQUE NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    embedding vector(768) NOT NULL
);

-- CHAT_HISTORY Table
CREATE TABLE chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- NEWSLETTER_CLUSTERS Table
CREATE TABLE newsletter_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    summary TEXT NOT NULL,
    source_emails JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_clusters ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies

-- Users Policies
CREATE POLICY "Users can view own profile" 
    ON users FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON users FOR UPDATE 
    USING (auth.uid() = id);

-- Threads Policies
CREATE POLICY "Users can manage own threads" 
    ON threads FOR ALL 
    USING (auth.uid() = user_id);

-- Emails Policies
-- Allow access if parent thread belongs to the current authenticated user
CREATE POLICY "Users can manage own emails" 
    ON emails FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM threads 
            WHERE threads.id = emails.thread_id 
            AND threads.user_id = auth.uid()
        )
    );

-- Email Embeddings Policies
-- Allow access if parent email's thread belongs to the current authenticated user
CREATE POLICY "Users can manage own email embeddings" 
    ON email_embeddings FOR ALL 
    USING (
        EXISTS (
            SELECT 1 FROM emails
            JOIN threads ON threads.id = emails.thread_id
            WHERE emails.id = email_embeddings.email_id
            AND threads.user_id = auth.uid()
        )
    );

-- Chat History Policies
CREATE POLICY "Users can manage own chat history" 
    ON chat_history FOR ALL 
    USING (auth.uid() = user_id);

-- Newsletter Clusters Policies
CREATE POLICY "Users can manage own newsletter clusters" 
    ON newsletter_clusters FOR ALL 
    USING (auth.uid() = user_id);

-- 6. Create Indexes for Performance
CREATE INDEX idx_threads_user_id ON threads(user_id);
CREATE INDEX idx_threads_gmail_thread_id ON threads(gmail_thread_id);
CREATE INDEX idx_emails_thread_id ON emails(thread_id);
CREATE INDEX idx_emails_gmail_message_id ON emails(gmail_message_id);
CREATE INDEX idx_email_embeddings_email_id ON email_embeddings(email_id);
CREATE INDEX idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX idx_newsletter_clusters_user_id ON newsletter_clusters(user_id);

-- 7. Create pgvector Vector Indexes for Similarity Search (Cosine Distance)
CREATE INDEX idx_email_embeddings_vector ON email_embeddings 
USING hnsw (embedding vector_cosine_ops);

-- 8. Stored Procedure RPC function for RAG Vector Search
CREATE OR REPLACE FUNCTION match_emails (
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    user_uuid uuid
)
RETURNS TABLE (
    email_id UUID,
    subject TEXT,
    sender TEXT,
    receiver TEXT,
    body TEXT,
    created_at TIMESTAMPTZ,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id AS email_id,
        t.subject,
        e.sender,
        e.receiver,
        e.body,
        e.created_at,
        1 - (ee.embedding <=> query_embedding) AS similarity
    FROM email_embeddings ee
    JOIN emails e ON e.id = ee.email_id
    JOIN threads t ON t.id = e.thread_id
    WHERE t.user_id = user_uuid
      AND 1 - (ee.embedding <=> query_embedding) > match_threshold
    ORDER BY ee.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
