# TOOLS.md — Vos (VIB3 Backend)

## Backend

- **URL:** `http://149.50.148.131:4000`
- **Puerto:** 4000
- **Auth:** X-Agent-Key header (agente) o Bearer token (usuarios)
- **Agent API Key:** `clara_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- **Cliente ID:** 1

⚠️ No usar localhost ni 127.0.0.1 — siempre la IP del VPS.

---

## Auth

### Login

```powershell
$body = @{ username = "Vos"; password = "..." } | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/auth/login" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

Retorna: `{ token, user: { id, username, name, rol, client_id } }`

⚠️ El password de Vos en la DB es `demo_hash` (sin hashear correctamente). Temporal para demo. Mejor crear password real.

---

## Agente

### Obtener capabilities del agente

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/agent-capabilities" -Headers @{ "X-Agent-Key" = "clara_sk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" } -UseBasicParsing | ConvertTo-Json -Depth 5
```

Retorna: `[{ capability, method, endpoint, description, category }]`

---

## Leads

### Buscar lead por teléfono

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/leads?phone=:telefono" -UseBasicParsing | ConvertTo-Json -Depth 3
```

Retorna: `[{ id, name, phone, status, ... }]` o `[]`

### Crear lead

```powershell
$body = @{ client_id = 1; phone = ":telefono"; name = ":nombre"; status = "new" } | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/leads" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

### Listar leads

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/leads" -UseBasicParsing | ConvertTo-Json -Depth 5
```

### Actualizar lead

```powershell
$body = @{ status = "contacted"; name = ":nombre"; notes = ":notas" } | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/leads/:id" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

## Contacts (Clientes)

### Buscar contact por teléfono

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/contacts?phone=:telefono" -UseBasicParsing | ConvertTo-Json -Depth 3
```

Retorna: `[{ id, name, phone, ... }]` o `[]`

### Crear contact

```powershell
$body = @{
  client_id = 1
  name = ":nombre"
  phone = ":telefono"
  address = ":direccion"
  location = ":ciudad"
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/contacts" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

## Products

### Listar productos

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/products" -UseBasicParsing | ConvertTo-Json -Depth 5
```

Retorna: `[{ id, name, price, stock_quantity, category_name, brand_name, ... }]`

### Listar productos por categoría

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/products?category_id=:id" -UseBasicParsing | ConvertTo-Json -Depth 5
```

---

## Orders

### Crear pedido

```powershell
$body = @{
  client_id = 1
  contact_id = :contact_id
  payment_method_id = :metodo_id
  sale_channel_id = 1
  items = @(
    @{ product_id = :product_id; quantity = :cantidad; unit_price = :precio_unitario }
  )
  notes = ":observaciones"
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/orders" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

### Listar pedidos

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/orders" -UseBasicParsing | ConvertTo-Json -Depth 5
```

### Ver pedido específico

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/orders/:id" -UseBasicParsing | ConvertTo-Json -Depth 5
```

---

## Payment Methods

### Listar métodos de pago

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/payment-methods" -UseBasicParsing | ConvertTo-Json -Depth 3
```

Retorna: `[{ id, name, is_cash, ... }]`

Métodos actuales:
- id: 1 → Efectivo
- id: 3 → Transferencia
- id: 4 → Tarjeta Débito
- id: 5 → Tarjeta Crédito

---

## Cash Sessions

### Sesión activa de Vos

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/cash-sessions/current?user_id=5" -UseBasicParsing | ConvertTo-Json -Depth 3
```

Retorna: `{ id, user_id, status, session_type, ... }`

Session_id de Vos: **42** (abierta permanentemente para demo)

---

## Cash Movements (Cobros/Pagos)

### Registrar cobro

```powershell
$body = @{
  session_id = 42
  client_id = 1
  type = "in"
  reason = "sale"
  order_id = :order_id
  contact_id = :contact_id
  amount = :monto
  notes = ":cobro de venta"
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://149.50.148.131:4000/api/cash-movements" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

## Users (para escalar)

### Listar admins

```powershell
Invoke-RestMethod "http://149.50.148.131:4000/api/users" -UseBasicParsing | ConvertTo-Json -Depth 3
```

Filtrar por `rol = 'admin'` en código. Admin con teléfono: German Fabre (+5492644767641)

---

## Reglas de conexión

1. **Todos los requests requieren Bearer token** — hacer login primero, guardar token, usar en headers.
2. **Para datos siempre API** — nunca de memoria, nunca hardcodeado.
3. **Tiempo real** — stock y precios se consultan en el momento de la venta.
4. **Si la API no responde** → responder al cliente con error y no procesar nada hasta que funcione.