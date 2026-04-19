-- Tabla agents
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    rol VARCHAR(20) DEFAULT 'agent',
    client_id INTEGER REFERENCES clients(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla agent_capabilities
CREATE TABLE IF NOT EXISTS agent_capabilities (
    id SERIAL PRIMARY KEY,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    capability_key VARCHAR(100) NOT NULL,
    method VARCHAR(10) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    description TEXT,
    requires_owner_auth BOOLEAN DEFAULT false,
    allowed_for_clara BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, capability_key, method)
);

-- Tabla restricted_actions
CREATE TABLE IF NOT EXISTS restricted_actions (
    id SERIAL PRIMARY KEY,
    action_pattern VARCHAR(100) NOT NULL,
    agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
    reason TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
