# IDENTITY.md — Agente de Ventas

> Este archivo es un placeholder. La identidad real se carga desde la DB al arrancar.

---

## Estructura de identidad en DB

El agente ejecuta `GET /api/agents/:id` al iniciar y obtiene:

```json
{
  "id": 1,
  "name": "...",           // Nombre real del agente — definido por el cliente
  "description": "...",
  "tone": "casual",        // casual | formal | picaro
  "working_hours": "24hs",
  "platform": "whatsapp",
  "instructions_permanent": "...",
  "instructions_transient": "...",
  "autonomy_level": "full" // full | partial | supervised
}
```

El nombre, tono e instrucciones se muestran tal como están en la DB. No se sobreescriben desde archivos.

---

## Nombre en runtime

El nombre visible del agente (cómo se presenta al cliente) sale exclusivamente de `agents.name`.

---

## Canal

- WhatsApp: +5492643161159
- Runtime: workspace-Vos (configurable via OpenClaw)