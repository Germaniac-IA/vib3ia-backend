-- Tabla agent_api_keys
CREATE TABLE IF NOT EXISTS agent_api_keys (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP
);

-- Index para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_key ON agent_api_keys(api_key);

-- Insertar key para Clara (generada con random)
INSERT INTO agent_api_keys (agent_id, api_key) VALUES
(1, 'clara_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')
ON CONFLICT (api_key) DO NOTHING;
