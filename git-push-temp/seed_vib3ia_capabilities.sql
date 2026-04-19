-- Seed agent_capabilities para client_id = 1 (VIB3.ia / German)
INSERT INTO agent_capabilities (client_id, capability, description, endpoint, method, category, is_active) VALUES
-- AUTH
(1, 'get_profile', 'Mi perfil de agente', '/api/auth/me', 'GET', 'auth', true),

-- CLIENTS
(1, 'get_clients', 'Listar clientes', '/api/clients', 'GET', 'clients', true),
(1, 'get_client', 'Ver cliente por ID', '/api/clients/:id', 'GET', 'clients', true),
(1, 'update_client', 'Actualizar cliente', '/api/clients/:id', 'PUT', 'clients', true),

-- CONTACTS
(1, 'get_contacts', 'Listar contactos', '/api/contacts', 'GET', 'contacts', true),
(1, 'create_contact', 'Crear contacto', '/api/contacts', 'POST', 'contacts', true),
(1, 'update_contact', 'Actualizar contacto', '/api/contacts/:id', 'PUT', 'contacts', true),
(1, 'delete_contact', 'Eliminar contacto', '/api/contacts/:id', 'DELETE', 'contacts', true),
(1, 'get_contacts_stats', 'Estadísticas de contactos', '/api/contacts/stats', 'GET', 'contacts', true),

-- LEADS
(1, 'get_leads', 'Listar leads', '/api/leads', 'GET', 'leads', true),
(1, 'create_lead', 'Crear lead', '/api/leads', 'POST', 'leads', true),
(1, 'update_lead', 'Actualizar lead', '/api/leads/:id', 'PUT', 'leads', true),
(1, 'delete_lead', 'Eliminar lead', '/api/leads/:id', 'DELETE', 'leads', true),
(1, 'convert_lead', 'Convertir lead a cliente', '/api/leads/:id/convert', 'PUT', 'leads', true),
(1, 'deconvert_lead', 'Desconvertir lead', '/api/leads/:id/deconvert', 'PUT', 'leads', true),
(1, 'resolve_lead', 'Resolver lead', '/api/leads/:id/resolve', 'POST', 'leads', true),
(1, 'verify_lead_match', 'Verificar match de lead', '/api/leads/:id/verify-match', 'POST', 'leads', true),
(1, 'get_lead_interactions', 'Ver interacciones de lead', '/api/leads/:id/interactions', 'GET', 'leads', true),
(1, 'add_lead_interaction', 'Agregar interacción a lead', '/api/leads/:id/interactions', 'POST', 'leads', true),
(1, 'get_leads_stats', 'Estadísticas de leads', '/api/leads/stats', 'GET', 'leads', true),

-- LEAD SOURCES
(1, 'get_lead_sources', 'Fuentes de lead', '/api/lead-sources', 'GET', 'leads', true),

-- PRODUCTS
(1, 'get_products', 'Listar productos', '/api/products', 'GET', 'products', true),
(1, 'create_product', 'Crear producto', '/api/products', 'POST', 'products', true),
(1, 'update_product', 'Actualizar producto', '/api/products/:id', 'PUT', 'products', true),
(1, 'delete_product', 'Eliminar producto', '/api/products/:id', 'DELETE', 'products', true),
(1, 'get_product_components', 'Componentes de producto', '/api/products/:id/components', 'GET', 'products', true),
(1, 'add_product_component', 'Agregar componente', '/api/products/:id/components', 'POST', 'products', true),
(1, 'remove_product_component', 'Quitar componente', '/api/products/:productId/components/:componentId', 'DELETE', 'products', true),
(1, 'upload_product_image', 'Subir imagen de producto', '/api/products/:id/image', 'POST', 'products', true),
(1, 'get_products_stats', 'Estadísticas de productos', '/api/products/stats', 'GET', 'products', true),

-- BRANDS
(1, 'get_brands', 'Listar marcas', '/api/product-brands', 'GET', 'products', true),

-- CATEGORIES
(1, 'get_categories', 'Listar categorías', '/api/product-categories', 'GET', 'products', true),

-- SALE CHANNELS
(1, 'get_sale_channels', 'Canales de venta', '/api/sale-channels', 'GET', 'products', true),

-- ORDERS
(1, 'get_orders', 'Listar pedidos', '/api/orders', 'GET', 'orders', true),
(1, 'create_order', 'Crear pedido', '/api/orders', 'POST', 'orders', true),
(1, 'get_order', 'Ver pedido', '/api/orders/:id', 'GET', 'orders', true),
(1, 'update_order', 'Actualizar pedido', '/api/orders/:id', 'PUT', 'orders', true),
(1, 'delete_order', 'Eliminar pedido', '/api/orders/:id', 'DELETE', 'orders', true),
(1, 'get_orders_stats', 'Estadísticas de pedidos', '/api/orders/stats', 'GET', 'orders', true),
(1, 'get_unpaid_orders', 'Pedidos impagos', '/api/orders/unpaid', 'GET', 'orders', true),
(1, 'add_order_item', 'Agregar item a pedido', '/api/orders/:id/items', 'POST', 'orders', true),
(1, 'update_order_item', 'Actualizar item', '/api/orders/:id/items/:itemId', 'PUT', 'orders', true),
(1, 'remove_order_item', 'Quitar item', '/api/orders/:id/items/:itemId', 'DELETE', 'orders', true),
(1, 'register_order_payment', 'Registrar pago de pedido', '/api/orders/:id/payments', 'POST', 'orders', true),
(1, 'remove_order_payment', 'Eliminar pago', '/api/orders/:id/payments/:paymentId', 'DELETE', 'orders', true),

-- ORDER STATUSES
(1, 'get_order_statuses', 'Estados de pedido', '/api/order-statuses', 'GET', 'orders', true),

-- PAYMENTS
(1, 'get_payment_methods', 'Métodos de pago', '/api/payment-methods', 'GET', 'payments', true),
(1, 'get_payment_statuses', 'Estados de pago', '/api/payment-statuses', 'GET', 'payments', true),
(1, 'get_payment_stats', 'Estadísticas de pagos', '/api/payment/stats', 'GET', 'payments', true),

-- CASH / CAJA
(1, 'get_cash_sessions', 'Sesiones de caja', '/api/cash-sessions', 'GET', 'cash', true),
(1, 'open_cash_session', 'Abrir caja', '/api/cash-sessions', 'POST', 'cash', true),
(1, 'get_current_cash_session', 'Sesión actual de caja', '/api/cash-sessions/current', 'GET', 'cash', true),
(1, 'get_open_cash_sessions', 'Cajas abiertas', '/api/cash-sessions/open', 'GET', 'cash', true),
(1, 'close_cash_session', 'Cerrar caja', '/api/cash-sessions/:id/close', 'POST', 'cash', true),
(1, 'join_cash_session', 'Unirse a caja', '/api/cash-sessions/:id/join', 'POST', 'cash', true),
(1, 'leave_cash_session', 'Salir de caja', '/api/cash-sessions/leave', 'POST', 'cash', true),
(1, 'get_cash_movements', 'Movimientos de caja', '/api/cash-movements', 'GET', 'cash', true),
(1, 'create_cash_movement', 'Registrar movimiento de caja', '/api/cash-movements', 'POST', 'cash', true),
(1, 'delete_cash_movement', 'Eliminar movimiento', '/api/cash-movements/:id', 'DELETE', 'cash', true),
(1, 'get_cash_stats', 'Estadísticas de caja', '/api/cash/stats', 'GET', 'cash', true),

-- DELIVERIES
(1, 'get_deliveries', 'Listar entregas', '/api/deliveries', 'GET', 'deliveries', true),
(1, 'create_delivery', 'Crear entrega', '/api/deliveries', 'POST', 'deliveries', true),
(1, 'get_delivery', 'Ver entrega', '/api/deliveries/:id', 'GET', 'deliveries', true),
(1, 'update_delivery', 'Actualizar entrega', '/api/deliveries/:id', 'PUT', 'deliveries', true),
(1, 'confirm_delivery', 'Confirmar entrega', '/api/deliveries/:id/confirm', 'POST', 'deliveries', true),
(1, 'cancel_delivery', 'Cancelar entrega', '/api/deliveries/:id/cancel', 'POST', 'deliveries', true),
(1, 'get_deliveries_stats', 'Estadísticas de entregas', '/api/deliveries/stats', 'GET', 'deliveries', true),

-- PURCHASE ORDERS / COMPRAS
(1, 'get_purchase_orders', 'Listar órdenes de compra', '/api/purchase-orders', 'GET', 'purchases', true),
(1, 'create_purchase_order', 'Crear orden de compra', '/api/purchase-orders', 'POST', 'purchases', true),
(1, 'get_purchase_order', 'Ver orden de compra', '/api/purchase-orders/:id', 'GET', 'purchases', true),
(1, 'update_purchase_order', 'Actualizar orden de compra', '/api/purchase-orders/:id', 'PUT', 'purchases', true),
(1, 'delete_purchase_order', 'Eliminar orden de compra', '/api/purchase-orders/:id', 'DELETE', 'purchases', true),
(1, 'add_purchase_order_item', 'Agregar item a compra', '/api/purchase-orders/:id/items', 'POST', 'purchases', true),
(1, 'remove_purchase_order_item', 'Quitar item', '/api/purchase-orders/:id/items/:itemId', 'DELETE', 'purchases', true),
(1, 'receive_purchase_order', 'Recibir orden de compra', '/api/purchase-orders/:id/receive', 'POST', 'purchases', true),
(1, 'get_purchase_orders_stats', 'Estadísticas de compras', '/api/purchase-orders/stats', 'GET', 'purchases', true),
(1, 'get_unpaid_purchase_orders', 'Órdenes impagas', '/api/purchase-orders/unpaid', 'GET', 'purchases', true),

-- INPUT ITEMS / INSUMOS
(1, 'get_input_items', 'Listar insumos', '/api/input-items', 'GET', 'inputs', true),
(1, 'create_input_item', 'Crear insumo', '/api/input-items', 'POST', 'inputs', true),
(1, 'update_input_item', 'Actualizar insumo', '/api/input-items/:id', 'PUT', 'inputs', true),
(1, 'delete_input_item', 'Eliminar insumo', '/api/input-items/:id', 'DELETE', 'inputs', true),
(1, 'update_input_item_cost', 'Actualizar costo de insumo', '/api/input-items/:id/cost', 'PATCH', 'inputs', true),

-- PROVIDERS / PROVEEDORES
(1, 'get_providers', 'Listar proveedores', '/api/providers', 'GET', 'providers', true),
(1, 'create_provider', 'Crear proveedor', '/api/providers', 'POST', 'providers', true),

-- ADVANCES / ANTICIPOS
(1, 'get_advances', 'Listar anticipos', '/api/advances', 'GET', 'advances', true),
(1, 'create_advance', 'Crear anticipo', '/api/advances', 'POST', 'advances', true),
(1, 'delete_advance', 'Eliminar anticipo', '/api/advances/:id', 'DELETE', 'advances', true),
(1, 'use_advance', 'Usar anticipo', '/api/advances/:id/use', 'POST', 'advances', true),
(1, 'get_advances_by_entity', 'Anticipos por entidad', '/api/advances/by-entity/:entityType/:entityId', 'GET', 'advances', true),

-- DASHBOARD
(1, 'get_dashboard_summary', 'Resumen general del dashboard', '/api/dashboard/summary', 'GET', 'dashboard', true),

-- HEALTH
(1, 'health_check', 'Health check', '/api/health', 'GET', 'system', true),

-- AGENTS (solo lectura)
(1, 'get_agents', 'Listar agentes', '/api/agents', 'GET', 'agents', true),
(1, 'get_agent', 'Ver agente', '/api/agents/:id', 'GET', 'agents', true),

-- USERS (solo lectura)
(1, 'get_users', 'Listar usuarios', '/api/users', 'GET', 'users', true),
(1, 'get_user', 'Ver usuario', '/api/users/:id', 'GET', 'users', true)
ON CONFLICT (client_id, capability) DO UPDATE SET
  description = EXCLUDED.description,
  endpoint = EXCLUDED.endpoint,
  method = EXCLUDED.method,
  category = EXCLUDED.category;
