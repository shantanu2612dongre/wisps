-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ==========================================
-- 1. USERS
-- ==========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Users can only see and update their own record
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own record" ON users 
    FOR ALL USING (auth.uid() = id);

CREATE INDEX idx_users_created_at ON users(created_at);

-- ==========================================
-- 2. INTEGRATIONS
-- ==========================================
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_history_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Users can only access their own integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own integrations" ON integrations 
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_integrations_user_id ON integrations(user_id);
CREATE INDEX idx_integrations_created_at ON integrations(created_at);

-- ==========================================
-- 3. EVENTS
-- ==========================================
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Denormalized for RLS performance
    external_id TEXT,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    processed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(integration_id, external_id)
);

-- RLS: Users can only access their own events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own events" ON events 
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_events_integration_id ON events(integration_id);
CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_source ON events(source);
CREATE INDEX idx_events_processed ON events(processed);
CREATE INDEX idx_events_created_at ON events(created_at);

-- ==========================================
-- 4. MEMORY OBJECTS
-- ==========================================
CREATE TABLE memory_objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT,
    confidence FLOAT NOT NULL DEFAULT 1.0,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Users can only access their own memories
ALTER TABLE memory_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own memory_objects" ON memory_objects 
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_memory_objects_user_id ON memory_objects(user_id);
CREATE INDEX idx_memory_objects_type ON memory_objects(type);
CREATE INDEX idx_memory_objects_source ON memory_objects(source);
CREATE INDEX idx_memory_objects_created_at ON memory_objects(created_at);
-- HNSW index for vector embeddings
CREATE INDEX idx_memory_objects_embedding ON memory_objects USING hnsw (embedding vector_cosine_ops);

-- ==========================================
-- 5. AGENT RUNS
-- ==========================================
CREATE TABLE agent_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Denormalized for RLS performance
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input JSONB DEFAULT '{}'::jsonb,
    output JSONB,
    error TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- RLS: Users can only access their own agent runs
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own agent_runs" ON agent_runs 
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_agent_runs_event_id ON agent_runs(event_id);
CREATE INDEX idx_agent_runs_user_id ON agent_runs(user_id);
CREATE INDEX idx_agent_runs_created_at ON agent_runs(started_at);

-- ==========================================
-- TRIGGERS for updated_at
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_modtime BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_integrations_modtime BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_memory_objects_modtime BEFORE UPDATE ON memory_objects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- 6. MATCH MEMORIES (Vector Search RPC)
-- ==========================================
CREATE OR REPLACE FUNCTION match_memories (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  type text,
  title text,
  content jsonb,
  source text,
  confidence float,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    m.type,
    m.title,
    m.content,
    m.source,
    m.confidence,
    m.metadata,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM memory_objects m
  WHERE 
    m.user_id = p_user_id 
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
