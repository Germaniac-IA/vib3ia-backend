-- Tabla agent_instructions
CREATE TABLE IF NOT EXISTS agent_instructions (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('permanent', 'transient')),
    content TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_agent_instructions_agent_type ON agent_instructions(agent_id, type);

-- Migrar datos existentes de instructions_permanent/transient del agent 1
-- Si ya tenés contenido en esos campos, se migran como una instrucción
INSERT INTO agent_instructions (agent_id, type, content, sort_order)
SELECT 1, 'permanent', instructions_permanent, 1
FROM agents WHERE id = 1 AND instructions_permanent IS NOT NULL AND instructions_permanent != ''
ON CONFLICT DO NOTHING;

INSERT INTO agent_instructions (agent_id, type, content, sort_order)
SELECT 1, 'transient', instructions_transient, 1
FROM agents WHERE id = 1 AND instructions_transient IS NOT NULL AND instructions_transient != ''
ON CONFLICT DO NOTHING;
