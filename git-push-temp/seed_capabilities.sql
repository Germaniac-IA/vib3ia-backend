-- Seed agent_capabilities para Clara (agent_id = 1)
-- Por ahora todo abierto: allowed_for_clara = true, requires_owner_auth = false

INSERT INTO agent_capabilities (agent_id, capability_key, method, endpoint, description, requires_owner_auth, allowed_for_clara) VALUES
-- AUTH
(1, 'get_profile', 'GET', '/api/auth/me', 'Mi perfil de agente', false, true),

-- CLIENTS
(1, 'get_clients', 'GET', '/api/clients', 'Listar clientes', false, true),
(1, 'get_client', 'GET', '/api/clients/:id', 'Ver cliente por ID', false, true),
(1, 'update_client', 'PUT', '/api/clients/:id', 'Actualizar cliente', false, true),

-- CONTACTS
(1, 'get_contacts', 'GET', '/api/contacts', 'Listar contactos', false, true),
(1, 'create_contact', 'POST', '/api/contacts', 'Crear contacto', false, true),
(1, 'update_contact', 'PUT', '/api/contacts/:id', 'Actualizar contacto', false, true),
(1, 'delete_contact', 'DELETE', '/api/contacts/:id', 'Eliminar contacto', false, true),
(1, 'get_contacts_stats', 'GET', '/api/contacts/stats', 'Estadísticas de contactos', false, true),

-- LEADS
(1, 'get_leads', 'GET', '/api/leads', 'Listar leads', false, true),
(1, 'create_lead', 'POST', '/api/leads', 'Crear lead', false, true),
(1, 'update_lead', 'PUT', '/api/leads/:id', 'Actualizar lead', false, true),
(1, 'delete_lead', 'DELETE', '/api/leads/:id', 'Eliminar lead', false, true),
(1, 'convert_lead', 'PUT', '/api/leads/:id/convert', 'Convertir lead a cliente', false, true),
(1, 'deconvert_lead', 'PUT', '/api/leads/:id/deconvert', 'Desconvertir lead', false, true),
(1, 'resolve_lead', 'POST', '/api/leads/:id/resolve', 'Resolver lead', false, true),
(1, 'verify_lead_match', 'POST', '/api/leads/:id/verify-match', 'Verificar match de lead', false, true),
(1, 'get_lead_interactions', 'GET', '/api/leads/:id/interactions', 'Ver interacciones de lead', false, true),
(1, 'add_lead_interaction', 'POST', '/api/leads/:id/interactions', 'Agregar interacción a lead', false, true),
(1, 'get_leads_stats', 'GET', '/api/leads/stats', 'Estadísticas de leads', false, true),

-- LEAD SOURCES
(1, 'get_lead_sources', 'GET', '/api/lead-sources', 'Fuentes de lead', false, true),

-- PRODUCTS
(1, 'get_products', 'GET', '/api/products', 'Listar productos', false, true),
(1, 'create_product', 'POST', '/api/products', 'Crear producto', false, true),
(1, 'update_product', 'PUT', '/api/products/:id', 'Actualizar producto', false, true),
(1, 'delete_product', 'DELETE', '/api/products/:id', 'Eliminar producto', false, true),
(1, 'get_product_components', 'GET', '/api/products/:id/components', 'Componentes de producto', false, true),
(1, 'add_product_component', 'POST', '/api/products/:id/components', 'Agregar componente', false, true),
(1, 'remove_product_component', 'DELETE', '/api/products/:productId/components/:componentId', 'Quitar componente', false, true),
(1, 'upload_product_image', 'POST', '/api/products/:id/image', 'Subir imagen de producto', false, true),
(1, 'get_products_stats', 'GET', '/api/products/stats', 'Estadísticas de productos', false, true),

-- BRANDS
(1, 'get_brands', 'GET', '/api/product-brands', 'Listar marcas', false, true),

-- CATEGORIES
(1, 'get_categories', 'GET', '/api/product-categories', 'Listar categorías', false, true),

-- SALE CHANNELS
(1, 'get_sale_channels', 'GET', '/api/sale-channels', 'Canales de venta', false, true),

-- ORDERS
(1, 'get_orders', 'GET', '/api/orders', 'Listar pedidos', false, true),
(1, 'create_order', 'POST', '/api/orders', 'Crear pedido', false, true),
(1, 'get_order', 'GET', '/api/orders/:id', 'Ver pedido', false, true),
(1, 'update_order', 'PUT', '/api/orders/:id', 'Actualizar pedido', false, true),
(1, 'delete_order', 'DELETE', '/api/orders/:id', 'Eliminar pedido', false, true),
(1, 'get_orders_stats', 'GET', '/api/orders/stats', 'Estadísticas de pedidos', false, true),
(1, 'get_unpaid_orders', 'GET', '/api/orders/unpaid', 'Pedidos impagos', false, true),
(1, 'add_order_item', 'POST', '/api/orders/:id/items', 'Agregar item a pedido', false, true),
(1, 'update_order_item', 'PUT', '/api/orders/:id/items/:itemId', 'Actualizar item', false, true),
(1, 'remove_order_item', 'DELETE', '/api/orders/:id/items/:itemId', 'Quitar item', false, true),
(1, 'register_order_payment', 'POST', '/api/orders/:id/payments', 'Registrar pago de pedido', false, true),
(1, 'remove_order_payment', 'DELETE', '/api/orders/:id/payments/:paymentId', 'Eliminar pago', false, true),

-- ORDER STATUSES
(1, 'get_order_statuses', 'GET', '/api/order-statuses', 'Estados de pedido', false, true),

-- PAYMENTS
(1, 'get_payment_methods', 'GET', '/api/payment-methods', 'Métodos de pago', false, true),
(1, 'get_payment_statuses', 'GET', '/api/payment-statuses', 'Estados de pago', false, true),
(1, 'get_payment_stats', 'GET', '/api/payment/stats', 'Estadísticas de pagos', false, true),

-- CASH / CAJA
(1, 'get_cash_sessions', 'GET', '/api/cash-sessions', 'Sesiones de caja', false, true),
(1, 'open_cash_session', 'POST', '/api/cash-sessions', 'Abrir caja', false, true),
(1, 'get_current_cash_session', 'GET', '/api/cash-sessions/current', 'Sesión actual de caja', false, true),
(1, 'get_open_cash_sessions', 'GET', '/api/cash-sessions/open', 'Cajas abiertas', false, true),
(1, 'close_cash_session', 'POST', '/api/cash-sessions/:id/close', 'Cerrar caja', false, true),
(1, 'join_cash_session', 'POST', '/api/cash-sessions/:id/join', 'Unirse a caja', false, true),
(1, 'leave_cash_session', 'POST', '/api/cash-sessions/leave', 'Salir de caja', false, true),
(1, 'get_cash_movements', 'GET', '/api/cash-movements', 'Movimientos de caja', false, true),
(1, 'create_cash_movement', 'POST', '/api/cash-movements', 'Registrar movimiento de caja', false, true),
(1, 'delete_cash_movement', 'DELETE', '/api/cash-movements/:id', 'Eliminar movimiento', false, true),
(1, 'get_cash_stats', 'GET', '/api/cash/stats', 'Estadísticas de caja', false, true),

-- DELIVERIES
(1, 'get_deliveries', 'GET', '/api/deliveries', 'Listar entregas', false, true),
(1, 'create_delivery', 'POST', '/api/deliveries', 'Crear entrega', false, true),
(1, 'get_delivery', 'GET', '/api/deliveries/:id', 'Ver entrega', false, true),
(1, 'update_delivery', 'PUT', '/api/deliveries/:id', 'Actualizar entrega', false, true),
(1, 'confirm_delivery', 'POST', '/api/deliveries/:id/confirm', 'Confirmar entrega', false, true),
(1, 'cancel_delivery', 'POST', '/api/deliveries/:id/cancel', 'Cancelar entrega', false, true),
(1, 'get_deliveries_stats', 'GET', '/api/deliveries/stats', 'Estadísticas de entregas', false, true),

-- PURCHASE ORDERS / COMPRAS
(1, 'get_purchase_orders', 'GET', '/api/purchase-orders', 'Listar órdenes de compra', false, true),
(1, 'create_purchase_order', 'POST', '/api/purchase-orders', 'Crear orden de compra', false, true),
(1, 'get_purchase_order', 'GET', '/api/purchase-orders/:id', 'Ver orden de compra', false, true),
(1, 'update_purchase_order', 'PUT', '/api/purchase-orders/:id', 'Actualizar orden de compra', false, true),
(1, 'delete_purchase_order', 'DELETE', '/api/purchase-orders/:id', 'Eliminar orden de compra', false, true),
(1, 'add_purchase_order_item', 'POST', '/api/purchase-orders/:id/items', 'Agregar item a compra', false, true),
(1, 'remove_purchase_order_item', 'DELETE', '/api/purchase-orders/:id/items/:itemId', 'Quitar item', false, true),
(1, 'receive_purchase_order', 'POST', '/api/purchase-orders/:id/receive', 'Recibir orden de compra', false, true),
(1, 'get_purchase_orders_stats', 'GET', '/api/purchase-orders/stats', 'Estadísticas de compras', false, true),
(1, 'get_unpaid_purchase_orders', 'GET', '/api/purchase-orders/unpaid', 'Órdenes impagas', false, true),

-- INPUT ITEMS / INSUMOS
(1, 'get_input_items', 'GET', '/api/input-items', 'Listar insumos', false, true),
(1, 'create_input_item', 'POST', '/api/input-items', 'Crear insumo', false, true),
(1, 'update_input_item', 'PUT', '/api/input-items/:id', 'Actualizar insumo', false, true),
(1, 'delete_input_item', 'DELETE', '/api/input-items/:id', 'Eliminar insumo', false, true),
(1, 'update_input_item_cost', 'PATCH', '/api/input-items/:id/cost', 'Actualizar costo de insumo', false, true),

-- PROVIDERS / PROVEEDORES
(1, 'get_providers', 'GET', '/api/providers', 'Listar proveedores', false, true),
(1, 'create_provider', 'POST', '/api/providers', 'Crear proveedor', false, true),

-- ADVANCES / ANTICIPOS
(1, 'get_advances', 'GET', '/api/advances', 'Listar anticipos', false, true),
(1, 'create_advance', 'POST', '/api/advances', 'Crear anticipo', false, true),
(1, 'delete_advance', 'DELETE', '/api/advances/:id', 'Eliminar anticipo', false, true),
(1, 'use_advance', 'POST', '/api/advances/:id/use', 'Usar anticipo', false, true),
(1, 'get_advances_by_entity', 'GET', '/api/advances/by-entity/:entityType/:entityId', 'Anticipos por entidad', false, true),

-- DASHBOARD
(1, 'get_dashboard_summary', 'GET', '/api/dashboard/summary', 'Resumen general del dashboard', false, true),

-- HEALTH
(1, 'health_check', 'GET', '/api/health', 'Health check', false, true),

-- AGENTS (solo lectura)
(1, 'get_agents', 'GET', '/api/agents', 'Listar agentes', false, true),
(1, 'get_agent', 'GET', '/api/agents/:id', 'Ver agente', false, true),

-- USERS (solo lectura)
(1, 'get_users', 'GET', '/api/users', 'Listar usuarios', false, true),
(1, 'get_user', 'GET', '/api/users/:id', 'Ver usuario', false, true)
ON CONFLICT (agent_id, capability_key, method) DO UPDATE SET
  description = EXCLUDED.description,
  endpoint = EXCLUDED.endpoint,
  allowed_for_clara = EXCLUDED.allowed_for_clara,
  requires_owner_auth = EXCLUDED.requires_owner_auth;
