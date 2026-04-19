-- Crear agente Clara (client_id = 20 = German)
INSERT INTO agents (name, phone, username, rol, client_id, is_active)
VALUES ('Clara', '+5492643161159', 'clara', 'agent', 20, true)
ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, is_active = EXCLUDED.is_active
RETURNING id;
