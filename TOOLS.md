# TOOLS.md — Clara

## Canal WhatsApp

- Clara responde desde: **+5492643161159**
- Local: **+542644367457**
- Ramiro directo: **+5492644747199**

## Backend Cristal Piscinas

- **URL:** `https://cristal-pg-production.up.railway.app/api`
- **Puerto:** 3001
- **Base:** `C:\cristal-backend\cristal.db`

## Herramientas del API

Todas se invocan via `exec` con PowerShell.

---

### Consultar productos (activos)

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/products?includeDiscontinued=0" -UseBasicParsing | ConvertTo-Json -Depth 5
```
Retorna: `id, sku, name, category_name, brand_name, price, unit, stock`

---

### Buscar cliente por teléfono

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/clients/+5492644000000" -UseBasicParsing | ConvertTo-Json
```
Retorna: datos del cliente o 404 si no existe.

---

### Listar clientes

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/clients" -UseBasicParsing | ConvertTo-Json -Depth 3
```

---

### Registrar cliente nuevo

```powershell
$body = @{ name="Nombre"; phone="+5492644000000"; address="Dirección"; location="Ciudad"; notes="Notas" } | ConvertTo-Json -Compress
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/clients" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Crear pedido

```powershell
$body = @{
  client_id = N
  payment_method = "efectivo"
  notes = ""
  items = @( @{ product_id = N; quantity = 1; unit_price = VALOR } )
  delivery = @{ address = "Dirección"; location = "Ciudad"; scheduled_date = "YYYY-MM-DD"; scheduled_time = "HH:MM"; delivery_fee = 0 }
} | ConvertTo-Json -Compress
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/orders" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Ver detalle de pedido

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/orders/ID" -UseBasicParsing | ConvertTo-Json -Depth 5
```

---

### Marcar pedido como pagado

```powershell
$body = @{ payment_status = "paid" } | ConvertTo-Json
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/orders/ID" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Marcar pedido como entregado

```powershell
$body = @{ status = "delivered" } | ConvertTo-Json
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/orders/ID/status" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Listar leads

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/leads" -UseBasicParsing | ConvertTo-Json -Depth 5
```

---

### Actualizar estado de lead

```powershell
$body = @{ status = "contacted" } | ConvertTo-Json
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/leads/ID" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```
Estados: `new` | `contacted` | `converted` | `discarded`

---

### Registrar lead

```powershell
$body = @{ name="Nombre"; phone="+5492644000000"; address="Dirección"; location="Ciudad"; products_interested="Producto"; notes="Notas" } | ConvertTo-Json -Compress
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/leads" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Crear reclamo

```powershell
$body = @{ title="Título"; description="Descripción"; reason="producto_defectuoso"; client_id=N; order_id=N } | ConvertTo-Json -Compress
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/reclamos" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

---

### Listar reclamos

```powershell
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/reclamos" -UseBasicParsing | ConvertTo-Json -Depth 5
```

---

### Actualizar estado de reclamo

```powershell
$body = @{ status = "investigating" } | ConvertTo-Json
Invoke-RestMethod "https://cristal-pg-production.up.railway.app/api/reclamos/ID/status" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```
Estados: `open` | `investigating` | `resolved`

---

## Reglas

- Precios y stock SIEMPRE del API, nunca de memoria
- Teléfono = identidad del cliente
- Para pedido: client_id necesario (obtenido de getClient o al registrar)
