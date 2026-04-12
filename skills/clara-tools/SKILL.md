# SKILL.md — Clara Tools

Clara usa estas herramientas para operar el backend de Cristal Piscinas en tiempo real.

**API Base:** `http://localhost:3001/api`

**Regla dorada:** NO hardcodear precios ni stock. Siempre consultar del API.

---

## Productos y catálogo

### `clara_getProducts(includeDiscontinued?)`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/products?includeDiscontinued=0" -UseBasicParsing | ConvertTo-Json -Depth 5
```

**Retorna:** array de productos activos — cada uno con:
```
id, sku, name, category_id, category_name,
brand_name, price, unit, stock, discontinued
```

**Para incluir discontinuados** (solo si necesitás consultar un producto específico): `includeDiscontinued=1`

**Uso:** siempre que un cliente pregunte por un producto, precio o disponibilidad.

---

### `clara_getStock(productId?)`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/stock" -UseBasicParsing | ConvertTo-Json -Depth 5
```

**Retorna:** stock por producto — `{ product_id, product_name, sku, quantity, min_quantity, unit }`

---

### `clara_getCategories()`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/categories" -UseBasicParsing | ConvertTo-Json
```

**Retorna:** categorías disponibles con ID y nombre.

---

## Clientes

### `clara_getClient(phone)`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/clients/PHONE" -UseBasicParsing
```
Reemplazar `PHONE` con formato E.164 (ej: `+5492644123456`).

**Retorna:** datos del cliente o `null` si no existe. Campos: `id, name, phone, address, location, notes, email, created_at`.

---

### `clara_createClient(data)`

```powershell
$body = @{
  name = "Nombre completo"
  phone = "+5492644000000"
  address = "Dirección completa"
  location = "Ciudad/Barrio"
  notes = "Notas opcionales"
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://127.0.0.1:3001/api/clients" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Retorna:** `{ id: N, message: "Cliente creado" }`

---

## Pedidos

### `clara_createOrder(payload)`

```powershell
$body = @{
  client_id = N
  payment_method = "efectivo"
  notes = ""
  items = @(
    @{ product_id = N; quantity = 1; unit_price = VALOR }
  )
  delivery = @{
    address = "Dirección de entrega"
    location = "Ciudad"
    scheduled_date = "YYYY-MM-DD"
    scheduled_time = "HH:MM"
    delivery_fee = VALOR
  }
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://127.0.0.1:3001/api/orders" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Retorna:** `{ id: N, order_number: "CP-XXXXX", message: "Pedido creado" }`

---

### `clara_getOrderDetail(orderId)`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/orders/ORDEN_ID" -UseBasicParsing | ConvertTo-Json -Depth 5
```

**Retorna:** pedido completo con datos del cliente, items, y delivery. Incluye `payment_status` (pending/paid) y `status` (pending/delivered/cancelled).

---

### `clara_updateOrderStatus(orderId, status)`

```powershell
$body = @{ status = "delivered" } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:3001/api/orders/ORDEN_ID/status" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Status de entrega válidos:** `pending` | `delivered` | `cancelled`

### `clara_markOrderPaid(orderId)`

```powershell
$body = @{ payment_status = "paid" } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:3001/api/orders/ORDEN_ID" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Uso:** cuando el cliente confirma que pagó (transferencia, efectivo).

---

## Leads

### `clara_createLead(data)`

```powershell
$body = @{
  name = "Juan Perez"
  phone = "+5492644123456"
  address = "Rivadavia, San Juan"
  location = "Rivadavia"
  products_interested = "Cloro shock, Alguicida"
  notes = "Consultó por cloro shock."
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://127.0.0.1:3001/api/leads" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing
```

**Retorna:** `{ id: N }`

**Uso:** cuando alguien consulta o se interesa pero no compra.

---

### `clara_getLeads()`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/leads" -UseBasicParsing | ConvertTo-Json -Depth 5
```

**Retorna:** todos los leads. Estados: `new` | `contacted` | `converted` | `discarded`

---

### `clara_updateLeadStatus(leadId, status)`

```powershell
$body = @{ status = "contacted" } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:3001/api/leads/LEAD_ID" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Transiciones válidas:**
- `new` → `contacted`
- `contacted` → `converted` (se volvió cliente) o `discarded`
- Cualquiera → `new` (reset, ej:accidente)

---

## Reclamos

### `clara_createComplaint(data)`

```powershell
$body = @{
  title = "Título del reclamo"
  description = "Descripción detallada"
  reason = "producto_defectuoso"
  client_id = N          # opcional
  order_id = N           # opcional
  product_id = N         # opcional
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://127.0.0.1:3001/api/reclamos" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Retorna:** `{ id: N }`

**Reasons válidos:** `producto_defectuoso` | `mal_servicio` | `entrega_tardia` | `error_en_pedido` | `otro`

---

### `clara_getComplaints()`

```powershell
Invoke-RestMethod "http://127.0.0.1:3001/api/reclamos" -UseBasicParsing | ConvertTo-Json -Depth 5
```

**Retorna:** todos los reclamos con datos del cliente, pedido y producto. Estados: `open` | `investigating` | `resolved`

---

### `clara_updateComplaintStatus(complaintId, status)`

```powershell
$body = @{ status = "investigating" } | ConvertTo-Json
Invoke-RestMethod "http://127.0.0.1:3001/api/reclamos/COMPLAINT_ID/status" -Method PUT -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Status válidos:** `open` | `investigating` | `resolved`

**Flujo para reclamos desde WhatsApp:**
1. Escuchar el problema del cliente con empatía
2. Registrar con `clara_createComplaint()` si hay datos suficientes
3. Avisar: "Entiendo. Voy a pasar esto a Ramiro para que lo revise personalmente. Se comunica con vos a la brevedad."
4. Derivar a Ramiro por `message` con los datos

---

## Stock

### `clara_adjustStock(productId, type, qty)`

```powershell
$body = @{
  type = "compra"        # compra | descarte | ajuste
  quantity = N
} | ConvertTo-Json -Compress
Invoke-RestMethod "http://127.0.0.1:3001/api/stock/PRODUCT_ID/adjust" -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | ConvertTo-Json
```

**Tipos:**
- `compra` — suma stock
- `descarte` — resta stock
- `ajuste` — setea stock al valor absoluto

---

## Flujo completo para crear un pedido

1. `clara_getClient(phone)` → ¿cliente ya existe?
2. Si no → `clara_createClient()` → obtener `client_id`
3. `clara_getProducts()` → mostrar catálogo y precios
4. `clara_createOrder()` → generar pedido

## Flujo para leads (consulta sin compra)

1. `clara_getProducts()` si quiere saber productos
2. `clara_createLead()` para registrar el interesse
3. Avisar que Ramiro se va a comunicar

## Reglas de datos obligatorios

**Para crear cliente:** nombre + teléfono + dirección (completa).
**Para crear pedido:** client_id (del cliente existente) + items + delivery.
**Para crear lead:** nombre + teléfono mínimo.

## Notas técnicas

- Todos los precios y stock se confirman con el backend real, no con ningún archivo local.
- El número de teléfono es la clave de identificación del cliente.
- Usar siempre valores reales del backend para precios.
- Para el campo `client_id` en createOrder, usar el `id` devuelto por getClient o createClient.
- **Productos discontinuados** (`discontinued=1`) se ocultan del catálogo público; solo aparecen con `includeDiscontinued=1`.
