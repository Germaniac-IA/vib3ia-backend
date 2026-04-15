ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS location VARCHAR(255),
  ADD COLUMN IF NOT EXISTS instagram VARCHAR(255),
  ADD COLUMN IF NOT EXISTS facebook VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_channel VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_handle VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_contact_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS external_conversation_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS first_message TEXT,
  ADD COLUMN IF NOT EXISTS first_message_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_message TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS converted_contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMP;

UPDATE leads
SET source_channel = COALESCE(source_channel, source),
    first_message_at = COALESCE(first_message_at, created_at),
    last_message_at = COALESCE(last_message_at, updated_at, created_at),
    last_interaction_at = COALESCE(last_interaction_at, last_message_at, updated_at, created_at)
WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'leads'
      AND constraint_name = 'leads_status_check'
  ) THEN
    ALTER TABLE leads DROP CONSTRAINT leads_status_check;
  END IF;
END $$;

ALTER TABLE leads
  ADD CONSTRAINT leads_status_check CHECK (
    status IN ('new', 'contacted', 'waiting', 'qualified', 'converted', 'discarded', 'rejected')
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'leads'
      AND constraint_name = 'leads_converted_contact_id_fkey'
  ) THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_converted_contact_id_fkey
      FOREIGN KEY (converted_contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_client_status ON leads (client_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_converted_contact_id ON leads (converted_contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_last_interaction_at ON leads (last_interaction_at DESC);

CREATE TABLE IF NOT EXISTS lead_interactions (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  channel VARCHAR(50),
  direction VARCHAR(20) NOT NULL DEFAULT 'inbound',
  message_type VARCHAR(30) NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  external_message_id VARCHAR(255),
  sender_name VARCHAR(255),
  sender_handle VARCHAR(255),
  meta_json JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_interactions_lead_created_at
  ON lead_interactions (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_interactions_client_created_at
  ON lead_interactions (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  CONSTRAINT lead_sources_client_name_unique UNIQUE (client_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_client_active
  ON lead_sources (client_id, is_active, sort_order, name);

INSERT INTO lead_sources (client_id, name)
SELECT DISTINCT client_id, source
FROM leads
WHERE deleted_at IS NULL
  AND source IS NOT NULL
  AND BTRIM(source) <> ''
ON CONFLICT (client_id, name) DO NOTHING;
