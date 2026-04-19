# SPEC.md — Vos

## Overview

**Vos** es el agente de ventas de VIB3.ia, operando en WhatsApp para el cliente demo VIB3 Test (client_id=1). Su función es recibir consultas por WhatsApp, atender clientes, generar ventas y registrar pagos.

---

## Arquitectura

```
WhatsApp (+5492643161159)
    ↓
OpenClaw workspace-Vos
    ↓
Backend API VIB3 (149.50.148.131:4000)
    ↓
PostgreSQL (vib3ia_alpha, client_id=1)
```

---

## Stack técnico

- **Runtime:** OpenClaw workspace
- **Canal:** WhatsApp via OpenClaw
- **Backend:** Express/Node.js en VPS :4000 (solo API — sin SSH)
- **Auth:** X-Agent-Key header — agente autónomo, sin usuario/password
- **DB:** PostgreSQL vib3ia_alpha

---

## Funcionalidad

### Core features

1. **Recibir mensaje WhatsApp**
2. **Identificar cliente** (lead por teléfono)
3. **Consultar productos** (precio, stock)
4. **Registrar lead** si no existe
5. **Registrar venta** (order)
6. **Registrar cobro** (cash_movement)
7. **Convertir lead → cliente** (contact) cuando compra
8. **Escalar a admin** si no puede resolver

### Flujo de datos

```
Mensaje entrante
    → extraer teléfono
    → buscar/crear lead
    → clasificar intención
    → ejecutar acción (API)
    → responder al cliente
```

### Inicialización del agente

Al arrancar, el agente ejecuta:
1. `GET /api/agents/1` → config (name, tone, instructions)
2. `GET /api/agent-capabilities` → 95 operaciones
3. `GET /api/clients/1` → info del negocio (horarios, redes, teléfono)
4. Aplica instructions_permanent e instructions_transient

### Capabilities

Se leen de `/api/agent-capabilities`. 95 capabilities organizadas por categoría.

---

## Modelo de datos

### Users (Vos)
- id: 5
- username: Vos
- phone: +5492643161159
- rol: operator
- client_id: 1

### Cash Sessions
- id: 42 (abierta, session_type: cash, user_id: 5)

### Clients (VIB3 Test)
- id: 1
- name: VIB3 Test
- subdomain: vib3test

---

## Configuración de agente en DB

Tabla `agents` fila id=1:
- name: "Asistente"
- platform: whatsapp
- tone: casual
- autonomy_level: full
- working_hours: 24hs

**El nombre se actualiza desde el dashboard "Mis Agentes"** — no desde archivos.

---

## Pendiente

1. ✅ Backend expone `/api/agent-capabilities` con las capacidades activas
2. Testear flujo completo: lead → sale → cobro
3. Migrar OpenClaw al VPS

---

## Status

🟢 Capabilities operativo — 95 APIs disponibles via X-Agent-Key