-- API key para Clara (agent_id = 2 en vib3ia_alpha)
INSERT INTO agent_api_keys (agent_id, api_key) VALUES
(2, 'clara_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')
ON CONFLICT (api_key) DO NOTHING;
