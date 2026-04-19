SELECT a.id, a.name, aak.api_key FROM agents a JOIN agent_api_keys aak ON a.id = aak.agent_id;
