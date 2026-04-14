require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'vib3ia-secret-key-change-in-production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

app.use(cors());
app.use(bodyParser.json());

// ─── MIDDLEWARE: Auth ──────────────────────────────────────────────
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// ─── HEALTH ────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// ─── AUTH ──────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Faltan datos' });

    const result = await pool.query(
      'SELECT u.*, c.name as client_name FROM users u JOIN clients c ON u.client_id = c.id WHERE u.username = $1 AND u.is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrecta' });
    }

    const user = result.rows[0];
    const validPassword = bcrypt.compareSync(password, user.password_hash) 
      || user.password_hash === bcrypt.hashSync(password, 'salt').slice(0, -28); // legacy MD5 compat

    // Direct MD5 check for existing users (backward compat)
    const crypto = require('crypto');
    const md5 = crypto.createHash('md5').update(password).digest('hex');
    if (user.password_hash !== md5 && !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, client_id: user.client_id, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      token, 
      user: { id: user.id, username: user.username, name: user.name, rol: user.rol, client_id: user.client_id, client_name: user.client_name }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT u.id, u.username, u.name, u.email, u.phone, u.rol, u.client_id, c.name as client_name FROM users u JOIN clients c ON u.client_id = c.id WHERE u.id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CLIENTS ───────────────────────────────────────────────────────
app.get('/api/clients', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const { name, logo_url, slogan, address, phone, email, business_hours, city, instagram_url, facebook_url, tiktok_url, web_url } = req.body;
    const result = await pool.query(
      `UPDATE clients SET
        name=COALESCE($1,name),
        logo_url=COALESCE($2,logo_url),
        slogan=COALESCE($3,slogan),
        address=COALESCE($4,address),
        phone=COALESCE($5,phone),
        email=COALESCE($6,email),
        business_hours=COALESCE($7,business_hours),
        city=COALESCE($8,city),
        instagram_url=COALESCE($9,instagram_url),
        facebook_url=COALESCE($10,facebook_url),
        tiktok_url=COALESCE($11,tiktok_url),
        web_url=COALESCE($12,web_url),
        updated_at=NOW()
       WHERE id=$13 RETURNING *`,
      [name, logo_url, slogan, address, phone, email, business_hours, city, instagram_url, facebook_url, tiktok_url, web_url, req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── USERS ─────────────────────────────────────────────────────────
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, client_id, username, name, email, phone, rol, is_active, created_at FROM users WHERE client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticate, async (req, res) => {
  try {
    const { username, password, name, email, phone, rol } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const password_hash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (client_id, username, password_hash, name, email, phone, rol) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, client_id, username, name, email, phone, rol, is_active',
      [req.user.client_id, username, password_hash, name, email, phone, rol || 'operator']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { name, email, phone, rol, is_active, password } = req.body;
    let query, params;
    if (password) {
      const password_hash = bcrypt.hashSync(password, 10);
      query = 'UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), rol=COALESCE($4,rol), is_active=COALESCE($5,is_active), password_hash=$6, updated_at=NOW() WHERE id=$7 AND client_id=$8 RETURNING id, client_id, username, name, email, phone, rol, is_active';
      params = [name, email, phone, rol, is_active, password_hash, req.params.id, req.user.client_id];
    } else {
      query = 'UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), rol=COALESCE($4,rol), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 AND client_id=$7 RETURNING id, client_id, username, name, email, phone, rol, is_active';
      params = [name, email, phone, rol, is_active, req.params.id, req.user.client_id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── AGENTS ────────────────────────────────────────────────────────
app.get('/api/agents', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents', authenticate, async (req, res) => {
  try {
    const { name, description, platform, working_hours, tone, industry_context, autonomy_level, instructions_permanent, instructions_transient } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const result = await pool.query(
      `INSERT INTO agents (client_id, name, description, platform, working_hours, tone, industry_context, autonomy_level, instructions_permanent, instructions_transient)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.client_id, name, description, platform || 'web', working_hours, tone, industry_context, autonomy_level, instructions_permanent || '', instructions_transient || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/agents/:id', authenticate, async (req, res) => {
  try {
    const { name, description, platform, is_active, working_hours, tone, industry_context, autonomy_level, instructions_permanent, instructions_transient } = req.body;
    const result = await pool.query(
      `UPDATE agents SET 
        name=COALESCE($1,name), description=COALESCE($2,description), platform=COALESCE($3,platform),
        is_active=COALESCE($4,is_active), working_hours=COALESCE($5,working_hours), tone=COALESCE($6,tone),
        industry_context=COALESCE($7,industry_context), autonomy_level=COALESCE($8,autonomy_level),
        instructions_permanent=COALESCE($9,instructions_permanent), instructions_transient=COALESCE($10,instructions_transient),
        updated_at=NOW()
       WHERE id=$11 AND client_id=$12 RETURNING *`,
      [name, description, platform, is_active, working_hours, tone, industry_context, autonomy_level, instructions_permanent, instructions_transient, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/agents/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM agents WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PAYMENT METHODS ───────────────────────────────────────────────
app.get('/api/payment-methods', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payment_methods WHERE client_id = $1 ORDER BY sort_order', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment-methods', authenticate, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO payment_methods (client_id, name, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [req.user.client_id, name, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/payment-methods/:id', authenticate, async (req, res) => {
  try {
    const { name, is_active, sort_order } = req.body;
    const result = await pool.query(
      'UPDATE payment_methods SET name=COALESCE($1,name), is_active=COALESCE($2,is_active), sort_order=COALESCE($3,sort_order), updated_at=NOW() WHERE id=$4 AND client_id=$5 RETURNING *',
      [name, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/payment-methods/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM payment_methods WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCT CATEGORIES ─────────────────────────────────────────────
app.get('/api/product-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_categories WHERE client_id = $1 ORDER BY sort_order', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-categories', authenticate, async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO product_categories (client_id, name, description, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.client_id, name, description, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-categories/:id', authenticate, async (req, res) => {
  try {
    const { name, description, is_active, sort_order } = req.body;
    const result = await pool.query(
      'UPDATE product_categories SET name=COALESCE($1,name), description=COALESCE($2,description), is_active=COALESCE($3,is_active), sort_order=COALESCE($4,sort_order), updated_at=NOW() WHERE id=$5 AND client_id=$6 RETURNING *',
      [name, description, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-categories/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_categories WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCT BRANDS ────────────────────────────────────────────────
app.get('/api/product-brands', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_brands WHERE client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-brands', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const result = await pool.query(
      'INSERT INTO product_brands (client_id, name) VALUES ($1, $2) RETURNING *',
      [req.user.client_id, name]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-brands/:id', authenticate, async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const result = await pool.query(
      'UPDATE product_brands SET name=COALESCE($1,name), is_active=COALESCE($2,is_active), updated_at=NOW() WHERE id=$3 AND client_id=$4 RETURNING *',
      [name, is_active, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-brands/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_brands WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCTS ──────────────────────────────────────────────────────
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, pc.name as category_name, pb.name as brand_name
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN product_brands pb ON p.brand_id = pb.id
      WHERE p.client_id = $1 AND p.is_active = true
      ORDER BY p.name
    `, [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', authenticate, async (req, res) => {
  try {
    const { sku, name, description, category_id, brand_id, price, unit, stock_quantity, min_stock } = req.body;
    const result = await pool.query(
      `INSERT INTO products (client_id, sku, name, description, category_id, brand_id, price, unit, stock_quantity, min_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.user.client_id, sku, name, description, category_id, brand_id, price || 0, unit || 'unidad', stock_quantity || 0, min_stock || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', authenticate, async (req, res) => {
  try {
    const { sku, name, description, category_id, brand_id, price, unit, stock_quantity, min_stock, is_active } = req.body;
    const result = await pool.query(
      `UPDATE products SET 
        sku=COALESCE($1,sku), name=COALESCE($2,name), description=COALESCE($3,description),
        category_id=COALESCE($4,category_id), brand_id=COALESCE($5,brand_id), price=COALESCE($6,price),
        unit=COALESCE($7,unit), stock_quantity=COALESCE($8,stock_quantity), min_stock=COALESCE($9,min_stock),
        is_active=COALESCE($10,is_active), updated_at=NOW()
       WHERE id=$11 AND client_id=$12 RETURNING *`,
      [sku, name, description, category_id, brand_id, price, unit, stock_quantity, min_stock, is_active, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CONTACTS ──────────────────────────────────────────────────────
app.get('/api/contacts', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts', authenticate, async (req, res) => {
  try {
    const { name, phone, email, address, location, notes } = req.body;
    const result = await pool.query(
      'INSERT INTO contacts (client_id, name, phone, email, address, location, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.user.client_id, name, phone, email, address, location, notes]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/contacts/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, email, address, location, notes } = req.body;
    const result = await pool.query(
      'UPDATE contacts SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email), address=COALESCE($4,address), location=COALESCE($5,location), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$7 AND client_id=$8 RETURNING *',
      [name, phone, email, address, location, notes, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/contacts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── ORDERS ────────────────────────────────────────────────────────
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, c.name as contact_name, c.phone as contact_phone, pm.name as payment_method_name
      FROM orders o
      LEFT JOIN contacts c ON o.contact_id = c.id
      LEFT JOIN payment_methods pm ON o.payment_method_id = pm.id
      WHERE o.client_id = $1
      ORDER BY o.created_at DESC
    `, [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { contact_id, payment_method_id, notes, items, delivery } = req.body;

    // Generate order number
    const countResult = await client.query('SELECT COUNT(*) FROM orders WHERE client_id = $1', [req.user.client_id]);
    const orderNum = `ORD-${String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0')}`;

    const subtotal = (items || []).reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price)), 0);
    const delivery_fee = delivery?.delivery_fee || 0;
    const total = subtotal + delivery_fee;

    await client.query('BEGIN');

    const orderResult = await client.query(`
      INSERT INTO orders (client_id, contact_id, order_number, subtotal, delivery_fee, total, payment_method_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [req.user.client_id, contact_id, orderNum, subtotal, delivery_fee, total, payment_method_id, notes]);

    const orderId = orderResult.rows[0].id;

    for (const item of (items || [])) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, item.product_id, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]
      );
    }

    if (delivery && (delivery.address || delivery.scheduled_date)) {
      await client.query(
        'INSERT INTO deliveries (order_id, address, location, scheduled_date, scheduled_time, delivery_fee, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [orderId, delivery.address, delivery.location, delivery.scheduled_date, delivery.scheduled_time, delivery_fee, delivery.notes]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: orderId, order_number: orderNum, message: 'Pedido creado' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const { status, payment_status, notes } = req.body;
    const result = await pool.query(
      'UPDATE orders SET status=COALESCE($1,status), payment_status=COALESCE($2,payment_status), notes=COALESCE($3,notes), updated_at=NOW() WHERE id=$4 AND client_id=$5 RETURNING *',
      [status, payment_status, notes, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── LEADS ─────────────────────────────────────────────────────────
app.get('/api/leads', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leads WHERE client_id = $1 ORDER BY created_at DESC', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads', authenticate, async (req, res) => {
  try {
    const { name, phone, email, source, notes, status } = req.body;
    const result = await pool.query(
      'INSERT INTO leads (client_id, name, phone, email, source, notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.user.client_id, name, phone, email, source, notes, status || 'new']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/leads/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, email, source, notes, status } = req.body;
    const result = await pool.query(
      'UPDATE leads SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email), source=COALESCE($4,source), notes=COALESCE($5,notes), status=COALESCE($6,status), updated_at=NOW() WHERE id=$7 AND client_id=$8 RETURNING *',
      [name, phone, email, source, notes, status, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/leads/:id', authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM leads WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── DASHBOARD SUMMARY ─────────────────────────────────────────────
app.get('/api/dashboard/summary', authenticate, async (req, res) => {
  try {
    const cid = req.user.client_id;
    const [
      contactsRes, productsRes, ordersTodayRes, ordersMonthRes,
      revenueTodayRes, revenueMonthRes, leadsOpenRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM contacts WHERE client_id = $1', [cid]),
      pool.query('SELECT COUNT(*) FROM products WHERE client_id = $1 AND is_active = true', [cid]),
      pool.query("SELECT COUNT(*) FROM orders WHERE client_id = $1 AND DATE(created_at) = CURRENT_DATE", [cid]),
      pool.query("SELECT COUNT(*) FROM orders WHERE client_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)", [cid]),
      pool.query("SELECT COALESCE(SUM(total), 0) FROM orders WHERE client_id = $1 AND DATE(created_at) = CURRENT_DATE AND payment_status = 'paid'", [cid]),
      pool.query("SELECT COALESCE(SUM(total), 0) FROM orders WHERE client_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) AND payment_status = 'paid'", [cid]),
      pool.query("SELECT COUNT(*) FROM leads WHERE client_id = $1 AND status NOT IN ('converted', 'discarded')", [cid]),
    ]);

    res.json({
      totalContacts: parseInt(contactsRes.rows[0].count),
      totalProducts: parseInt(productsRes.rows[0].count),
      ordersToday: parseInt(ordersTodayRes.rows[0].count),
      ordersMonth: parseInt(ordersMonthRes.rows[0].count),
      revenueToday: parseFloat(revenueTodayRes.rows[0].sum || 0),
      revenueMonth: parseFloat(revenueMonthRes.rows[0].sum || 0),
      leadsOpen: parseInt(leadsOpenRes.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── START ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 VIB3.ia Backend running on http://localhost:${PORT}`);
  console.log(`   Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
});
