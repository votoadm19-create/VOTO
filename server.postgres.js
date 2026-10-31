'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pool } = require('./database');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const SEED_FILE = path.join(ROOT, 'seed', 'products.json');
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const asyncHandler = function (fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const CATEGORIES = ['kit-f', 'kit-m', 'material', 'papelaria', 'mochilas', 'fem', 'masc'];
const ORDER_STATUS = ['novo', 'confirmado', 'enviado', 'entregue', 'cancelado'];
const DEFAULT_SETTINGS = {
  whatsapp: '5511947400141',
  whatsapp_texto: '11 94740-0141',
  frete_jundiai: '10',
  frete_varzea: '15',
};

async function getSettings() {
  const out = Object.assign({}, DEFAULT_SETTINGS);

  const result = await pool.query(
    'SELECT chave, valor FROM settings'
  );

  result.rows.forEach(function (row) {
    out[row.chave] = row.valor;
  });

  return out;
}

async function setSetting(chave, valor) {
  await pool.query(
    `INSERT INTO settings (chave, valor)
     VALUES ($1, $2)
     ON CONFLICT (chave)
     DO UPDATE SET valor = EXCLUDED.valor`,
    [chave, String(valor)]
  );
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}

function checkPassword(password, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const parts = stored.split(':');
  const salt = parts[0];
  const expected = Buffer.from(parts[1], 'hex');
  const actual = crypto.scryptSync(String(password), salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(function (part) {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

async function startSession(res, tipo, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = 7 * 24 * 60 * 60 * 1000;

  await pool.query(
    `INSERT INTO sessions (token, tipo, user_id, expira_em)
     VALUES ($1, $2, $3, $4)`,
    [sha256(token), tipo, userId, Date.now() + maxAge]
  );

  res.cookie('voto_sess', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: maxAge,
    path: '/',
  });
}

async function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.voto_sess;

  if (!token) return null;

  const result = await pool.query(
    'SELECT * FROM sessions WHERE token = $1',
    [sha256(token)]
  );

  const row = result.rows[0];

  if (!row) return null;

  if (Number(row.expira_em) < Date.now()) {
    await pool.query(
      'DELETE FROM sessions WHERE token = $1',
      [row.token]
    );
    return null;
  }

  return row;
}

const requireCustomer = asyncHandler(async function (req, res, next) {
  const session = await getSession(req);

  if (!session || session.tipo !== 'cliente') {
    return res.status(401).json({
      erro: 'Entre na sua conta para continuar.',
    });
  }

  const result = await pool.query(
    `SELECT id, nome, email, telefone, criado_em
     FROM customers WHERE id = $1`,
    [session.user_id]
  );

  const customer = result.rows[0];

  if (!customer) {
    return res.status(401).json({
      erro: 'Conta não encontrada.',
    });
  }

  req.customer = customer;
  next();
});

const requireAdmin = asyncHandler(async function (req, res, next) {
  const session = await getSession(req);

  if (!session || session.tipo !== 'admin') {
    return res.status(401).json({
      erro: 'Acesso restrito ao administrador.',
    });
  }

  const result = await pool.query(
    'SELECT id, usuario, nome FROM admins WHERE id = $1',
    [session.user_id]
  );

  const admin = result.rows[0];

  if (!admin) {
    return res.status(401).json({
      erro: 'Administrador não encontrado.',
    });
  }

  req.admin = admin;
  next();
});

function productOut(row) {
  return {
    id: row.id,
    nome: row.nome,
    cat: row.cat,
    preco: Number(row.preco),
    de: row.de == null ? null : Number(row.de),
    v: row.v,
    art: row.art,
    cor: row.cor,
    foto: row.foto || null,
    descricao: row.descricao || null,
    badge: row.badge || null,
    estoque: Number(row.estoque),
    ativo: row.ativo === true,
    nota_media: row.nota_media == null ? null : Number(row.nota_media),
    total_avaliacoes: row.total_avaliacoes == null
      ? 0
      : Number(row.total_avaliacoes),
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function productForStore(row) {
  const p = productOut(row);
  if (p.de == null) delete p.de;
  if (!p.foto) delete p.foto;
  if (!p.descricao) delete p.descricao;
  if (!p.badge) delete p.badge;
  delete p.estoque;
  delete p.ativo;
  delete p.criado_em;
  delete p.atualizado_em;
  return p;
}

const PRODUCT_SELECT = `
  SELECT p.*,
    (SELECT ROUND(AVG(r.nota), 1) FROM reviews r WHERE r.product_id = p.id) AS nota_media,
    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS total_avaliacoes
  FROM products p
`;

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function saveDataUrl(dataUrl, maxBytes) {
  const match =
    typeof dataUrl === 'string'
      ? dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/)
      : null;
  if (!match) return { erro: 'Envie uma imagem PNG, JPG, WEBP ou GIF.' };
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > maxBytes) {
    return { status: 413, erro: 'Imagem muito grande (máximo ' + Math.round(maxBytes / 1024 / 1024) + ' MB).' };
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: '/uploads/' + name };
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function validNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/* ---------- seed ---------- */

async function seedProducts() {
  const countResult = await pool.query(
    'SELECT COUNT(*) AS total FROM products'
  );

  if (Number(countResult.rows[0].total) > 0) return;

  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const p of seed) {
      await client.query(
        `INSERT INTO products
         (id, nome, cat, preco, de, v, art, cor, foto, badge, estoque, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          p.nome,
          p.cat,
          p.preco,
          p.de == null ? null : p.de,
          p.v || 0,
          p.art || 'kit',
          p.cor || '#e2561c',
          p.foto || null,
          p.badge || null,
          typeof p.estoque === 'number' ? p.estoque : 50,
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Produtos iniciais importados:', seed.length);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function seedAdmin() {
  const countResult = await pool.query(
    'SELECT COUNT(*) AS total FROM admins'
  );

  if (Number(countResult.rows[0].total) > 0) return;

  const usuario = process.env.ADMIN_USER;
  const senha = process.env.ADMIN_PASS;

  if (!usuario || !senha || senha.length < 12) {
    throw new Error(
      'Configure ADMIN_USER e ADMIN_PASS com uma senha de pelo menos 12 caracteres.'
    );
  }

  await pool.query(
    'INSERT INTO admins (usuario, nome, senha) VALUES ($1, $2, $3)',
    [usuario, 'Administrador', hashPassword(senha)]
  );

  console.log('Administrador inicial criado.');
}

async function initializeDatabase() {
  await seedProducts();
  await seedAdmin();

  await pool.query(
    'DELETE FROM sessions WHERE expira_em < $1',
    [Date.now()]
  );

  console.log('Banco PostgreSQL inicializado.');
}

/* ---------- app ---------- */

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

app.get('/', function (req, res) {
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.get('/index.html', function (req, res) {
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.get('/style.css', function (req, res) {
  res.sendFile(path.join(ROOT, 'style.css'));
});
app.get('/script.js', function (req, res) {
  res.sendFile(path.join(ROOT, 'script.js'));
});
app.use('/imgs', express.static(path.join(ROOT, 'imgs')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/admin', express.static(path.join(ROOT, 'admin')));

/* ---------- loja: produtos ---------- */

app.get('/api/products', asyncHandler(async function (req, res) {
  const result = await pool.query(
    PRODUCT_SELECT + ' WHERE p.ativo = TRUE ORDER BY p.criado_em, p.nome'
  );

  res.json(result.rows.map(productForStore));
}));

app.get('/api/products.js', asyncHandler(async function (req, res) {
  const result = await pool.query(
    PRODUCT_SELECT + ' WHERE p.ativo = TRUE ORDER BY p.criado_em, p.nome'
  );

  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(
    'window.VOTO_PRODUCTS = ' +
    JSON.stringify(result.rows.map(productForStore)) +
    ';'
  );
}));

app.get('/api/config.js', asyncHandler(async function (req, res) {
  const s = await getSettings();

  const config = {
    whatsapp: s.whatsapp,
    whatsappTexto: s.whatsapp_texto,
    frete: {
      'Jundiaí': Number(s.frete_jundiai) || 10,
      'Várzea Paulista': Number(s.frete_varzea) || 15,
    },
  };

  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send('window.VOTO_CONFIG = ' + JSON.stringify(config) + ';');
}));

app.get('/api/products/:id/reviews', asyncHandler(async function (req, res) {
  const result = await pool.query(
    `SELECT id, nota, comentario, customer_nome, criado_em
     FROM reviews
     WHERE product_id = $1
     ORDER BY id DESC`,
    [req.params.id]
  );

  const rows = result.rows;
  const media = rows.length
    ? Math.round(
        (rows.reduce(function (a, r) {
          return a + Number(r.nota);
        }, 0) / rows.length) * 10
      ) / 10
    : null;

  res.json({
    media: media,
    total: rows.length,
    avaliacoes: rows,
  });
}));

app.post('/api/products/:id/reviews', requireCustomer, asyncHandler(async function (req, res) {
  const produto = await pool.query(
    'SELECT id FROM products WHERE id = $1',
    [req.params.id]
  );

  if (!produto.rows[0]) {
    return res.status(404).json({ erro: 'Produto não encontrado.' });
  }

  const nota = Number(req.body && req.body.nota);
  const comentario = trimOrNull(req.body && req.body.comentario);

  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({
      erro: 'Escolha uma nota de 1 a 5 estrelas.',
    });
  }

  await pool.query(
    `INSERT INTO reviews
      (product_id, customer_id, customer_nome, nota, comentario)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (product_id, customer_id)
     DO UPDATE SET
       nota = EXCLUDED.nota,
       comentario = EXCLUDED.comentario,
       criado_em = NOW()`,
    [
      req.params.id,
      req.customer.id,
      req.customer.nome,
      nota,
      comentario,
    ]
  );

  res.status(201).json({ ok: true });
}));

/* ---------- loja: clientes ---------- */

app.post('/api/auth/register', asyncHandler(async function (req, res) {
  const nome = trimOrNull(req.body && req.body.nome);
  const email = trimOrNull(req.body && req.body.email);
  const telefone = trimOrNull(req.body && req.body.telefone);
  let cpf = trimOrNull(req.body && req.body.cpf);
  if (cpf) cpf = cpf.replace(/\D/g, '');
  const senha = req.body && req.body.senha;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (String(senha).length < 6) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres.' });
  }
  if (cpf && cpf.length !== 11) {
    return res.status(400).json({ erro: 'O CPF precisa ter 11 dígitos.' });
  }

  const emailNormalizado = email.toLowerCase();

  const exists = await pool.query(
    'SELECT id FROM customers WHERE lower(email) = lower($1)',
    [emailNormalizado]
  );

  if (exists.rows[0]) {
    return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
  }

  let customer;

  try {
    const result = await pool.query(
      `INSERT INTO customers (nome, email, telefone, cpf, senha)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, email, telefone, cpf, foto`,
      [nome, emailNormalizado, telefone, cpf, hashPassword(senha)]
    );
    customer = result.rows[0];
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
    }
    throw err;
  }

  await startSession(res, 'cliente', customer.id);

  res.status(201).json({ cliente: customer });
}));

app.post('/api/auth/login', asyncHandler(async function (req, res) {
  const email = trimOrNull(req.body && req.body.email);
  const senha = req.body && req.body.senha;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  const result = await pool.query(
    'SELECT * FROM customers WHERE lower(email) = lower($1)',
    [email]
  );

  const customer = result.rows[0];

  if (!customer || !checkPassword(senha, customer.senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  await startSession(res, 'cliente', customer.id);

  res.json({
    cliente: {
      id: customer.id,
      nome: customer.nome,
      email: customer.email,
      telefone: customer.telefone,
      cpf: customer.cpf,
      foto: customer.foto,
    },
  });
}));

app.post('/api/auth/logout', asyncHandler(async function (req, res) {
  const session = await getSession(req);

  if (session) {
    await pool.query(
      'DELETE FROM sessions WHERE token = $1',
      [session.token]
    );
  }

  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/auth/me', asyncHandler(async function (req, res) {
  const session = await getSession(req);

  if (!session || session.tipo !== 'cliente') {
    return res.json({ cliente: null });
  }

  const result = await pool.query(
    `SELECT id, nome, email, telefone, cpf, foto, criado_em
     FROM customers WHERE id = $1`,
    [session.user_id]
  );

  res.json({ cliente: result.rows[0] || null });
}));

app.put('/api/auth/profile', requireCustomer, asyncHandler(async function (req, res) {
  const nome = trimOrNull(req.body && req.body.nome);
  let cpf = trimOrNull(req.body && req.body.cpf);
  if (cpf) cpf = cpf.replace(/\D/g, '');
  const telefone = trimOrNull(req.body && req.body.telefone);
  const foto = trimOrNull(req.body && req.body.foto);

  if (!nome) return res.status(400).json({ erro: 'Informe seu nome.' });

  if (cpf && cpf.length !== 11) {
    return res.status(400).json({ erro: 'O CPF precisa ter 11 dígitos.' });
  }

  const result = await pool.query(
    `UPDATE customers
     SET nome = $1, telefone = $2, cpf = $3, foto = $4
     WHERE id = $5
     RETURNING id, nome, email, telefone, cpf, foto, criado_em`,
    [nome, telefone, cpf, foto, req.customer.id]
  );

  res.json({ cliente: result.rows[0] });
}));

app.post('/api/auth/upload', requireCustomer, function (req, res) {
  const saved = saveDataUrl(req.body && req.body.dataUrl, 5 * 1024 * 1024);

  if (saved.erro) {
    return res.status(saved.status || 400).json({ erro: saved.erro });
  }

  res.status(201).json({ url: saved.url });
});

app.get('/api/auth/favorites', requireCustomer, asyncHandler(async function (req, res) {
  const result = await pool.query(
    PRODUCT_SELECT +
    ` JOIN favorites f ON f.product_id = p.id
      WHERE f.customer_id = $1 AND p.ativo = TRUE
      ORDER BY f.criado_em DESC`,
    [req.customer.id]
  );

  res.json(result.rows.map(productForStore));
}));

app.post('/api/auth/favorites/:productId', requireCustomer, asyncHandler(async function (req, res) {
  const productId = req.params.productId;

  const produto = await pool.query(
    'SELECT id FROM products WHERE id = $1',
    [productId]
  );

  if (!produto.rows[0]) {
    return res.status(404).json({ erro: 'Produto não encontrado.' });
  }

  const deleted = await pool.query(
    'DELETE FROM favorites WHERE customer_id = $1 AND product_id = $2',
    [req.customer.id, productId]
  );

  if (deleted.rowCount > 0) {
    return res.json({ favorito: false });
  }

  await pool.query(
    `INSERT INTO favorites (customer_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.customer.id, productId]
  );

  res.json({ favorito: true });
}));

app.get('/api/auth/orders', requireCustomer, asyncHandler(async function (req, res) {
  const result = await pool.query(
    'SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC',
    [req.customer.id]
  );

  res.json(
    result.rows.map(function (o) {
      return Object.assign({}, o, { itens: safeJson(o.itens, []) });
    })
  );
}));

app.post('/api/orders', requireCustomer, asyncHandler(async function (req, res) {
  const body = req.body || {};
  const itens = Array.isArray(body.itens) ? body.itens : null;

  if (!itens || !itens.length) {
    return res.status(400).json({ erro: 'O carrinho está vazio.' });
  }

  const subtotal = validNumber(body.subtotal) || 0;
  const frete = validNumber(body.frete) || 0;
  const total = validNumber(body.total) || subtotal + frete;

  const result = await pool.query(
    `INSERT INTO orders
      (customer_id, cliente_nome, cliente_email, cliente_telefone,
       itens, subtotal, frete, total, cidade, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'novo')
     RETURNING id`,
    [
      req.customer.id,
      req.customer.nome,
      req.customer.email,
      req.customer.telefone || null,
      JSON.stringify(itens),
      subtotal,
      frete,
      total,
      trimOrNull(body.cidade),
    ]
  );

  res.status(201).json({
    pedido: { id: result.rows[0].id, status: 'novo' },
  });
}));

/* ---------- admin: autenticação ---------- */

app.post('/api/admin/login', asyncHandler(async function (req, res) {
  const usuario = trimOrNull(req.body && req.body.usuario);
  const senha = req.body && req.body.senha;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  const result = await pool.query(
    'SELECT * FROM admins WHERE usuario = $1',
    [usuario]
  );

  const admin = result.rows[0];

  if (!admin || !checkPassword(senha, admin.senha)) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }

  await startSession(res, 'admin', admin.id);

  res.json({
    admin: { id: admin.id, usuario: admin.usuario, nome: admin.nome },
  });
}));

app.post('/api/admin/logout', asyncHandler(async function (req, res) {
  const session = await getSession(req);

  if (session) {
    await pool.query(
      'DELETE FROM sessions WHERE token = $1',
      [session.token]
    );
  }

  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/admin/me', asyncHandler(async function (req, res) {
  const session = await getSession(req);

  if (!session || session.tipo !== 'admin') {
    return res.json({ admin: null });
  }

  const result = await pool.query(
    'SELECT id, usuario, nome FROM admins WHERE id = $1',
    [session.user_id]
  );

  res.json({ admin: result.rows[0] || null });
}));

/* ---------- admin: produtos ---------- */

app.get('/api/admin/products', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(PRODUCT_SELECT + ' ORDER BY p.nome');
  res.json(result.rows.map(productOut));
}));

function readProductBody(body) {
  const nome = trimOrNull(body && body.nome);
  const cat = trimOrNull(body && body.cat);
  const preco = validNumber(body && body.preco);
  const de = body.de == null || body.de === '' || body.de === 0
    ? null
    : validNumber(body.de);
  const v = validNumber(body.v);
  const estoque = validNumber(body.estoque);

  if (!nome) return { erro: 'Informe o nome do produto.' };
  if (CATEGORIES.indexOf(cat) < 0) return { erro: 'Categoria inválida.' };
  if (preco == null || preco < 0) return { erro: 'Informe um preço válido.' };
  if (de != null && de <= preco) {
    return { erro: 'O preço "de" deve ser maior que o preço atual.' };
  }

  return {
    data: {
      nome: nome,
      cat: cat,
      preco: preco,
      de: de,
      v: v == null ? 0 : Math.max(0, Math.round(v)),
      art: trimOrNull(body.art) || 'kit',
      cor: trimOrNull(body.cor) || '#e2561c',
      foto: trimOrNull(body.foto),
      descricao: trimOrNull(body.descricao),
      badge: trimOrNull(body.badge),
      estoque: estoque == null ? 0 : Math.max(0, Math.round(estoque)),
      ativo: body.ativo === false || body.ativo === 0 ? false : true,
    },
  };
}

app.post('/api/admin/products', requireAdmin, asyncHandler(async function (req, res) {
  const parsed = readProductBody(req.body || {});

  if (parsed.erro) {
    return res.status(400).json({ erro: parsed.erro });
  }

  const d = parsed.data;
  let id = trimOrNull(req.body && req.body.id) || slugify(d.nome);

  if (!id) id = 'produto-' + Date.now();

  let finalId = id;
  let i = 2;

  while (true) {
    const existing = await pool.query(
      'SELECT id FROM products WHERE id = $1',
      [finalId]
    );

    if (!existing.rows[0]) break;

    finalId = id + '-' + i++;
  }

  const result = await pool.query(
    `INSERT INTO products
      (id, nome, cat, preco, de, v, art, cor, foto, descricao,
       badge, estoque, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      finalId, d.nome, d.cat, d.preco, d.de, d.v, d.art,
      d.cor, d.foto, d.descricao, d.badge, d.estoque, d.ativo,
    ]
  );

  const product = await pool.query(
    PRODUCT_SELECT + ' WHERE p.id = $1',
    [result.rows[0].id]
  );

  res.status(201).json({ produto: productOut(product.rows[0]) });
}));

app.put('/api/admin/products/:id', requireAdmin, asyncHandler(async function (req, res) {
  const current = await pool.query(
    'SELECT id FROM products WHERE id = $1',
    [req.params.id]
  );

  if (!current.rows[0]) {
    return res.status(404).json({ erro: 'Produto não encontrado.' });
  }

  const parsed = readProductBody(req.body || {});

  if (parsed.erro) {
    return res.status(400).json({ erro: parsed.erro });
  }

  const d = parsed.data;

  await pool.query(
    `UPDATE products SET
      nome = $1, cat = $2, preco = $3, de = $4, v = $5,
      art = $6, cor = $7, foto = $8, descricao = $9,
      badge = $10, estoque = $11, ativo = $12,
      atualizado_em = NOW()
     WHERE id = $13`,
    [
      d.nome, d.cat, d.preco, d.de, d.v, d.art, d.cor,
      d.foto, d.descricao, d.badge, d.estoque, d.ativo,
      req.params.id,
    ]
  );

  const product = await pool.query(
    PRODUCT_SELECT + ' WHERE p.id = $1',
    [req.params.id]
  );

  res.json({ produto: productOut(product.rows[0]) });
}));

app.delete('/api/admin/products/:id', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(
    'DELETE FROM products WHERE id = $1',
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ erro: 'Produto não encontrado.' });
  }

  res.json({ ok: true });
}));

/* ---------- admin: upload de imagem ---------- */

app.post('/api/admin/upload', requireAdmin, function (req, res) {
  const saved = saveDataUrl(req.body && req.body.dataUrl, 8 * 1024 * 1024);

  if (saved.erro) {
    return res.status(saved.status || 400).json({ erro: saved.erro });
  }

  res.status(201).json({ url: saved.url });
});

/* ---------- admin: clientes ---------- */

app.get('/api/admin/customers', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(`
    SELECT c.id, c.nome, c.email, c.telefone, c.cpf, c.foto, c.criado_em,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS pedidos,
      (SELECT COALESCE(SUM(o.total), 0)
       FROM orders o WHERE o.customer_id = c.id) AS total_gasto
    FROM customers c
    ORDER BY c.id DESC
  `);

  res.json(result.rows.map(function (customer) {
    return Object.assign({}, customer, {
      pedidos: Number(customer.pedidos),
      total_gasto: Number(customer.total_gasto),
    });
  }));
}));

app.get('/api/admin/customers/:id', requireAdmin, asyncHandler(async function (req, res) {
  const customerResult = await pool.query(
    `SELECT id, nome, email, telefone, cpf, foto, criado_em
     FROM customers WHERE id = $1`,
    [req.params.id]
  );

  const customer = customerResult.rows[0];

  if (!customer) {
    return res.status(404).json({ erro: 'Cliente não encontrado.' });
  }

  const ordersResult = await pool.query(
    'SELECT * FROM orders WHERE customer_id = $1 ORDER BY id DESC',
    [req.params.id]
  );

  const orders = ordersResult.rows.map(function (o) {
    return Object.assign({}, o, { itens: safeJson(o.itens, []) });
  });

  res.json({ cliente: customer, pedidos: orders });
}));

app.delete('/api/admin/customers/:id', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(
    'DELETE FROM customers WHERE id = $1',
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ erro: 'Cliente não encontrado.' });
  }

  res.json({ ok: true });
}));

/* ---------- admin: pedidos ---------- */

app.get('/api/admin/orders', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(
    'SELECT * FROM orders ORDER BY id DESC'
  );

  res.json(
    result.rows.map(function (o) {
      return Object.assign({}, o, { itens: safeJson(o.itens, []) });
    })
  );
}));

app.patch('/api/admin/orders/:id', requireAdmin, asyncHandler(async function (req, res) {
  const status = trimOrNull(req.body && req.body.status);

  if (ORDER_STATUS.indexOf(status) < 0) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }

  const result = await pool.query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    [status, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ erro: 'Pedido não encontrado.' });
  }

  res.json({ ok: true, status: status });
}));

/* ---------- admin: avaliações ---------- */

app.get('/api/admin/reviews', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(`
    SELECT r.*, p.nome AS produto_nome, p.foto AS produto_foto
    FROM reviews r
    LEFT JOIN products p ON p.id = r.product_id
    ORDER BY r.id DESC
  `);

  res.json(result.rows);
}));

app.delete('/api/admin/reviews/:id', requireAdmin, asyncHandler(async function (req, res) {
  const result = await pool.query(
    'DELETE FROM reviews WHERE id = $1',
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  }

  res.json({ ok: true });
}));

/* ---------- admin: configurações ---------- */

app.get('/api/admin/settings', requireAdmin, asyncHandler(async function (req, res) {
  res.json(await getSettings());
}));

app.put('/api/admin/settings', requireAdmin, asyncHandler(async function (req, res) {
  const body = req.body || {};
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
  const texto = trimOrNull(body.whatsapp_texto) || whatsapp;
  const freteJ = validNumber(body.frete_jundiai);
  const freteV = validNumber(body.frete_varzea);

  if (whatsapp.length < 10 || whatsapp.length > 15) {
    return res.status(400).json({
      erro: 'Informe o WhatsApp com código do país e DDD.',
    });
  }

  if (freteJ == null || freteJ < 0 || freteV == null || freteV < 0) {
    return res.status(400).json({
      erro: 'Informe valores de entrega válidos.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settings = [
      ['whatsapp', whatsapp],
      ['whatsapp_texto', texto],
      ['frete_jundiai', freteJ],
      ['frete_varzea', freteV],
    ];

    for (const item of settings) {
      await client.query(
        `INSERT INTO settings (chave, valor)
         VALUES ($1, $2)
         ON CONFLICT (chave)
         DO UPDATE SET valor = EXCLUDED.valor`,
        [item[0], String(item[1])]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json(await getSettings());
}));

app.post('/api/admin/password', requireAdmin, asyncHandler(async function (req, res) {
  const atual = req.body && req.body.senhaAtual;
  const nova = req.body && req.body.novaSenha;

  if (!atual || !nova) {
    return res.status(400).json({
      erro: 'Informe a senha atual e a nova senha.',
    });
  }

  if (String(nova).length < 6) {
    return res.status(400).json({
      erro: 'A nova senha precisa ter pelo menos 6 caracteres.',
    });
  }

  const result = await pool.query(
    'SELECT * FROM admins WHERE id = $1',
    [req.admin.id]
  );

  const admin = result.rows[0];

  if (!admin || !checkPassword(atual, admin.senha)) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }

  await pool.query(
    'UPDATE admins SET senha = $1 WHERE id = $2',
    [hashPassword(nova), req.admin.id]
  );

  res.json({ ok: true });
}));

/* ---------- admin: resumo ---------- */

app.get('/api/admin/stats', requireAdmin, asyncHandler(async function (req, res) {
  const totalsResult = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM products) AS produtos,
      (SELECT COUNT(*) FROM products WHERE ativo = TRUE) AS produtos_ativos,
      (SELECT COUNT(*) FROM customers) AS clientes,
      (SELECT COUNT(*) FROM orders) AS pedidos,
      (SELECT COUNT(*) FROM orders WHERE status = 'novo') AS pedidos_novos,
      (SELECT COUNT(*) FROM reviews) AS avaliacoes,
      (SELECT COALESCE(SUM(total), 0)
       FROM orders WHERE status != 'cancelado') AS receita
  `);

  const recentesResult = await pool.query(
    `SELECT id, cliente_nome, total, status, cidade, criado_em
     FROM orders ORDER BY id DESC LIMIT 8`
  );

  const baixoEstoqueResult = await pool.query(
    `SELECT id, nome, estoque FROM products
     WHERE ativo = TRUE AND estoque <= 5
     ORDER BY estoque LIMIT 8`
  );

  const totals = totalsResult.rows[0];

  res.json({
    produtos: Number(totals.produtos),
    produtosAtivos: Number(totals.produtos_ativos),
    clientes: Number(totals.clientes),
    pedidos: Number(totals.pedidos),
    pedidosNovos: Number(totals.pedidos_novos),
    avaliacoes: Number(totals.avaliacoes),
    receita: Number(totals.receita),
    recentes: recentesResult.rows.map(function (order) {
      return Object.assign({}, order, { total: Number(order.total) });
    }),
    baixoEstoque: baixoEstoqueResult.rows,
  });
}));

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

app.use(function (req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

app.use(function (err, req, res, next) {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

initializeDatabase()
  .then(function () {
    app.listen(PORT, function () {
      console.log('Voto conectado ao PostgreSQL.');
      console.log('Voto rodando em http://localhost:' + PORT);
      console.log('Painel admin: http://localhost:' + PORT + '/admin');
    });
  })
  .catch(async function (err) {
    console.error('Falha ao inicializar o banco de dados:', err.message);
    await pool.end();
    process.exit(1);
  });
