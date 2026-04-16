require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const fs = require('fs');

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
app.use(bodyParser.json({ limit: '50mb' }));

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

function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeLeadStatus(status) {
  if (status === undefined || status === null || status === '') return null;
  if (status === 'discarded') return 'rejected';
  return status;
}

function appendUniqueNote(base, extra) {
  const left = cleanText(base);
  const right = cleanText(extra);
  if (!left) return right;
  if (!right || left.includes(right)) return left;
  return `${left}\n\n${right}`;
}

function parseJsonOrNull(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
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
    const result = await pool.query('SELECT * FROM clients WHERE deleted_at IS NULL AND id = $1', [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/clients/:id', authenticate, async (req, res) => {
  try {
    const { name, logo_url, slogan, address, phone, whatsapp, email, business_hours, city, instagram_url, facebook_url, tiktok_url, web_url } = req.body;
    const result = await pool.query(
      `UPDATE clients SET
        name=COALESCE($1,name),
        logo_url=COALESCE($2,logo_url),
        slogan=COALESCE($3,slogan),
        address=COALESCE($4,address),
        phone=COALESCE($5,phone),
        whatsapp=COALESCE($6,whatsapp),
        email=COALESCE($7,email),
        business_hours=COALESCE($8,business_hours),
        city=COALESCE($9,city),
        instagram_url=COALESCE($10,instagram_url),
        facebook_url=COALESCE($11,facebook_url),
        tiktok_url=COALESCE($12,tiktok_url),
        web_url=COALESCE($13,web_url),
        updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [name, logo_url, slogan, address, phone, whatsapp, email,
       business_hours ? (Array.isArray(business_hours) ? JSON.stringify(business_hours) : business_hours) : null,
       city, instagram_url, facebook_url, tiktok_url, web_url, req.params.id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── FISCAL DATA ────────────────────────────────────────────────────────────
app.get('/api/fiscal-data/:clientId', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM fiscal_data WHERE deleted_at IS NULL AND client_id = $1', [req.params.clientId]);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/fiscal-data/:clientId', authenticate, async (req, res) => {
  try {
    const { razon_social, cuit, condicion_iva, situacion_iibb, numero_iibb } = req.body;
    const result = await pool.query(
      `INSERT INTO fiscal_data (client_id, razon_social, cuit, condicion_iva, situacion_iibb, numero_iibb)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id) DO UPDATE SET
         razon_social=EXCLUDED.razon_social,
         cuit=EXCLUDED.cuit,
         condicion_iva=EXCLUDED.condicion_iva,
         situacion_iibb=EXCLUDED.situacion_iibb,
         numero_iibb=EXCLUDED.numero_iibb
       RETURNING *`,
      [req.params.clientId, razon_social, cuit, condicion_iva, situacion_iibb, numero_iibb]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── USERS ─────────────────────────────────────────────────────────
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, client_id, username, name, email, phone, telegram_id, rol, is_active, created_at FROM users WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users', authenticate, async (req, res) => {
  try {
    const { username, password, name, email, phone, telegram_id, rol } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const password_hash = bcrypt.hashSync(password, 10);
    const result = await pool.query(
      'INSERT INTO users (client_id, username, password_hash, name, email, phone, telegram_id, rol) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, client_id, username, name, email, phone, telegram_id, rol, is_active',
      [req.user.client_id, username, password_hash, name, email, phone, telegram_id || null, rol || 'operator']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticate, async (req, res) => {
  try {
    const { name, email, phone, telegram_id, rol, is_active, password } = req.body;
    let query, params;
    if (password) {
      const password_hash = bcrypt.hashSync(password, 10);
      query = 'UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), telegram_id=COALESCE($4,telegram_id), rol=COALESCE($5,rol), is_active=COALESCE($6,is_active), password_hash=$7, updated_at=NOW() WHERE id=$8 AND client_id=$9 RETURNING id, client_id, username, name, email, phone, telegram_id, rol, is_active';
      params = [name, email, phone, telegram_id, rol, is_active, password_hash, req.params.id, req.user.client_id];
    } else {
      query = 'UPDATE users SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone), telegram_id=COALESCE($4,telegram_id), rol=COALESCE($5,rol), is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 AND client_id=$8 RETURNING id, client_id, username, name, email, phone, telegram_id, rol, is_active';
      params = [name, email, phone, telegram_id, rol, is_active, req.params.id, req.user.client_id];
    }
    const result = await pool.query(query, params);
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── AGENTS ────────────────────────────────────────────────────────
app.get('/api/agents', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/agents/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
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
    await pool.query('UPDATE agents SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PAYMENT METHODS ───────────────────────────────────────────────
app.get('/api/payment-methods', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payment_methods WHERE deleted_at IS NULL AND client_id = $1 ORDER BY sort_order', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payment-methods', authenticate, async (req, res) => {
  try {
    const { name, is_personal, is_cash, cbu_cvu, alias, banco, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO payment_methods (client_id, name, is_personal, is_cash, cbu_cvu, alias, banco, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [req.user.client_id, name, is_personal || false, is_cash !== false, cbu_cvu || null, alias || null, banco || null, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/payment-methods/:id', authenticate, async (req, res) => {
  try {
    const { name, is_personal, is_cash, cbu_cvu, alias, banco, is_active, sort_order } = req.body;
    const result = await pool.query(
      `UPDATE payment_methods SET 
        name=COALESCE($1,name), 
        is_personal=COALESCE($2,is_personal), 
        is_cash=COALESCE($3,is_cash), 
        cbu_cvu=COALESCE($4,cbu_cvu), 
        alias=COALESCE($5,alias), 
        banco=COALESCE($6,banco), 
        is_active=COALESCE($7,is_active), 
        sort_order=COALESCE($8,sort_order), 
        updated_at=NOW() 
       WHERE id=$9 AND client_id=$10 RETURNING *`,
      [name, is_personal, is_cash, cbu_cvu, alias, banco, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/payment-methods/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE payment_methods SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCT CATEGORIES ─────────────────────────────────────────────
app.get('/api/product-categories', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_categories WHERE deleted_at IS NULL AND client_id = $1 ORDER BY sort_order', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-categories', authenticate, async (req, res) => {
  try {
    const { name, description, sort_order, auto_generate_sku, sku_prefix } = req.body;
    const result = await pool.query(
      'INSERT INTO product_categories (client_id, name, description, sort_order, auto_generate_sku, sku_prefix) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.user.client_id, name, description || null, sort_order || 0, auto_generate_sku !== false, sku_prefix ? sku_prefix.toUpperCase().substring(0,3) : null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-categories/:id', authenticate, async (req, res) => {
  try {
    const { name, description, is_active, sort_order, auto_generate_sku, sku_prefix } = req.body;
    const result = await pool.query(
      `UPDATE product_categories SET 
        name=COALESCE($1,name), description=COALESCE($2,description), 
        is_active=COALESCE($3,is_active), sort_order=COALESCE($4,sort_order),
        auto_generate_sku=COALESCE($5,auto_generate_sku), 
        sku_prefix=UPPER(SUBSTRING(COALESCE($6, sku_prefix),1,3)), updated_at=NOW() 
       WHERE id=$7 AND client_id=$8 RETURNING *`,
      [name, description, is_active, sort_order, auto_generate_sku, sku_prefix ? sku_prefix.toUpperCase().substring(0,3) : null, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-categories/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE product_categories SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCT BRANDS ────────────────────────────────────────────────
app.get('/api/product-brands', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_brands WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-brands', authenticate, async (req, res) => {
  try {
    const { name, is_imported, premium_level } = req.body;
    const result = await pool.query(
      'INSERT INTO product_brands (client_id, name, is_imported, premium_level) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.client_id, name, is_imported || false, premium_level || 5]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-brands/:id', authenticate, async (req, res) => {
  try {
    const { name, is_imported, premium_level, is_active } = req.body;
    const result = await pool.query(
      `UPDATE product_brands SET 
        name=COALESCE($1,name), 
        is_imported=COALESCE($2,is_imported), 
        premium_level=COALESCE($3,premium_level), 
        is_active=COALESCE($4,is_active), 
        updated_at=NOW() 
       WHERE id=$5 AND client_id=$6 RETURNING *`,
      [name, is_imported, premium_level, is_active, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/product-brands/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE product_brands SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCTS ──────────────────────────────────────────────────────
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const includeDiscontinued = req.headers['x-include-discontinued'] === '1' || req.query.include_discontinued === 'true';
    const activeFilter = includeDiscontinued ? 'p.is_active IN (true, false)' : 'p.is_active = true';
    const result = await pool.query(`
      SELECT p.*, pc.name as category_name, pb.name as brand_name, p.commercial_description,
        COALESCE(
          (SELECT SUM(pic.quantity * ii.default_cost)
           FROM product_input_components pic
           JOIN input_items ii ON pic.input_item_id = ii.id
           WHERE pic.product_id = p.id), 0
        ) as computed_cost
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN product_brands pb ON p.brand_id = pb.id
      WHERE p.client_id = $1 AND ${activeFilter} AND p.deleted_at IS NULL
      ORDER BY p.name
    `, [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', authenticate, async (req, res) => {
  try {
    const { sku, sku_externo, name, description, commercial_description, category_id, brand_id, price, unit, stock_quantity, min_stock, requires_stock, is_premium, premium_level, cost_price, image_url } = req.body;
    
    let finalSku = sku || null;
    // Auto-generate SKU if category has auto_generate_sku and no SKU provided
    if ((!finalSku || !finalSku.trim()) && category_id) {
      const catRes = await pool.query('SELECT sku_prefix, auto_generate_sku, sku_counter FROM product_categories WHERE deleted_at IS NULL AND id = $1', [category_id]);
      if (catRes.rows.length > 0 && catRes.rows[0].auto_generate_sku) {
        const prefix = (catRes.rows[0].sku_prefix || 'XXX').toUpperCase().padEnd(3, 'X');
        const nextNum = (catRes.rows[0].sku_counter || 0) + 1;
        finalSku = prefix + '-' + String(nextNum).padStart(3, '0');
        await pool.query('UPDATE product_categories SET sku_counter = $1 WHERE id = $2', [nextNum, category_id]);
      }
    }

    const result = await pool.query(
      `INSERT INTO products (client_id, sku, sku_externo, name, description, commercial_description, category_id, brand_id, price, unit, stock_quantity, min_stock, requires_stock, is_premium, premium_level, cost_price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`,
      [req.user.client_id, finalSku, sku_externo || null, name, description || null,
       commercial_description || null, category_id || null, brand_id || null,
       price || 0, unit || 'unidad',
       requires_stock ? (stock_quantity || 0) : 0,
       requires_stock ? (min_stock || 0) : 0,
       requires_stock || false,
       is_premium || false,
       is_premium ? (premium_level || 5) : null,
       cost_price || 0,
       image_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/products/:id', authenticate, async (req, res) => {
  try {
    const { sku, sku_externo, name, description, commercial_description, category_id, brand_id, price, unit, stock_quantity, min_stock, requires_stock, is_premium, premium_level, cost_price, is_active, image_url } = req.body;

    let finalSku = (sku && String(sku).trim()) ? String(sku).trim() : null;
    // Auto-generate SKU on edit too, if category has auto_generate_sku and SKU was left empty
    if (!finalSku && category_id) {
      const catRes = await pool.query('SELECT sku_prefix, auto_generate_sku, sku_counter FROM product_categories WHERE deleted_at IS NULL AND id = $1', [category_id]);
      if (catRes.rows.length > 0 && catRes.rows[0].auto_generate_sku) {
        const prefix = (catRes.rows[0].sku_prefix || 'XXX').toUpperCase().padEnd(3, 'X');
        const nextNum = (catRes.rows[0].sku_counter || 0) + 1;
        finalSku = prefix + '-' + String(nextNum).padStart(3, '0');
        await pool.query('UPDATE product_categories SET sku_counter = $1 WHERE id = $2', [nextNum, category_id]);
      }
    }

    const result = await pool.query(
      `UPDATE products SET 
        sku=$1, sku_externo=COALESCE($2,sku_externo), name=COALESCE($3,name), description=COALESCE($4,description),
        commercial_description=NULLIF($5,''),
        category_id=$6, brand_id=$7, price=COALESCE($8,price),
        unit=COALESCE($9,unit), stock_quantity=COALESCE($10,stock_quantity), min_stock=COALESCE($11,min_stock),
        requires_stock=COALESCE($12,requires_stock), is_premium=COALESCE($13,is_premium), premium_level=COALESCE($14,premium_level),
        cost_price=COALESCE($15,cost_price), is_active=COALESCE($16,is_active), image_url=NULLIF($17,''), updated_at=NOW()
       WHERE id=$18 AND client_id=$19 RETURNING *`,
      [finalSku, sku_externo, name, description, commercial_description, category_id, brand_id, price, unit, stock_quantity, min_stock,
       requires_stock, is_premium, premium_level, cost_price, is_active, image_url, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE products SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── INPUT ITEMS (insumos) ─────────────────────────────────────────
app.get('/api/input-items', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM input_items WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/input-items', authenticate, async (req, res) => {
  try {
    const { name, unit, default_cost } = req.body;
    const result = await pool.query(
      'INSERT INTO input_items (client_id, name, unit, default_cost) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.client_id, name, unit || 'unidad', default_cost || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/input-items/:id', authenticate, async (req, res) => {
  try {
    const { name, unit, default_cost, is_active } = req.body;
    const result = await pool.query(
      `UPDATE input_items SET name=COALESCE($1,name), unit=COALESCE($2,unit), default_cost=COALESCE($3,default_cost), is_active=COALESCE($4,is_active) WHERE id=$5 AND client_id=$6 RETURNING *`,
      [name, unit, default_cost, is_active, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/input-items/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE input_items SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── PRODUCT INPUT COMPONENTS ─────────────────────────────────────
app.get('/api/products/:id/components', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT pic.id, pic.quantity, pic.input_item_id, ii.name as input_item_name, ii.unit as input_unit, ii.default_cost
       FROM product_input_components pic
       JOIN input_items ii ON pic.input_item_id = ii.id
       WHERE pic.product_id = $1`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products/:id/components', authenticate, async (req, res) => {
  try {
    const { input_item_id, quantity } = req.body;
    const result = await pool.query(
      'INSERT INTO product_input_components (product_id, input_item_id, quantity) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, input_item_id, quantity || 1]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Este insumo ya esta en el producto' });
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/products/:productId/components/:componentId', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE product_input_components SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND product_id = $2', [req.params.componentId, req.params.productId]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CONTACTS ──────────────────────────────────────────────────────

// ─── CONDICIONES IVA ────────────────────────────────────────────────────────
app.get('/api/condiciones-iva', (req, res) => {
  res.json([
    { value: 'consumidor_final', label: 'Consumidor Final' },
    { value: 'monotributista', label: 'Monotributista' },
    { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
    { value: 'exento', label: 'Exento' },
    { value: 'sujeto_no_categorizado', label: 'Sujeto No Categorizado' },
  ]);
});

app.get('/api/contacts', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contacts WHERE deleted_at IS NULL AND client_id = $1 ORDER BY name', [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contacts', authenticate, async (req, res) => {
  try {
    const { name, phone, email, address, location, notes, whatsapp, instagram, tiktok, condicion_iva, cuit, condicion_iibb, calificacion } = req.body;
    const result = await pool.query(
      'INSERT INTO contacts (client_id, name, phone, email, address, location, notes, whatsapp, instagram, tiktok, condicion_iva, cuit, condicion_iibb, calificacion) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [req.user.client_id, name, phone, email, address, location, notes, whatsapp || null, instagram || null, tiktok || null, condicion_iva || null, cuit || null, condicion_iibb || null, Number(calificacion) || 5]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/contacts/:id', authenticate, async (req, res) => {
  try {
    const { name, phone, email, address, location, notes, whatsapp, instagram, tiktok, condicion_iva, cuit, condicion_iibb, calificacion } = req.body;
    const result = await pool.query(
      'UPDATE contacts SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email), address=COALESCE($4,address), location=COALESCE($5,location), notes=COALESCE($6,notes), updated_at=NOW(), whatsapp=COALESCE($7,whatsapp), instagram=COALESCE($8,instagram), tiktok=COALESCE($9,tiktok), condicion_iva=COALESCE($10,condicion_iva), cuit=COALESCE($11,cuit), condicion_iibb=COALESCE($12,condicion_iibb), calificacion=COALESCE($13,calificacion) WHERE id=$14 AND client_id=$15 RETURNING *',
      [name, phone, email, address, location, notes, whatsapp, instagram, tiktok, condicion_iva, cuit, condicion_iibb, Number(calificacion) || null, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/contacts/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE contacts SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SALE CHANNELS ────────────────────────────────────────────────
app.get('/api/sale-channels', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM sale_channels WHERE deleted_at IS NULL AND client_id = $1 AND is_active = true ORDER BY sort_order, name',
      [req.user.client_id]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/sale-channels', authenticate, async (req, res) => {
  try {
    const { name, is_active, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO sale_channels (client_id, name, is_active, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.client_id, name, is_active !== false, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/sale-channels/:id', authenticate, async (req, res) => {
  try {
    const { name, is_active, sort_order } = req.body;
    const result = await pool.query(
      'UPDATE sale_channels SET name=COALESCE($1,name), is_active=COALESCE($2,is_active), sort_order=COALESCE($3,sort_order) WHERE id=$4 AND client_id=$5 RETURNING *',
      [name, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/sale-channels/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE sale_channels SET deleted_at = NOW() WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── ORDER STATUSES ────────────────────────────────────────────────
app.get('/api/order-statuses', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM order_statuses WHERE deleted_at IS NULL AND client_id = $1 AND is_active = true ORDER BY sort_order, name',
      [req.user.client_id]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/order-statuses', authenticate, async (req, res) => {
  try {
    const { name, color, is_active, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO order_statuses (client_id, name, color, is_active, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.client_id, name, color || '#888888', is_active !== false, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/order-statuses/:id', authenticate, async (req, res) => {
  try {
    const { name, color, is_active, sort_order } = req.body;
    const result = await pool.query(
      'UPDATE order_statuses SET name=COALESCE($1,name), color=COALESCE($2,color), is_active=COALESCE($3,is_active), sort_order=COALESCE($4,sort_order) WHERE id=$5 AND client_id=$6 RETURNING *',
      [name, color, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/order-statuses/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE order_statuses SET deleted_at = NOW() WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── PAYMENT STATUSES ──────────────────────────────────────────────
app.get('/api/payment-statuses', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM payment_statuses WHERE deleted_at IS NULL AND client_id = $1 AND is_active = true ORDER BY sort_order, name',
      [req.user.client_id]
    );
    res.json(result.rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/payment-statuses', authenticate, async (req, res) => {
  try {
    const { name, color, is_active, sort_order } = req.body;
    const result = await pool.query(
      'INSERT INTO payment_statuses (client_id, name, color, is_active, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.client_id, name, color || '#888888', is_active !== false, sort_order || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/payment-statuses/:id', authenticate, async (req, res) => {
  try {
    const { name, color, is_active, sort_order } = req.body;
    const result = await pool.query(
      'UPDATE payment_statuses SET name=COALESCE($1,name), color=COALESCE($2,color), is_active=COALESCE($3,is_active), sort_order=COALESCE($4,sort_order) WHERE id=$5 AND client_id=$6 RETURNING *',
      [name, color, is_active, sort_order, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/payment-statuses/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE payment_statuses SET deleted_at = NOW() WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── ORDERS (VENTAS) ────────────────────────────────────────────────
// ─── ORDERS STATS ──────────────────────────────────────────────
app.get('/api/orders/stats', authenticate, async (req, res) => {
  try {
    const { period } = req.query; // 'today' | 'week' | 'month' | 'custom'
    const { from, to } = req.query;
    
    let dateFilter = '';
    const params = [req.user.client_id];
    
    if (period === 'today') {
      dateFilter = "AND DATE(o.created_at) = CURRENT_DATE";
    } else if (period === 'week') {
      dateFilter = "AND DATE(o.created_at) >= DATE_TRUNC('week', CURRENT_DATE)";
    } else if (period === 'month') {
      dateFilter = "AND DATE(o.created_at) >= DATE_TRUNC('month', CURRENT_DATE)";
    } else if (period === 'custom' && from && to) {
      dateFilter = "AND DATE(o.created_at) >= $2 AND DATE(o.created_at) <= $3";
      params.push(from, to);
    }
    
    // Total count and revenue
    const totals = await pool.query(`
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(o.total), 0) as total_revenue,
        COALESCE(SUM(op.paid_sum), 0) as total_collected
      FROM orders o
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) as paid_sum
        FROM order_payments WHERE deleted_at IS NULL GROUP BY order_id
      ) op ON op.order_id = o.id
      WHERE o.client_id = $1 AND o.deleted_at IS NULL ${dateFilter}
    `, params);
    
    // Best seller
    const bestSeller = await pool.query(`
      SELECT u.name as seller_name, COUNT(*) as sale_count, COALESCE(SUM(o.total), 0) as revenue
      FROM orders o
      LEFT JOIN users u ON o.seller_id = u.id
      WHERE o.client_id = $1 AND o.deleted_at IS NULL AND o.seller_id IS NOT NULL ${dateFilter}
      GROUP BY u.name
      ORDER BY sale_count DESC
      LIMIT 1
    `, params);
    
    // Payment methods breakdown
    const paymentBreakdown = await pool.query(`
      SELECT 
        pm.name as method_name,
        COUNT(DISTINCT o.id) as order_count,
        COALESCE(SUM(op.amount), 0) as collected
      FROM orders o
      LEFT JOIN payment_methods pm ON o.payment_method_id = pm.id
      LEFT JOIN order_payments op ON op.order_id = o.id AND op.deleted_at IS NULL
      WHERE o.client_id = $1 AND o.deleted_at IS NULL ${dateFilter}
      GROUP BY pm.name
      ORDER BY collected DESC
    `, params);
    
    // Orders by day (last 7 days or custom range)
    const byDay = await pool.query(`
      SELECT 
        DATE(o.created_at) as day,
        COUNT(*) as order_count,
        COALESCE(SUM(o.total), 0) as day_revenue
      FROM orders o
      WHERE o.client_id = $1 AND o.deleted_at IS NULL ${dateFilter}
      GROUP BY DATE(o.created_at)
      ORDER BY day DESC
      LIMIT 7
    `, params);
    
    res.json({
      total_count: parseInt(totals.rows[0]?.total_count || 0),
      total_revenue: parseFloat(totals.rows[0]?.total_revenue || 0),
      total_collected: parseFloat(totals.rows[0]?.total_collected || 0),
      total_pending: parseFloat(totals.rows[0]?.total_revenue || 0) - parseFloat(totals.rows[0]?.total_collected || 0),
      best_seller: bestSeller.rows[0] || null,
      payment_breakdown: paymentBreakdown.rows.filter(r => r.method_name),
      by_day: byDay.rows,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── DELETE ORDER (soft) ─────────────────────────────────────

app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        o.id, o.order_number, o.subtotal, o.discount_type, o.discount_value, o.delivery_fee, o.total,
        o.payment_method_id, o.notes, o.created_at, o.updated_at,
        o.contact_id, o.seller_id, o.sale_channel_id, o.order_status_id, o.payment_status_id,
        c.name as contact_name, c.phone as contact_phone,
        pm.name as payment_method_name,
        u.name as seller_name,
        sc.name as sale_channel_name,
        os.name as order_status_name, os.color as order_status_color,
        pst.name as payment_status_name, pst.color as payment_status_color,
        COALESCE(op.paid_sum, 0) as payment_paid,
        o.total - COALESCE(op.paid_sum, 0) as payment_pending
      FROM orders o
      LEFT JOIN contacts c ON o.contact_id = c.id
      LEFT JOIN payment_methods pm ON o.payment_method_id = pm.id
      LEFT JOIN users u ON o.seller_id = u.id
      LEFT JOIN sale_channels sc ON o.sale_channel_id = sc.id
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN payment_statuses pst ON o.payment_status_id = pst.id
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) as paid_sum
        FROM order_payments WHERE deleted_at IS NULL GROUP BY order_id
      ) op ON op.order_id = o.id
      WHERE o.client_id = $1 AND o.deleted_at IS NULL
      ORDER BY o.created_at DESC
    `, [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const orderResult = await pool.query(`
      SELECT
        o.id, o.order_number, o.subtotal, o.discount_type, o.discount_value, o.delivery_fee, o.total,
        o.payment_method_id, o.notes, o.created_at, o.updated_at,
        o.contact_id, o.seller_id, o.sale_channel_id, o.order_status_id, o.payment_status_id,
        c.name as contact_name, c.phone as contact_phone, c.email as contact_email,
        pm.name as payment_method_name,
        u.name as seller_name, u.rol as seller_rol,
        sc.name as sale_channel_name,
        os.name as order_status_name, os.color as order_status_color,
        pst.name as payment_status_name, pst.color as payment_status_color,
        COALESCE(op.paid_sum, 0) as payment_paid,
        o.total - COALESCE(op.paid_sum, 0) as payment_pending
      FROM orders o
      LEFT JOIN contacts c ON o.contact_id = c.id
      LEFT JOIN payment_methods pm ON o.payment_method_id = pm.id
      LEFT JOIN users u ON o.seller_id = u.id
      LEFT JOIN sale_channels sc ON o.sale_channel_id = sc.id
      LEFT JOIN order_statuses os ON o.order_status_id = os.id
      LEFT JOIN payment_statuses pst ON o.payment_status_id = pst.id
      LEFT JOIN (
        SELECT order_id, COALESCE(SUM(amount), 0) as paid_sum
        FROM order_payments WHERE deleted_at IS NULL GROUP BY order_id
      ) op ON op.order_id = o.id
      WHERE o.id = $1 AND o.client_id = $2
    `, [req.params.id, req.user.client_id]);

    if (!orderResult.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    const items = await pool.query("SELECT oi.*, COALESCE(p.name, oi.product_name) as product_name FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1 AND oi.deleted_at IS NULL", [req.params.id]);
    const payments = await pool.query(`
      SELECT op.id, op.amount, op.paid_at, op.payment_method_id, op.created_at,
             pm.name as payment_method_name
      FROM order_payments op
      LEFT JOIN payment_methods pm ON op.payment_method_id = pm.id
      WHERE op.order_id = $1 AND op.deleted_at IS NULL
      ORDER BY op.paid_at DESC
    `, [req.params.id]);
    const delivery = await pool.query('SELECT * FROM deliveries WHERE order_id = $1', [req.params.id]);

    res.json({
      ...orderResult.rows[0],
      items: items.rows,
      payments: payments.rows,
      delivery: delivery.rows[0] || null
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/orders', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      contact_id, seller_id, sale_channel_id,
      discount_type, discount_value,
      payment_method_id, notes, items, delivery,
      order_status_id, delivery_fee
    } = req.body;

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await client.query(
      "SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND client_id = $1",
      [req.user.client_id]
    );
    const orderNum = 'NV-' + String(parseInt(countResult.rows[0].count) + 1).padStart(5, '0');

    const subtotal = (items || []).reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price || 0)), 0);
    const fee = Number(delivery_fee) || 0;
    let discountAmount = 0;
    if (discount_type === 'percent' && Number(discount_value)) {
      discountAmount = subtotal * (Number(discount_value) / 100);
    } else if (discount_type === 'fixed' && Number(discount_value)) {
      discountAmount = Number(discount_value);
    }
    const total = Math.max(0, subtotal - discountAmount + fee);

    const statusRow = await client.query(
      'SELECT id FROM order_statuses WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY sort_order LIMIT 1',
      [req.user.client_id]
    );
    const payStatusRow = await client.query(
      'SELECT id FROM payment_statuses WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY sort_order LIMIT 1',
      [req.user.client_id]
    );

    // Stock validation and deduction
    for (const item of (items || [])) {
      const prodResult = await client.query(
        'SELECT name, requires_stock, stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL',
        [item.product_id]
      );
      if (prodResult.rows[0]) {
        const prod = prodResult.rows[0];
        if (prod.requires_stock) {
          const available = Number(prod.stock_quantity || 0);
          if (Number(item.quantity) > available) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Stock insuficiente para "${prod.name}". Disponible: ${available}` });
          }
          await client.query(
            'UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2',
            [item.quantity, item.product_id]
          );
        }
      }
    }

    await client.query('BEGIN');

    const orderResult = await client.query(`
      INSERT INTO orders (client_id, contact_id, seller_id, sale_channel_id, order_number, subtotal, discount_type, discount_value, delivery_fee, total, payment_method_id, order_status_id, payment_status_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *
    `, [
      req.user.client_id, contact_id, seller_id || req.user.id, sale_channel_id,
      orderNum, subtotal, discount_type, discount_value || null, fee, total,
      payment_method_id, statusRow.rows[0]?.id || null, payStatusRow.rows[0]?.id || null, notes
    ]);

    const orderId = orderResult.rows[0].id;

    for (const item of (items || [])) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, item.product_id, item.product_name || item.product_id, Number(item.quantity), Number(item.unit_price), Number(item.quantity) * Number(item.unit_price)]
      );
    }

    if (delivery && (delivery.address || delivery.scheduled_date)) {
      await client.query(
        'INSERT INTO deliveries (order_id, address, location, scheduled_date, scheduled_time, delivery_fee, notes) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [orderId, delivery.address, delivery.location, delivery.scheduled_date, delivery.scheduled_time, fee, delivery.notes]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ id: orderId, order_number: orderNum, message: 'Venta creada' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/orders/:id', authenticate, async (req, res) => {
  try {
    const { contact_id, seller_id, sale_channel_id, order_status_id, payment_status_id, discount_type, discount_value, delivery_fee, payment_method_id, notes } = req.body;
    const isPrivileged = req.user.rol === 'admin' || req.user.rol === 'manager';

    const current = await pool.query('SELECT * FROM orders WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'No encontrado' });

    let discount_type_n = discount_type ?? current.rows[0].discount_type;
    let discount_value_n = discount_value ?? current.rows[0].discount_value;
    let delivery_fee_n = Number(delivery_fee) ?? Number(current.rows[0].delivery_fee);

    const itemsResult = await pool.query('SELECT subtotal FROM order_items WHERE order_id = $1 AND deleted_at IS NULL', [req.params.id]);
    const subtotal = itemsResult.rows.reduce((sum, item) => sum + Number(item.subtotal), 0);
    let discountAmount = 0;
    if (discount_type_n === 'percent' && Number(discount_value_n)) {
      discountAmount = subtotal * (Number(discount_value_n) / 100);
    } else if (discount_type_n === 'fixed' && Number(discount_value_n)) {
      discountAmount = Number(discount_value_n);
    }
    const total = Math.max(0, subtotal - discountAmount + delivery_fee_n);

    const updates = [];
    const values = []
    let idx = 1;
    if (contact_id !== undefined) { updates.push('contact_id=$' + idx++); values.push(contact_id); }
    if (seller_id !== undefined) { updates.push('seller_id=$' + idx++); values.push(seller_id); }
    if (sale_channel_id !== undefined) { updates.push('sale_channel_id=$' + idx++); values.push(sale_channel_id); }
    if (order_status_id !== undefined) { updates.push('order_status_id=$' + idx++); values.push(order_status_id); }
    if (payment_status_id !== undefined) { updates.push('payment_status_id=$' + idx++); values.push(payment_status_id); }
    if (discount_type !== undefined && isPrivileged) { updates.push('discount_type=$' + idx++); values.push(discount_type || null); }
    if (discount_value !== undefined && isPrivileged) { updates.push('discount_value=$' + idx++); values.push(discount_value || null); }
    if (delivery_fee !== undefined) { updates.push('delivery_fee=$' + idx++); values.push(delivery_fee); }
    if (payment_method_id !== undefined) { updates.push('payment_method_id=$' + idx++); values.push(payment_method_id); }
    if (notes !== undefined) { updates.push('notes=$' + idx++); values.push(notes); }
    updates.push('total=$' + idx++); values.push(total);
    updates.push('updated_at=NOW()');
    values.push(req.params.id, req.user.client_id);

    const result = await pool.query(
      'UPDATE orders SET ' + updates.join(', ') + ' WHERE id=$' + idx + ' AND client_id=$' + (idx+1) + ' RETURNING *',
      values
    );
    res.json(result.rows[0] || null);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/orders/:id/payments', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount, payment_method_id, paid_at } = req.body;
    const orderId = req.params.id;

    const order = await client.query('SELECT * FROM orders WHERE id = $1 AND client_id = $2', [orderId, req.user.client_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });

    await client.query('BEGIN');
    const paymentResult = await client.query(
      'INSERT INTO order_payments (order_id, amount, payment_method_id, paid_at) VALUES ($1, $2, $3, $4) RETURNING *',
      [orderId, amount, payment_method_id, paid_at || new Date()]
    );

    const paidSum = await client.query('SELECT COALESCE(SUM(amount), 0) as total FROM order_payments WHERE order_id = $1 AND deleted_at IS NULL', [orderId]);
    const paid = Number(paidSum.rows[0].total);
    const total = Number(order.rows[0].total);

    const statuses = await client.query('SELECT id, name FROM payment_statuses WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY sort_order', [req.user.client_id]);
    let newStatusId = statuses.rows[0]?.id;
    if (paid >= total && total > 0) {
      const cobrado = statuses.rows.find(s => s.name === 'Cobrado');
      newStatusId = cobrado?.id || statuses.rows[statuses.rows.length - 1]?.id;
    } else if (paid > 0) {
      const parcial = statuses.rows.find(s => s.name === 'Cobrado Parcial');
      newStatusId = parcial?.id || statuses.rows[1]?.id;
    }
    if (newStatusId) await client.query('UPDATE orders SET payment_status_id = $1, updated_at = NOW() WHERE id = $2', [newStatusId, orderId]);

    await client.query('COMMIT');
    res.status(201).json(paymentResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/orders/:id/payments/:paymentId', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const order = await client.query('SELECT * FROM orders WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });

    await client.query('BEGIN');
    await client.query('UPDATE order_payments SET deleted_at = NOW() WHERE id = $1 AND order_id = $2', [req.params.paymentId, req.params.id]);

    const paidSum = await client.query('SELECT COALESCE(SUM(amount), 0) as total FROM order_payments WHERE order_id = $1 AND deleted_at IS NULL', [req.params.id]);
    const paid = Number(paidSum.rows[0].total);
    const total = Number(order.rows[0].total);

    const statuses = await client.query('SELECT id, name FROM payment_statuses WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY sort_order', [req.user.client_id]);
    let newStatusId = statuses.rows[0]?.id;
    if (paid >= total && total > 0) {
      const cobrado = statuses.rows.find(s => s.name === 'Cobrado');
      newStatusId = cobrado?.id || statuses.rows[statuses.rows.length - 1]?.id;
    } else if (paid > 0) {
      const parcial = statuses.rows.find(s => s.name === 'Cobrado Parcial');
      newStatusId = parcial?.id || statuses.rows[1]?.id;
    }
    if (newStatusId) await client.query('UPDATE orders SET payment_status_id = $1, updated_at = NOW() WHERE id = $2', [newStatusId, req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Pago eliminado' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// ─── LEAD SOURCES ──────────────────────────────────────────────────
app.get('/api/lead-sources', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM lead_sources WHERE deleted_at IS NULL AND client_id = $1 AND is_active = true ORDER BY sort_order, name',
      [req.user.client_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/lead-sources', authenticate, async (req, res) => {
  try {
    const { name, sort_order, is_active } = req.body;
    if (!cleanText(name)) return res.status(400).json({ error: 'Nombre requerido' });
    const result = await pool.query(
      'INSERT INTO lead_sources (client_id, name, sort_order, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.client_id, cleanText(name), Number(sort_order) || 0, is_active !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Ese origen ya existe' });
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/lead-sources/:id', authenticate, async (req, res) => {
  try {
    const { name, sort_order, is_active } = req.body;
    const result = await pool.query(
      `UPDATE lead_sources
       SET name = COALESCE($1, name),
           sort_order = COALESCE($2, sort_order),
           is_active = COALESCE($3, is_active),
           updated_at = NOW()
       WHERE id = $4 AND client_id = $5 AND deleted_at IS NULL
       RETURNING *`,
      [cleanText(name), Number.isFinite(Number(sort_order)) ? Number(sort_order) : null, typeof is_active === 'boolean' ? is_active : null, req.params.id, req.user.client_id]
    );
    res.json(result.rows[0] || null);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Ese origen ya existe' });
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/lead-sources/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE lead_sources SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [req.params.id, req.user.client_id]);
    res.json({ message: 'Eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── LEADS ─────────────────────────────────────────────────────────
app.get('/api/leads', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
             c.name AS converted_contact_name,
             COALESCE(li.interaction_count, 0) AS interaction_count,
             COALESCE(l.last_interaction_at, li.last_interaction_at) AS last_interaction_at
      FROM leads l
      LEFT JOIN contacts c ON c.id = l.converted_contact_id
      LEFT JOIN (
        SELECT lead_id, COUNT(*)::int AS interaction_count, MAX(created_at) AS last_interaction_at
        FROM lead_interactions
        WHERE deleted_at IS NULL
        GROUP BY lead_id
      ) li ON li.lead_id = l.id
      WHERE l.deleted_at IS NULL AND l.client_id = $1
      ORDER BY COALESCE(l.last_interaction_at, li.last_interaction_at, l.updated_at, l.created_at) DESC, l.id DESC
    `, [req.user.client_id]);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/leads/:id/interactions', authenticate, async (req, res) => {
  try {
    const leadRes = await pool.query('SELECT id FROM leads WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });

    const result = await pool.query(
      'SELECT * FROM lead_interactions WHERE deleted_at IS NULL AND lead_id = $1 AND client_id = $2 ORDER BY created_at DESC, id DESC',
      [req.params.id, req.user.client_id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads', authenticate, async (req, res) => {
  try {
    const {
      name, phone, whatsapp, email, source, source_channel, source_handle,
      external_contact_id, external_conversation_id, address, location,
      instagram, facebook, notes, first_message, last_message,
      status, assigned_to,
    } = req.body;

    const normalizedStatus = normalizeLeadStatus(status) || 'new';
    const firstMessage = cleanText(first_message) || cleanText(last_message);
    const lastMessage = cleanText(last_message) || cleanText(first_message);
    const hasInitialMessage = Boolean(lastMessage);
    const nowIso = hasInitialMessage ? new Date().toISOString() : null;

    const result = await pool.query(
      `INSERT INTO leads (
        client_id, name, phone, whatsapp, email, source, source_channel, source_handle,
        external_contact_id, external_conversation_id, address, location, instagram, facebook,
        notes, first_message, first_message_at, last_message, last_message_at, last_interaction_at, status, assigned_to
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *`,
      [
        req.user.client_id,
        cleanText(name), cleanText(phone), cleanText(whatsapp), cleanText(email), cleanText(source), cleanText(source_channel), cleanText(source_handle),
        cleanText(external_contact_id), cleanText(external_conversation_id), cleanText(address), cleanText(location), cleanText(instagram), cleanText(facebook),
        cleanText(notes), firstMessage, nowIso, lastMessage, nowIso, nowIso, normalizedStatus, cleanText(assigned_to),
      ]
    );

    if (lastMessage) {
      await pool.query(
        `INSERT INTO lead_interactions (lead_id, client_id, channel, direction, message_type, content, sender_name, sender_handle)
         VALUES ($1, $2, $3, 'inbound', 'text', $4, $5, $6)`,
        [result.rows[0].id, req.user.client_id, cleanText(source_channel) || cleanText(source) || 'manual', lastMessage, cleanText(name), cleanText(source_handle)]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/leads/:id/interactions', authenticate, async (req, res) => {
  try {
    const { channel, direction, message_type, content, sender_name, sender_handle, external_message_id, meta_json } = req.body;
    const leadRes = await pool.query('SELECT * FROM leads WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    const lead = leadRes.rows[0];
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
    if (!cleanText(content)) return res.status(400).json({ error: 'Contenido requerido' });

    const result = await pool.query(
      `INSERT INTO lead_interactions (
        lead_id, client_id, channel, direction, message_type, content,
        sender_name, sender_handle, external_message_id, meta_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        lead.id,
        req.user.client_id,
        cleanText(channel) || lead.source_channel || lead.source || 'manual',
        cleanText(direction) || 'inbound',
        cleanText(message_type) || 'text',
        cleanText(content),
        cleanText(sender_name),
        cleanText(sender_handle),
        cleanText(external_message_id),
        meta_json ? JSON.stringify(meta_json) : null,
      ]
    );

    await pool.query(
      `UPDATE leads
       SET first_message = COALESCE(first_message, $1),
           first_message_at = COALESCE(first_message_at, NOW()),
           last_message = $1,
           last_message_at = NOW(),
           last_interaction_at = NOW(),
           updated_at = NOW(),
           source_channel = COALESCE(source_channel, $2),
           source_handle = COALESCE(source_handle, $3),
           source = COALESCE(source, $2)
       WHERE id = $4 AND client_id = $5`,
      [cleanText(content), cleanText(channel), cleanText(sender_handle), lead.id, req.user.client_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/leads/:id', authenticate, async (req, res) => {
  try {
    const {
      name, phone, whatsapp, email, source,
      external_contact_id, external_conversation_id, address, location,
      instagram, facebook, notes,
      status, assigned_to, rejection_reason,
    } = req.body;

    const currentRes = await pool.query('SELECT * FROM leads WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    const current = currentRes.rows[0];
    if (!current) return res.status(404).json({ error: 'Lead no encontrado' });

    const normalizedStatus = normalizeLeadStatus(status);
    if (normalizedStatus === 'converted' && !current.converted_contact_id) {
      return res.status(400).json({ error: 'Usá el endpoint de conversión para convertir el lead' });
    }

    const result = await pool.query(
      `UPDATE leads SET
        name=COALESCE($1,name),
        phone=COALESCE($2,phone),
        whatsapp=COALESCE($3,whatsapp),
        email=COALESCE($4,email),
        source=COALESCE($5,source),
        external_contact_id=COALESCE($6,external_contact_id),
        external_conversation_id=COALESCE($7,external_conversation_id),
        address=COALESCE($8,address),
        location=COALESCE($9,location),
        instagram=COALESCE($10,instagram),
        facebook=COALESCE($11,facebook),
        notes=COALESCE($12,notes),
        status=COALESCE($13,status),
        assigned_to=COALESCE($14,assigned_to),
        rejection_reason=COALESCE($15,rejection_reason),
        updated_at=NOW()
       WHERE id=$16 AND client_id=$17
       RETURNING *`,
      [
        cleanText(name), cleanText(phone), cleanText(whatsapp), cleanText(email), cleanText(source),
        cleanText(external_contact_id), cleanText(external_conversation_id), cleanText(address), cleanText(location), cleanText(instagram), cleanText(facebook),
        cleanText(notes), normalizedStatus, cleanText(assigned_to), cleanText(rejection_reason),
        req.params.id, req.user.client_id,
      ]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/leads/:id/convert', authenticate, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const leadRes = await dbClient.query('SELECT * FROM leads WHERE deleted_at IS NULL AND id = $1 AND client_id = $2 FOR UPDATE', [req.params.id, req.user.client_id]);
    const lead = leadRes.rows[0];
    if (!lead) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ error: 'Lead no encontrado' });
    }

    if (lead.converted_contact_id) {
      await dbClient.query('COMMIT');
      return res.json({ lead_id: lead.id, contact_id: lead.converted_contact_id, status: 'already_converted' });
    }

    const existingRes = await dbClient.query(
      `SELECT * FROM contacts
       WHERE deleted_at IS NULL AND client_id = $1
         AND (
           (phone = $2 OR whatsapp = $3 OR LOWER(email) = LOWER($4))
           AND ($2 IS NULL OR phone = $2)
           AND ($3 IS NULL OR whatsapp = $3)
           AND ($4 IS NULL OR LOWER(email) = LOWER($4))         )
       ORDER BY id ASC
       LIMIT 1`,
      [req.user.client_id, cleanText(lead.phone), cleanText(lead.whatsapp), cleanText(lead.email)]
    );

    let contact;
    if (existingRes.rows[0]) {
      const currentContact = existingRes.rows[0];
      const updatedContactRes = await dbClient.query(
        `UPDATE contacts SET
          name = COALESCE($1, name),
          phone = COALESCE($2, phone),
          email = COALESCE($3, email),
          address = COALESCE($4, address),
          location = COALESCE($5, location),
          notes = COALESCE($6, notes),
          whatsapp = COALESCE($7, whatsapp),
          instagram = COALESCE($8, instagram),
          updated_at = NOW()
         WHERE id = $9 AND client_id = $10
         RETURNING *`,
        [
          cleanText(lead.name), cleanText(lead.phone), cleanText(lead.email), cleanText(lead.address), cleanText(lead.location),
          appendUniqueNote(currentContact.notes, lead.notes), cleanText(lead.whatsapp), cleanText(lead.instagram), currentContact.id, req.user.client_id,
        ]
      );
      contact = updatedContactRes.rows[0];
    } else {
      const createdContactRes = await dbClient.query(
        `INSERT INTO contacts (client_id, name, phone, email, address, location, notes, whatsapp, instagram)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          req.user.client_id,
          cleanText(lead.name), cleanText(lead.phone), cleanText(lead.email), cleanText(lead.address), cleanText(lead.location),
          cleanText(lead.notes), cleanText(lead.whatsapp), cleanText(lead.instagram),
        ]
      );
      contact = createdContactRes.rows[0];
    }

    const updatedLeadRes = await dbClient.query(
      `UPDATE leads
       SET status = 'converted',
           converted_contact_id = $1,
           previous_status = $4,
           converted_at = NOW(),
           updated_at = NOW()
       WHERE id = $2 AND client_id = $3
       RETURNING *`,
      [contact.id, lead.id, req.user.client_id, lead.status]
    );

    await dbClient.query('COMMIT');
    res.json({ lead: updatedLeadRes.rows[0], contact });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    dbClient.release();
  }
});

app.put('/api/leads/:id/deconvert', authenticate, async (req, res) => {
  try {
    // First get the current converted_contact_id before updating
    const lead = await pool.query(
      'SELECT converted_contact_id FROM leads WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.client_id]
    );
    if (lead.rows.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });
    const contactIdToDelete = lead.rows[0].converted_contact_id;

    const result = await pool.query(
      `UPDATE leads
       SET status = COALESCE(previous_status, 'qualified'),
           previous_status = NULL,
           converted_contact_id = NULL,
           converted_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [req.params.id, req.user.client_id]
    );

    // Soft-delete the contact if one existed (was converted)
    if (contactIdToDelete) {
      await pool.query(
        'UPDATE contacts SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
        [contactIdToDelete]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/leads/:id', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE leads SET deleted_at = NOW() WHERE deleted_at IS NULL AND id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
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
      pool.query('SELECT COUNT(*) FROM contacts WHERE deleted_at IS NULL AND client_id = $1', [cid]),
      pool.query('SELECT COUNT(*) FROM products WHERE client_id = $1 AND is_active = true AND deleted_at IS NULL', [cid]),
      pool.query("SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND client_id = $1 AND DATE(created_at) = CURRENT_DATE", [cid]),
      pool.query("SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND client_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)", [cid]),
      pool.query("SELECT COALESCE(SUM(total), 0) FROM orders WHERE deleted_at IS NULL AND client_id = $1 AND DATE(created_at) = CURRENT_DATE AND payment_status = 'paid'", [cid]),
      pool.query("SELECT COALESCE(SUM(total), 0) FROM orders WHERE deleted_at IS NULL AND client_id = $1 AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE) AND payment_status = 'paid'", [cid]),
      pool.query("SELECT COUNT(*) FROM leads WHERE deleted_at IS NULL AND client_id = $1 AND status NOT IN ('converted', 'discarded', 'rejected')", [cid]),
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

// ─── PRODUCT IMAGE UPLOAD ────────────────────────────────────────

app.post('/api/products/:id/image', authenticate, async (req, res) => {
  try {
    const { file } = req.body;
    if (!file) return res.status(400).json({ error: 'No se recibio imagen' });

    // Detect format from base64 header
    let buffer, format;
    const match = file.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'Formato de imagen invalido' });
    format = match[1];
    buffer = Buffer.from(match[2], 'base64');

    // Compress if > 3MB
    const MAX_SIZE = 3 * 1024 * 1024;
    let finalBuffer = buffer;
    if (buffer.length > MAX_SIZE) {
      finalBuffer = await sharp(buffer)
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      format = 'jpeg';
    }

    // Save
    const clientDir = '/var/www/dash-images/' + req.user.client_id;
    fs.mkdirSync(clientDir, { recursive: true });
    const filename = randomUUID() + '.' + format;
    const filepath = clientDir + '/' + filename;
    fs.writeFileSync(filepath, finalBuffer);

    // Update DB
    const imageUrl = 'http://149.50.148.131:4000/images/' + req.user.client_id + '/' + filename;
    await pool.query('UPDATE products SET image_url = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3', [imageUrl, req.params.id, req.user.client_id]);

    res.json({ image_url: imageUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── SERVE IMAGES ───────────────────────────────────────────────
const imageDir = '/var/www/dash-images';
app.use('/images', express.static(imageDir));



// ─── LEAD MATCH & MERGE ────────────────────────────────────

// POST /api/leads/:id/verify-match
// Checks if lead matches any existing contact by phone/whatsapp/email/instagram
app.post('/api/leads/:id/verify-match', authenticate, async (req, res) => {
  try {
    const leadRes = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.client_id]
    );
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });
    if (leadRes.rows[0].status === 'merged') return res.status(400).json({ error: 'Lead ya fusionado' });

    const lead = leadRes.rows[0];

    // Search for contact by phone, whatsapp, email, instagram
    const matchRes = await pool.query(
      `SELECT * FROM contacts
       WHERE deleted_at IS NULL AND client_id = $1
         AND (
           ($2 IS NOT NULL AND phone = $2)
           OR ($2 IS NOT NULL AND whatsapp = $2)
           OR ($3 IS NOT NULL AND email = $3)
           OR ($4 IS NOT NULL AND instagram = $4)
         )
       LIMIT 1`,
      [req.user.client_id, cleanText(lead.phone), cleanText(lead.email), cleanText(lead.instagram)]
    );

    if (matchRes.rows.length === 0) {
      return res.json({ matched: false, contact: null, conflicts: null });
    }

    const contact = matchRes.rows[0];

    // Check for conflicts — fields where lead has data and contact also has data, and they differ
    const conflictFields = [];
    const fields = ['name', 'phone', 'email', 'address', 'location', 'whatsapp', 'instagram'];
    for (const field of fields) {
      const leadVal = cleanText(lead[field]);
      const contactVal = cleanText(contact[field]);
      if (leadVal && contactVal && leadVal !== contactVal) {
        conflictFields.push({ field, contact_value: contactVal, lead_value: leadVal });
      }
    }

    res.json({
      matched: true,
      contact: { id: contact.id, name: contact.name, phone: contact.phone },
      conflicts: conflictFields.length > 0 ? conflictFields : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/leads/:id/resolve
// Resolves merge conflicts: merges lead data into contact and marks lead as merged
// Body: { contact_id, resolution: { field: 'contact' | 'lead' } }
app.post('/api/leads/:id/resolve', authenticate, async (req, res) => {
  try {
    const { contact_id, resolution } = req.body;
    if (!contact_id || !resolution) return res.status(400).json({ error: 'Faltan datos' });

    const leadRes = await pool.query(
      'SELECT * FROM leads WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.user.client_id]
    );
    if (leadRes.rows.length === 0) return res.status(404).json({ error: 'Lead no encontrado' });

    const lead = leadRes.rows[0];

    const contactRes = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL',
      [contact_id, req.user.client_id]
    );
    if (contactRes.rows.length === 0) return res.status(404).json({ error: 'Contacto no encontrado' });

    const contact = contactRes.rows[0];
    const dbClient = await pool.connect();

    try {
      await dbClient.query('BEGIN');

      const mergeData = {};
      const fields = ['name', 'phone', 'email', 'address', 'location', 'whatsapp', 'instagram'];
      for (const field of fields) {
        const choice = resolution[field];
        if (choice === 'lead') {
          mergeData[field] = cleanText(lead[field]);
        } else {
          mergeData[field] = contact[field];
        }
      }

      const updateSet = Object.keys(mergeData).map((k, i) => k + ' = $' + (i + 1)).join(', ');
      const updateValues = Object.values(mergeData);
      await dbClient.query(
        'UPDATE contacts SET ' + updateSet + ', updated_at = NOW() WHERE id = $' + (updateValues.length + 1) + ' AND client_id = $' + (updateValues.length + 2),
        [...updateValues, contact_id, req.user.client_id]
      );

      await dbClient.query(
        'UPDATE leads SET status = $1, linked_contact_id = $2, merge_resolved_at = NOW(), updated_at = NOW() WHERE id = $3 AND client_id = $4',
        ['merged', contact_id, req.params.id, req.user.client_id]
      );

      await dbClient.query('COMMIT');

      const updatedContact = await pool.query('SELECT * FROM contacts WHERE id = $1', [contact_id]);
      res.json({ success: true, contact: updatedContact.rows[0], lead_id: lead.id });
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/orders/:id', authenticate, async (req, res) => {
  try {
    // Restore stock for deleted order
    const delItems = await pool.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND deleted_at IS NULL',
      [req.params.id]
    );
    for (const item of delItems.rows) {
      await pool.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND requires_stock = true',
        [item.quantity, item.product_id]
      );
    }
    await pool.query('UPDATE orders SET deleted_at = NOW() WHERE id = $1 AND client_id = $2', [req.params.id, req.user.client_id]);
    res.json({ message: 'Venta eliminada' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── ORDER ITEMS (for edit) ─────────────────────────────────
app.post('/api/orders/:id/items', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { product_id, quantity, unit_price } = req.body;
    const orderId = req.params.id;

    // Verify order belongs to client
    const order = await client.query('SELECT id, total FROM orders WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [orderId, req.user.client_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });

    // Get product info
    const prod = await client.query('SELECT name, requires_stock, stock_quantity FROM products WHERE id = $1 AND deleted_at IS NULL', [product_id]);
    if (!prod.rows[0]) return res.status(400).json({ error: 'Producto no encontrado' });
    const prodData = prod.rows[0];

    // Stock check
    if (prodData.requires_stock) {
      if (Number(quantity) > Number(prodData.stock_quantity || 0)) {
        return res.status(400).json({ error: `Stock insuficiente para "${prodData.name}". Disponible: ${prodData.stock_quantity}` });
      }
    }

    await client.query('BEGIN');

    // Deduct stock
    if (prodData.requires_stock) {
      await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [quantity, product_id]);
    }

    // Add item
    const itemResult = await client.query(
      'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [orderId, product_id, prodData.name, quantity, unit_price, Number(quantity) * Number(unit_price)]
    );

    // Recalculate order total
    const allItems = await client.query('SELECT subtotal FROM order_items WHERE order_id = $1 AND deleted_at IS NULL', [orderId]);
    const subtotal = allItems.rows.reduce((s, i) => s + Number(i.subtotal), 0);
    // Get discount and delivery fee from order
    const orderData = await client.query('SELECT subtotal as order_subtotal, discount_type, discount_value, delivery_fee FROM orders WHERE id = $1', [orderId]);
    const od = orderData.rows[0];
    let discountAmount = 0;
    if (od.discount_type === 'percent' && Number(od.discount_value)) {
      discountAmount = subtotal * (Number(od.discount_value) / 100);
    } else if (od.discount_type === 'fixed' && Number(od.discount_value)) {
      discountAmount = Number(od.discount_value);
    }
    const total = Math.max(0, subtotal - discountAmount + Number(od.delivery_fee || 0));
    await client.query('UPDATE orders SET subtotal = $1, total = $2, updated_at = NOW() WHERE id = $3', [subtotal, total, orderId]);

    await client.query('COMMIT');
    res.status(201).json(itemResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/orders/:id/items/:itemId', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { quantity, unit_price } = req.body;
    const orderId = req.params.id;
    const itemId = req.params.itemId;

    const order = await client.query('SELECT id FROM orders WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [orderId, req.user.client_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });

    await client.query('BEGIN');

    // Get current item
    const item = await client.query('SELECT product_id, quantity FROM order_items WHERE id = $1 AND order_id = $2 AND deleted_at IS NULL', [itemId, orderId]);
    if (!item.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Item no encontrado' }); }
    const oldQty = Number(item.rows[0].quantity);
    const newQty = Number(quantity);

    // Adjust stock difference
    const prod = await client.query('SELECT requires_stock FROM products WHERE id = $1', [item.rows[0].product_id]);
    if (prod.rows[0]?.requires_stock) {
      const diff = newQty - oldQty;
      if (diff > 0) {
        const stockCheck = await client.query('SELECT stock_quantity FROM products WHERE id = $1', [item.rows[0].product_id]);
        if (Number(stockCheck.rows[0].stock_quantity || 0) < diff) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Stock insuficiente para aumentar cantidad' });
        }
        await client.query('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [diff, item.rows[0].product_id]);
      } else if (diff < 0) {
        await client.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [Math.abs(diff), item.rows[0].product_id]);
      }
    }

    // Update item
    const price = unit_price !== undefined ? Number(unit_price) : undefined;
    await client.query(
      'UPDATE order_items SET quantity=COALESCE($1,quantity), unit_price=COALESCE($2,unit_price), subtotal=COALESCE($1,quantity)*COALESCE($2,unit_price,unit_price) WHERE id = $3',
      [quantity, price, itemId]
    );

    // Recalculate order total
    const allItems = await client.query('SELECT subtotal FROM order_items WHERE order_id = $1 AND deleted_at IS NULL', [orderId]);
    const subtotal = allItems.rows.reduce((s, i) => s + Number(i.subtotal), 0);
    const orderData = await client.query('SELECT discount_type, discount_value, delivery_fee FROM orders WHERE id = $1', [orderId]);
    const od = orderData.rows[0];
    let discountAmount = 0;
    if (od.discount_type === 'percent' && Number(od.discount_value)) {
      discountAmount = subtotal * (Number(od.discount_value) / 100);
    } else if (od.discount_type === 'fixed' && Number(od.discount_value)) {
      discountAmount = Number(od.discount_value);
    }
    const total = Math.max(0, subtotal - discountAmount + Number(od.delivery_fee || 0));
    await client.query('UPDATE orders SET subtotal = $1, total = $2, updated_at = NOW() WHERE id = $3', [subtotal, total, orderId]);

    await client.query('COMMIT');
    res.json({ message: 'Item actualizado' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

app.delete('/api/orders/:id/items/:itemId', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const orderId = req.params.id;
    const itemId = req.params.itemId;

    const order = await client.query('SELECT id FROM orders WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL', [orderId, req.user.client_id]);
    if (!order.rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });

    await client.query('BEGIN');

    // Get item to restore stock
    const item = await client.query('SELECT product_id, quantity FROM order_items WHERE id = $1 AND order_id = $2 AND deleted_at IS NULL', [itemId, orderId]);
    if (item.rows[0]) {
      await client.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 AND requires_stock = true', [item.rows[0].quantity, item.rows[0].product_id]);
      await client.query('UPDATE order_items SET deleted_at = NOW() WHERE id = $1', [itemId]);
    }

    // Recalculate order total
    const allItems = await client.query('SELECT subtotal FROM order_items WHERE order_id = $1 AND deleted_at IS NULL', [orderId]);
    const subtotal = allItems.rows.reduce((s, i) => s + Number(i.subtotal), 0);
    const orderData = await client.query('SELECT discount_type, discount_value, delivery_fee FROM orders WHERE id = $1', [orderId]);
    const od = orderData.rows[0];
    let discountAmount = 0;
    if (od.discount_type === 'percent' && Number(od.discount_value)) {
      discountAmount = subtotal * (Number(od.discount_value) / 100);
    } else if (od.discount_type === 'fixed' && Number(od.discount_value)) {
      discountAmount = Number(od.discount_value);
    }
    const total = Math.max(0, subtotal - discountAmount + Number(od.delivery_fee || 0));
    await client.query('UPDATE orders SET subtotal = $1, total = $2, updated_at = NOW() WHERE id = $3', [subtotal, total, orderId]);

    await client.query('COMMIT');
    res.json({ message: 'Item eliminado' });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});




// ─── PRODUCTS STATS ───────────────────────────────────────────
app.get('/api/products/stats', authenticate, async (req, res) => {
  try {
    const { period } = req.query;
    let dateFilter = '';
    const params = [req.user.client_id];
    if (period === 'today') dateFilter = "AND DATE(created_at) = CURRENT_DATE";
    else if (period === 'week') dateFilter = "AND DATE(created_at) >= DATE_TRUNC('week', CURRENT_DATE)";
    else if (period === 'month') dateFilter = "AND DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)";

    const totals = await pool.query(
      "SELECT COUNT(*) FILTER (WHERE is_active = true) as active_count, COUNT(*) FILTER (WHERE is_active = false OR is_active IS NULL) as inactive_count, COALESCE(SUM(stock_quantity) FILTER (WHERE is_active = true), 0) as total_stock, COALESCE(SUM(stock_quantity * price) FILTER (WHERE is_active = true AND requires_stock = true), 0) as inventory_value FROM products WHERE client_id = $1 AND deleted_at IS NULL",
      params
    );
    const lowStock = await pool.query(
      "SELECT COUNT(*) as low_count FROM products WHERE client_id = $1 AND deleted_at IS NULL AND is_active = true AND requires_stock = true AND stock_quantity <= min_stock",
      params
    );
    const bestSeller = await pool.query(
      "SELECT p.name, SUM(oi.quantity) as total_sold FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE p.client_id = $1 AND o.deleted_at IS NULL AND DATE(o.created_at) = CURRENT_DATE" + (period !== 'today' ? " AND DATE(o.created_at) >= DATE_TRUNC('week', CURRENT_DATE)" : "") + " GROUP BY p.name ORDER BY total_sold DESC LIMIT 1",
      params
    );
    res.json({
      active_count: parseInt(totals.rows[0]?.active_count || 0),
      discontinued_count: parseInt(totals.rows[0]?.discontinued_count || 0),
      total_stock: parseInt(totals.rows[0]?.total_stock || 0),
      low_stock: parseInt(lowStock.rows[0]?.low_count || 0),
      inventory_value: parseFloat(totals.rows[0]?.inventory_value || 0),
      best_seller: bestSeller.rows[0] || null,
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── CONTACTS STATS ─────────────────────────────────────────
app.get('/api/contacts/stats', authenticate, async (req, res) => {
  try {
    const { period } = req.query;
    let dateFilter = '';
    const params = [req.user.client_id];
    if (period === 'today') dateFilter = "AND DATE(c.created_at) = CURRENT_DATE";
    else if (period === 'week') dateFilter = "AND DATE(c.created_at) >= DATE_TRUNC('week', CURRENT_DATE)";
    else if (period === 'month') dateFilter = "AND DATE(c.created_at) >= DATE_TRUNC('month', CURRENT_DATE)";

    const totals = await pool.query(
      "SELECT COUNT(*) FILTER (WHERE c.deleted_at IS NULL) as total, COUNT(*) FILTER (WHERE c.deleted_at IS NOT NULL) as deleted_count, COUNT(*) FILTER (WHERE c.whatsapp IS NOT NULL AND c.whatsapp != '') as with_whatsapp, COUNT(*) FILTER (WHERE c.instagram IS NOT NULL AND c.instagram != '') as with_instagram, COUNT(*) FILTER (WHERE c.tiktok IS NOT NULL AND c.tiktok != '') as with_tiktok, COUNT(*) FILTER (WHERE c.email IS NOT NULL AND c.email != '') as with_email FROM contacts c WHERE c.client_id = $1",
      params
    );
    const newContacts = await pool.query(
      "SELECT COUNT(*) as new_count FROM contacts WHERE client_id = $1 AND deleted_at IS NULL " + dateFilter,
      params
    );
    res.json({
      total: parseInt(totals.rows[0]?.total || 0),
      new_count: parseInt(newContacts.rows[0]?.new_count || 0),
      deleted_count: parseInt(totals.rows[0]?.deleted_count || 0),
      with_whatsapp: parseInt(totals.rows[0]?.with_whatsapp || 0),
      with_instagram: parseInt(totals.rows[0]?.with_instagram || 0),
      with_tiktok: parseInt(totals.rows[0]?.with_tiktok || 0),
      with_email: parseInt(totals.rows[0]?.with_email || 0),
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── LEADS STATS ─────────────────────────────────────────────
app.get('/api/leads/stats', authenticate, async (req, res) => {
  try {
    const { period } = req.query;
    let dateFilter = '';
    const params = [req.user.client_id];
    if (period === 'today') dateFilter = "AND DATE(l.created_at) = CURRENT_DATE";
    else if (period === 'week') dateFilter = "AND DATE(l.created_at) >= DATE_TRUNC('week', CURRENT_DATE)";
    else if (period === 'month') dateFilter = "AND DATE(l.created_at) >= DATE_TRUNC('month', CURRENT_DATE)";

    const totals = await pool.query(
      "SELECT COUNT(*) FILTER (WHERE l.status = 'new') as new_count, COUNT(*) FILTER (WHERE l.status = 'converted') as converted_count, COUNT(*) FILTER (WHERE l.status = 'rejected' OR l.status = 'lost') as lost_count, COUNT(*) FILTER (WHERE l.status = 'contacted') as contacted_count, COUNT(*) FILTER (WHERE l.status = 'waiting') as waiting_count FROM leads l WHERE l.client_id = $1 AND l.deleted_at IS NULL " + dateFilter,
      params
    );
    const totalLeads = await pool.query(
      "SELECT COUNT(*) as total FROM leads l WHERE l.client_id = $1 AND l.deleted_at IS NULL " + dateFilter,
      params
    );
    const sources = await pool.query(
      "SELECT COALESCE(l.source, 'Sin origen') as source, COUNT(*) as count FROM leads l WHERE l.client_id = $1 AND l.deleted_at IS NULL " + dateFilter + " GROUP BY l.source ORDER BY count DESC LIMIT 5",
      params
    );
    let liDateFilter = '';
    if (period === 'today') liDateFilter = "AND DATE(li.created_at) = CURRENT_DATE";
    else if (period === 'week') liDateFilter = "AND DATE(li.created_at) >= DATE_TRUNC('week', CURRENT_DATE)";
    else if (period === 'month') liDateFilter = "AND DATE(li.created_at) >= DATE_TRUNC('month', CURRENT_DATE)";
    const interactions = await pool.query(
      "SELECT COUNT(*) as total_interactions FROM lead_interactions li WHERE li.client_id = $1 " + liDateFilter,
      params
    );
    const totalLeadsAll = parseInt(totalLeads.rows[0]?.total || 0);
    const converted = parseInt(totals.rows[0]?.converted_count || 0);
    res.json({
      total: totalLeadsAll,
      new_count: parseInt(totals.rows[0]?.new_count || 0),
      converted_count: converted,
      conversion_rate: totalLeadsAll > 0 ? Math.round((converted / totalLeadsAll) * 100) : 0,
      lost_count: parseInt(totals.rows[0]?.lost_count || 0),
      contacted_count: parseInt(totals.rows[0]?.contacted_count || 0),
      waiting_count: parseInt(totals.rows[0]?.waiting_count || 0),
      sources: sources.rows,
      total_interactions: parseInt(interactions.rows[0]?.total_interactions || 0),
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});


// ─── COBROS MODULE ────────────────────────────────────────────
// Cash Sessions (Cobros)
app.get('/api/cash-sessions', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT cs.*, u.name as user_name FROM cash_sessions cs LEFT JOIN users u ON cs.user_id = u.id WHERE cs.session_type = $1';
    const params = ['cash'];
    if (status) { sql += ' AND cs.status = $2'; params.push(status); }
    sql += ' ORDER BY cs.opened_at DESC LIMIT 50';
    const { rows } = await pool.query(sql, params);
    for (const s of rows) {
      const mv = await pool.query("SELECT cm.*, fa.name as account_name, c.name as contact_name, o.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts c ON cm.contact_id = c.id LEFT JOIN orders o ON cm.order_id = o.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_id = $1 AND cm.session_type = $2 ORDER BY cm.created_at DESC", [s.id, 'cash']);
      s.movements = mv.rows;
      s.total_in = mv.rows.filter(m => m.type === 'in').reduce((sum, m) => sum + Number(m.amount), 0);
      s.total_out = mv.rows.filter(m => m.type === 'out').reduce((sum, m) => sum + Number(m.amount), 0);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cash-sessions', async (req, res) => {
  try {
    const { initial_amount = 0 } = req.body;
    const user_id = req.user?.id || 1;
    const existing = await pool.query("SELECT * FROM cash_sessions WHERE user_id = $1 AND status = 'open' AND session_type = 'cash'", [user_id]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya hay una caja abierta' });
    const { rows } = await pool.query("INSERT INTO cash_sessions (user_id, opened_at, status, initial_amount, session_type) VALUES ($1, NOW(), 'open', $2, 'cash') RETURNING *", [user_id, initial_amount]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cash-sessions/current', async (req, res) => {
  try {
    const user_id = req.user?.id || 1;
    const { rows } = await pool.query("SELECT cs.*, u.name as user_name FROM cash_sessions cs LEFT JOIN users u ON cs.user_id = u.id WHERE cs.user_id = $1 AND cs.status = 'open' AND cs.session_type = 'cash' ORDER BY cs.opened_at DESC LIMIT 1", [user_id]);
    if (rows.length === 0) return res.json(null);
    const sess = rows[0];
    const mv = await pool.query("SELECT cm.*, fa.name as account_name, c.name as contact_name, o.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts c ON cm.contact_id = c.id LEFT JOIN orders o ON cm.order_id = o.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_id = $1 AND cm.session_type = $2 ORDER BY cm.created_at DESC", [sess.id, 'cash']);
    sess.movements = mv.rows;
    sess.total_in = mv.rows.filter(m => m.type === 'in').reduce((sum, m) => sum + Number(m.amount), 0);
    sess.total_out = mv.rows.filter(m => m.type === 'out').reduce((sum, m) => sum + Number(m.amount), 0);
    res.json(sess);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cash-sessions/:id/close', async (req, res) => {
  try {
    const { final_amount = 0, total_cash = 0, total_digital = 0, total_other = 0, notes = '' } = req.body;
    const diff = Number(final_amount);
    const status2 = diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'deficit';
    await pool.query("UPDATE cash_sessions SET status = 'closed', closed_at = NOW(), final_amount = $1, total_cash = $2, total_digital = $3, total_other = $4, diff = $5, status2 = $6, notes = $7 WHERE id = $8 AND session_type = 'cash'", [final_amount, total_cash, total_digital, total_other, diff, status2, notes, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Cash Movements (Cobros)
app.get('/api/cash-movements', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT cm.*, fa.name as account_name, c.name as contact_name, o.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts c ON cm.contact_id = c.id LEFT JOIN orders o ON cm.order_id = o.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_type = 'cash' ORDER BY cm.created_at DESC LIMIT 200");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/cash-movements', async (req, res) => {
  try {
    const { financial_account_id, type = 'in', reason = 'other_in', order_id, contact_id, amount, notes } = req.body;
    if (!financial_account_id || !amount) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const user_id = req.user?.id || 1;
    const sess = await pool.query("SELECT * FROM cash_sessions WHERE user_id = $1 AND status = 'open' AND session_type = 'cash' ORDER BY opened_at DESC LIMIT 1", [user_id]);
    let session_id = sess.rows[0]?.id;
    if (!session_id) {
      const ns = await pool.query("INSERT INTO cash_sessions (user_id, opened_at, status, initial_amount, session_type) VALUES ($1, NOW(), 'open', 0, 'cash') RETURNING id", [user_id]);
      session_id = ns.rows[0].id;
    }
    const { rows } = await pool.query("INSERT INTO cash_movements (session_id, session_type, financial_account_id, type, reason, order_id, contact_id, amount, notes, created_by, created_at) VALUES ($1, 'cash', $2, $3, $4, $5, $6, $7, $8, $9, NOW()) RETURNING *", [session_id, financial_account_id, type, reason, order_id || null, contact_id || null, amount, notes || null, user_id]);
    if (reason === 'nv_payment' && order_id) {
      await pool.query("INSERT INTO order_payments (order_id, payment_method_id, amount, paid_at, created_by, notes) VALUES ($1, $2, $3, NOW(), $4, $5)", [order_id, financial_account_id, amount, user_id, notes || 'Cobro desde modulo Cobros']);
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/cash-movements/:id', async (req, res) => {
  try {
    await pool.query("UPDATE cash_movements SET deleted_at = NOW() WHERE id = $1 AND session_type = 'cash'", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cash/stats', async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    let dateFilter = "AND DATE(cm.created_at) = CURRENT_DATE";
    if (period === 'week') dateFilter = "AND DATE(cm.created_at) >= CURRENT_DATE - INTERVAL '7 days'";
    else if (period === 'month') dateFilter = "AND DATE(cm.created_at) >= CURRENT_DATE - INTERVAL '30 days'";
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN cm.type = 'in' THEN cm.amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN cm.type = 'out' THEN cm.amount ELSE 0 END), 0) as total_out,
        COUNT(*) as move_count,
        COUNT(DISTINCT cm.order_id) FILTER (WHERE cm.order_id IS NOT NULL AND cm.reason = 'nv_payment') as nv_count,
        COALESCE(SUM(CASE WHEN cm.type = 'in' THEN cm.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN cm.type = 'out' THEN cm.amount ELSE 0 END), 0) as net
      FROM cash_movements cm
      JOIN cash_sessions cs ON cm.session_id = cs.id
      WHERE cm.session_type = 'cash' AND cm.deleted_at IS NULL ${dateFilter}
    `);
    res.json(rows[0] || { total_in: 0, total_out: 0, move_count: 0, nv_count: 0, net: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── COMPRAS MODULE ─────────────────────────────────────────

// --- PROVIDERS ---
app.get('/api/providers', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const { rows } = await pool.query(
      `SELECT id, name, business_name, tax_id, contact_person, phone, whatsapp, email, address, notes
       FROM providers WHERE deleted_at IS NULL AND (name ILIKE $1 OR business_name ILIKE $1 OR tax_id ILIKE $1)
       ORDER BY name LIMIT 50`,
      [q ? '%' + q + '%' : '%']
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/providers', async (req, res) => {
  try {
    const { name, business_name, tax_id, contact_person, phone, whatsapp, email, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const { rows } = await pool.query(
      `INSERT INTO providers (name, business_name, tax_id, contact_person, phone, whatsapp, email, address, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, business_name, tax_id, contact_person, phone, whatsapp, email, address, notes]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/purchase-orders', async (req, res) => {
  try {
    const { status, payment_status } = req.query;
    let sql = `SELECT po.*, prov.name as provider_name, ps.name as status_name, ps.color as status_color, pst.name as payment_status_name, pst.color as payment_status_color,
      (SELECT COALESCE(SUM(op.amount),0) FROM order_payments op WHERE op.order_id = po.id AND op.deleted_at IS NULL) as payment_paid
      FROM purchase_orders po
      LEFT JOIN providers prov ON po.provider_id = prov.id
      LEFT JOIN purchase_statuses ps ON po.status_id = ps.id
      LEFT JOIN payment_statuses pst ON po.payment_status_id = pst.id
      WHERE po.deleted_at IS NULL`;
    const params = [];
    if (status) { params.push(status); sql += ` AND ps.name = $${params.length}`; }
    if (payment_status) { params.push(payment_status); sql += ` AND pst.name = $${params.length}`; }
    sql += ' ORDER BY po.created_at DESC LIMIT 100';
    const { rows } = await pool.query(sql, params);
    for (const o of rows) {
      const items = await pool.query('SELECT * FROM purchase_order_items WHERE order_id = $1 AND deleted_at IS NULL', [o.id]);
      o.items = items.rows;
      o.subtotal = items.rows.reduce((s, i) => s + Number(i.subtotal || 0), 0);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/purchase-orders', async (req, res) => {
  try {
    const { provider_id, notes, delivery_fee, discount_type, discount_value, items, payment_method_id, payment_amount } = req.body;
    const subtotal = items ? items.reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;
    let discount = 0;
    if (discount_type === 'percent' && discount_value) discount = subtotal * (discount_value / 100);
    else if (discount_type === 'fixed') discount = discount_value || 0;
    const total = Math.max(0, subtotal - discount + (delivery_fee || 0));
    const seq = await pool.query("SELECT nextval('purchase_order_seq')");
    const order_number = 'NP-' + String(seq.rows[0].nextval).padStart(5, '0');
    // Obtener primer status de purchase_statuses
    const { rows: statusRows } = await pool.query("SELECT id FROM purchase_statuses ORDER BY id LIMIT 1");
    const statusId = statusRows[0]?.id || 1;
    // Payment status Impago
    const { rows: payRows } = await pool.query("SELECT id FROM payment_statuses WHERE name = 'Impago' LIMIT 1");
    const payStatusId = payRows[0]?.id;
    const { rows } = await pool.query(
      "INSERT INTO purchase_orders (order_number, provider_id, subtotal, discount_type, discount_value, delivery_fee, total, status_id, payment_status_id, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [order_number, provider_id || null, subtotal, discount_type || null, discount || 0, delivery_fee || 0, total, statusId, payStatusId, notes || null]
    );
    const order = rows[0];
    if (items && items.length > 0) {
      for (const item of items) {
        await pool.query("INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6)", [order.id, item.product_id, item.product_name, item.quantity, item.unit_price, item.quantity * item.unit_price]);
      }
    }
    // Si pagaron en el acto, registrar movimiento de pago entrante
    if (payment_method_id && Number(payment_amount) > 0) {
      const { rows: sessRows } = await pool.query(
        "SELECT id FROM cash_sessions WHERE session_type='pagos' AND status='open' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1"
      );
      if (sessRows.length > 0) {
        await pool.query(
          "INSERT INTO cash_movements (session_id, session_type, financial_account_id, type, reason, amount, purchase_order_id) VALUES ($1,'pagos',$2,'in','other_in',$3,$4)",
          [sessRows[0].id, payment_method_id, payment_amount, order.id]
        );
        await pool.query("UPDATE cash_sessions SET total_in = total_in + $1 WHERE id = $2", [payment_amount, sessRows[0].id]);
      }
      // Actualizar payment_status a Cobrado si el monto cubre el total
      if (Number(payment_amount) >= total) {
        const { rows: cobrRows } = await pool.query("SELECT id FROM payment_statuses WHERE name = 'Cobrado' LIMIT 1");
        if (cobrRows[0]) await pool.query("UPDATE purchase_orders SET payment_status_id = $1 WHERE id = $2", [cobrRows[0].id, order.id]);
      } else {
        const { rows: parcRows } = await pool.query("SELECT id FROM payment_statuses WHERE name = 'Cobrado Parcial' LIMIT 1");
        if (parcRows[0]) await pool.query("UPDATE purchase_orders SET payment_status_id = $1 WHERE id = $2", [parcRows[0].id, order.id]);
      }
    }
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/purchase-orders/stats', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    let dateFilter = "AND DATE(po.created_at) >= CURRENT_DATE - INTERVAL '30 days'";
    if (period === 'today') dateFilter = "AND DATE(po.created_at) = CURRENT_DATE";
    else if (period === 'week') dateFilter = "AND DATE(po.created_at) >= CURRENT_DATE - INTERVAL '7 days'";
    const { rows } = await pool.query(`
      SELECT COUNT(*) as total_count, COALESCE(SUM(po.total), 0) as total_amount
      FROM purchase_orders po WHERE po.deleted_at IS NULL ${dateFilter}
    `);
    res.json(rows[0] || { total_count: 0, total_amount: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/purchase-orders/:id', async (req, res) => {
  try {
    const { status_id, payment_status_id, notes } = req.body;
    const updates = [];
    const params = [];
    if (status_id !== undefined) { params.push(status_id); updates.push(`status_id = $${params.length}`); }
    if (payment_status_id !== undefined) { params.push(payment_status_id); updates.push(`payment_status_id = $${params.length}`); }
    if (notes !== undefined) { params.push(notes); updates.push(`notes = $${params.length}`); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    params.push(req.params.id);
    await pool.query(`UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`, params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/purchase-orders/:id', async (req, res) => {
  try {
    await pool.query('UPDATE purchase_orders SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/purchase-orders/:id/items', async (req, res) => {
  try {
    const { product_id, product_name, quantity, unit_price } = req.body;
    const subtotal = quantity * unit_price;
    const { rows } = await pool.query("INSERT INTO purchase_order_items (order_id, product_id, product_name, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [req.params.id, product_id, product_name, quantity, unit_price, subtotal]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/purchase-orders/:id/items/:itemId', async (req, res) => {
  try {
    await pool.query('UPDATE purchase_order_items SET deleted_at = NOW() WHERE id = $1 AND order_id = $2', [req.params.itemId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/purchase-orders/:id/receive', async (req, res) => {
  try {
    const { rows: orderRows } = await pool.query('SELECT * FROM purchase_orders WHERE id = $1 AND deleted_at IS NULL', [req.params.id]);
    if (orderRows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    await pool.query("UPDATE purchase_orders SET status_id = 3 WHERE id = $1", [req.params.id]); // 3 = Recibido
    const items = await pool.query('SELECT * FROM purchase_order_items WHERE order_id = $1 AND deleted_at IS NULL', [req.params.id]);
    for (const item of items.rows) {
      if (item.product_id) {
        const prod = await pool.query('SELECT stock_quantity, requires_stock FROM products WHERE id = $1', [item.product_id]);
        if (prod.rows[0]?.requires_stock) {
          await pool.query('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }
      }
    }
    res.json({ ok: true, message: 'NP marcada como recibida, stock actualizado' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/purchase-orders/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT po.*, prov.name as provider_name, ps.name as status_name, ps.color as status_color, pst.name as payment_status_name, pst.color as payment_status_color FROM purchase_orders po LEFT JOIN providers prov ON po.provider_id = prov.id LEFT JOIN purchase_statuses ps ON po.status_id = ps.id LEFT JOIN payment_statuses pst ON po.payment_status_id = pst.id WHERE po.id = $1 AND po.deleted_at IS NULL`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'No encontrado' });
    const items = await pool.query('SELECT * FROM purchase_order_items WHERE order_id = $1 AND deleted_at IS NULL', [req.params.id]);
    rows[0].items = items.rows;
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/purchase-statuses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM purchase_statuses ORDER BY sort_order, id');
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/purchase-statuses', async (req, res) => {
  try {
    const { name, color, sort_order } = req.body;
    const { rows } = await pool.query('INSERT INTO purchase_statuses (name, color, sort_order) VALUES ($1, $2, $3) RETURNING *', [name, color || '#888', sort_order || 0]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/purchase-statuses/:id', async (req, res) => {
  try {
    const { name, color, sort_order } = req.body;
    await pool.query('UPDATE purchase_statuses SET name = COALESCE($1, name), color = COALESCE($2, color), sort_order = COALESCE($3, sort_order) WHERE id = $4', [name, color, sort_order, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/purchase-statuses/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM purchase_statuses WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PAGOS MODULE ────────────────────────────────────────────
app.get('/api/payment-sessions', async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT cs.*, u.name as user_name FROM cash_sessions cs LEFT JOIN users u ON cs.user_id = u.id WHERE cs.session_type = $1';
    const params = ['pagos'];
    if (status) { sql += ' AND cs.status = $2'; params.push(status); }
    sql += ' ORDER BY cs.opened_at DESC LIMIT 50';
    const { rows } = await pool.query(sql, params);
    for (const s of rows) {
      const mv = await pool.query("SELECT cm.*, fa.name as account_name, prov.name as provider_name, po.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts sup ON cm.supplier_id = sup.id LEFT JOIN orders po ON cm.order_id = po.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_id = $1 AND cm.session_type = $2 ORDER BY cm.created_at DESC", [s.id, 'pagos']);
      s.movements = mv.rows;
      s.total_in = mv.rows.filter(m => m.type === 'in').reduce((sum, m) => sum + Number(m.amount), 0);
      s.total_out = mv.rows.filter(m => m.type === 'out').reduce((sum, m) => sum + Number(m.amount), 0);
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment-sessions', async (req, res) => {
  try {
    const { initial_amount = 0 } = req.body;
    const user_id = req.user?.id || 1;
    const existing = await pool.query("SELECT * FROM cash_sessions WHERE user_id = $1 AND status = 'open' AND session_type = 'pagos'", [user_id]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Ya hay una sesion de pagos abierta' });
    const { rows } = await pool.query("INSERT INTO cash_sessions (user_id, opened_at, status, initial_amount, session_type) VALUES ($1, NOW(), 'open', $2, 'pagos') RETURNING *", [user_id, initial_amount]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payment-sessions/current', async (req, res) => {
  try {
    const user_id = req.user?.id || 1;
    const { rows } = await pool.query("SELECT cs.*, u.name as user_name FROM cash_sessions cs LEFT JOIN users u ON cs.user_id = u.id WHERE cs.user_id = $1 AND cs.status = 'open' AND cs.session_type = 'pagos' ORDER BY cs.opened_at DESC LIMIT 1", [user_id]);
    if (rows.length === 0) return res.json(null);
    const sess = rows[0];
    const mv = await pool.query("SELECT cm.*, fa.name as account_name, prov.name as provider_name, po.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts sup ON cm.supplier_id = sup.id LEFT JOIN orders po ON cm.order_id = po.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_id = $1 AND cm.session_type = $2 ORDER BY cm.created_at DESC", [sess.id, 'pagos']);
    sess.movements = mv.rows;
    sess.total_in = mv.rows.filter(m => m.type === 'in').reduce((sum, m) => sum + Number(m.amount), 0);
    sess.total_out = mv.rows.filter(m => m.type === 'out').reduce((sum, m) => sum + Number(m.amount), 0);
    res.json(sess);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment-sessions/:id/close', async (req, res) => {
  try {
    const { final_amount = 0, total_cash = 0, total_digital = 0, total_other = 0, notes = '' } = req.body;
    const diff = Number(final_amount);
    const status2 = diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'deficit';
    await pool.query("UPDATE cash_sessions SET status = 'closed', closed_at = NOW(), final_amount = $1, total_cash = $2, total_digital = $3, total_other = $4, diff = $5, status2 = $6, notes = $7 WHERE id = $8 AND session_type = 'pagos'", [final_amount, total_cash, total_digital, total_other, diff, status2, notes, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payment-movements', async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT cm.*, fa.name as account_name, prov.name as provider_name, po.order_number, u.name as created_by_name FROM cash_movements cm LEFT JOIN financial_accounts fa ON cm.financial_account_id = fa.id LEFT JOIN contacts sup ON cm.supplier_id = sup.id LEFT JOIN orders po ON cm.order_id = po.id LEFT JOIN users u ON cm.created_by = u.id WHERE cm.session_type = 'pagos' ORDER BY cm.created_at DESC LIMIT 200");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment-movements', async (req, res) => {
  try {
    const { financial_account_id, type = 'out', reason = 'other_out', order_id, contact_id, supplier_id, purchase_order_id, amount, notes } = req.body;
    if (!financial_account_id || !amount) return res.status(400).json({ error: 'Faltan campos requeridos' });
    const user_id = req.user?.id || 1;
    const sess = await pool.query("SELECT * FROM cash_sessions WHERE user_id = $1 AND status = 'open' AND session_type = 'pagos' ORDER BY opened_at DESC LIMIT 1", [user_id]);
    let session_id = sess.rows[0]?.id;
    if (!session_id) {
      const ns = await pool.query("INSERT INTO cash_sessions (user_id, opened_at, status, initial_amount, session_type) VALUES ($1, NOW(), 'open', 0, 'pagos') RETURNING id", [user_id]);
      session_id = ns.rows[0].id;
    }
    const { rows } = await pool.query("INSERT INTO cash_movements (session_id, session_type, financial_account_id, type, reason, order_id, contact_id, supplier_id, purchase_order_id, amount, notes, created_by, created_at) VALUES ($1, 'pagos', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) RETURNING *", [session_id, financial_account_id, type, reason, order_id || null, contact_id || null, supplier_id || null, purchase_order_id || null, amount, notes || null, user_id]);
    if (reason === 'np_payment' && purchase_order_id) {
      await pool.query("INSERT INTO order_payments (order_id, payment_method_id, amount, paid_at, created_by, notes) VALUES ($1, $2, $3, NOW(), $4, $5)", [purchase_order_id, financial_account_id, amount, user_id, notes || 'Pago desde modulo Pagos']);
    }
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/payment-movements/:id', async (req, res) => {
  try {
    await pool.query("UPDATE cash_movements SET deleted_at = NOW() WHERE id = $1 AND session_type = 'pagos'", [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/payment/stats', async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    let dateFilter = "AND DATE(cm.created_at) = CURRENT_DATE";
    if (period === 'week') dateFilter = "AND DATE(cm.created_at) >= CURRENT_DATE - INTERVAL '7 days'";
    else if (period === 'month') dateFilter = "AND DATE(cm.created_at) >= CURRENT_DATE - INTERVAL '30 days'";
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN cm.type = 'in' THEN cm.amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN cm.type = 'out' THEN cm.amount ELSE 0 END), 0) as total_out,
        COUNT(*) as move_count,
        COUNT(DISTINCT cm.purchase_order_id) FILTER (WHERE cm.purchase_order_id IS NOT NULL) as np_count,
        COALESCE(SUM(CASE WHEN cm.type = 'out' THEN cm.amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN cm.type = 'in' THEN cm.amount ELSE 0 END), 0) as net
      FROM cash_movements cm
      JOIN cash_sessions cs ON cm.session_id = cs.id
      WHERE cm.session_type = 'pagos' AND cm.deleted_at IS NULL ${dateFilter}
    `);
    res.json(rows[0] || { total_in: 0, total_out: 0, move_count: 0, np_count: 0, net: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


app.listen(PORT, () => {
  console.log(`\n🚀 VIB3.ia Backend running on http://localhost:${PORT}`);
  console.log(`   Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT CONFIGURED'}`);
});
