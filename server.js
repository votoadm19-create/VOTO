'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const SEED_FILE = path.join(ROOT, 'seed', 'products.json');
const PORT = Number(process.env.PORT) || 3000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'voto.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cat TEXT NOT NULL,
  preco REAL NOT NULL,
  de REAL,
  v INTEGER NOT NULL DEFAULT 0,
  art TEXT NOT NULL DEFAULT 'kit',
  cor TEXT NOT NULL DEFAULT '#e2561c',
  foto TEXT,
  descricao TEXT,
  badge TEXT,
  estoque INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  telefone TEXT,
  cpf TEXT,
  foto TEXT,
  senha TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL UNIQUE,
  nome TEXT,
  senha TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  cliente_nome TEXT,
  cliente_email TEXT,
  cliente_telefone TEXT,
  itens TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  frete REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  cidade TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_nome TEXT,
  nota INTEGER NOT NULL,
  comentario TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, customer_id),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  customer_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (customer_id, product_id),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
`);

function ensureColumn(table, column, definition) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all();
  if (!cols.some(function (c) { return c.name === column; })) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
  }
}

ensureColumn('products', 'descricao', 'TEXT');
ensureColumn('customers', 'cpf', 'TEXT');
ensureColumn('customers', 'foto', 'TEXT');

const CATEGORIES = ['kit-f', 'kit-m', 'material', 'papelaria', 'mochilas', 'fem', 'masc'];
const ORDER_STATUS = ['novo', 'confirmado', 'enviado', 'entregue', 'cancelado'];
const DEFAULT_SETTINGS = {
  whatsapp: '5511947400141',
  whatsapp_texto: '11 94740-0141',
  frete_jundiai: '10',
  frete_varzea: '15',
};

function getSettings() {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  db.prepare('SELECT chave, valor FROM settings').all().forEach(function (row) {
    out[row.chave] = row.valor;
  });
  return out;
}

function setSetting(chave, valor) {
  db.prepare(
    'INSERT INTO settings (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
  ).run(chave, String(valor));
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

function startSession(res, tipo, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  db.prepare('INSERT INTO sessions (token, tipo, user_id, expira_em) VALUES (?, ?, ?, ?)').run(
    sha256(token),
    tipo,
    userId,
    Date.now() + maxAge
  );
  res.cookie('voto_sess', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: maxAge,
    path: '/',
  });
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.voto_sess;
  if (!token) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(sha256(token));
  if (!row) return null;
  if (row.expira_em < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(row.token);
    return null;
  }
  return row;
}

function requireCustomer(req, res, next) {
  const session = getSession(req);
  if (!session || session.tipo !== 'cliente') {
    return res.status(401).json({ erro: 'Entre na sua conta para continuar.' });
  }
  const customer = db
    .prepare('SELECT id, nome, email, telefone, criado_em FROM customers WHERE id = ?')
    .get(session.user_id);
  if (!customer) {
    return res.status(401).json({ erro: 'Conta não encontrada.' });
  }
  req.customer = customer;
  next();
}

function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session || session.tipo !== 'admin') {
    return res.status(401).json({ erro: 'Acesso restrito ao administrador.' });
  }
  const admin = db
    .prepare('SELECT id, usuario, nome FROM admins WHERE id = ?')
    .get(session.user_id);
  if (!admin) {
    return res.status(401).json({ erro: 'Administrador não encontrado.' });
  }
  req.admin = admin;
  next();
}

function productOut(row) {
  return {
    id: row.id,
    nome: row.nome,
    cat: row.cat,
    preco: row.preco,
    de: row.de == null ? null : row.de,
    v: row.v,
    art: row.art,
    cor: row.cor,
    foto: row.foto || null,
    descricao: row.descricao || null,
    badge: row.badge || null,
    estoque: row.estoque,
    ativo: !!row.ativo,
    nota_media: row.nota_media == null ? null : row.nota_media,
    total_avaliacoes: row.total_avaliacoes == null ? 0 : row.total_avaliacoes,
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

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  let seed = [];
  try {
    seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch (err) {
    console.warn('Aviso: não foi possível ler seed/products.json:', err.message);
    return;
  }
  const insert = db.prepare(`
    INSERT INTO products (id, nome, cat, preco, de, v, art, cor, foto, badge, estoque, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  seed.forEach(function (p) {
    insert.run(
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
      typeof p.estoque === 'number' ? p.estoque : 50
    );
  });
  console.log('Produtos iniciais importados: ' + seed.length);
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;
  const usuario = process.env.ADMIN_USER || 'admin';
  const senha = process.env.ADMIN_PASS || 'voto123';
  db.prepare('INSERT INTO admins (usuario, nome, senha) VALUES (?, ?, ?)').run(
    usuario,
    'Administrador',
    hashPassword(senha)
  );
  console.log('Administrador criado: usuário "' + usuario + '" senha "' + senha + '"');
  if (!process.env.ADMIN_PASS) {
    console.log('Troque a senha padrão definindo ADMIN_USER e ADMIN_PASS na próxima execução limpa.');
  }
}

seedProducts();
seedAdmin();
db.prepare('DELETE FROM sessions WHERE expira_em < ?').run(Date.now());

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

app.get('/api/products', function (req, res) {
  const rows = db
    .prepare(PRODUCT_SELECT + ' WHERE p.ativo = 1 ORDER BY p.criado_em, p.nome')
    .all();
  res.json(rows.map(productForStore));
});

app.get('/api/products.js', function (req, res) {
  const rows = db
    .prepare(PRODUCT_SELECT + ' WHERE p.ativo = 1 ORDER BY p.criado_em, p.nome')
    .all();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send('window.VOTO_PRODUCTS = ' + JSON.stringify(rows.map(productForStore)) + ';');
});

app.get('/api/config.js', function (req, res) {
  const s = getSettings();
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
});

app.get('/api/products/:id/reviews', function (req, res) {
  const rows = db
    .prepare(
      'SELECT id, nota, comentario, customer_nome, criado_em FROM reviews WHERE product_id = ? ORDER BY id DESC'
    )
    .all(req.params.id);
  const media = rows.length
    ? Math.round((rows.reduce(function (a, r) { return a + r.nota; }, 0) / rows.length) * 10) / 10
    : null;
  res.json({ media: media, total: rows.length, avaliacoes: rows });
});

app.post('/api/products/:id/reviews', requireCustomer, function (req, res) {
  const produto = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const nota = Number(req.body && req.body.nota);
  const comentario = trimOrNull(req.body && req.body.comentario);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ erro: 'Escolha uma nota de 1 a 5 estrelas.' });
  }
  db.prepare(`
    INSERT INTO reviews (product_id, customer_id, customer_nome, nota, comentario)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, customer_id) DO UPDATE SET
      nota = excluded.nota, comentario = excluded.comentario, criado_em = datetime('now')
  `).run(req.params.id, req.customer.id, req.customer.nome, nota, comentario);
  res.status(201).json({ ok: true });
});

/* ---------- loja: clientes ---------- */

app.post('/api/auth/register', function (req, res) {
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
  const exists = db.prepare('SELECT id FROM customers WHERE lower(email) = lower(?)').get(email);
  if (exists) {
    return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
  }
  const info = db
    .prepare('INSERT INTO customers (nome, email, telefone, cpf, senha) VALUES (?, ?, ?, ?, ?)')
    .run(nome, email.toLowerCase(), telefone, cpf, hashPassword(senha));
  startSession(res, 'cliente', Number(info.lastInsertRowid));
  res.status(201).json({
    cliente: {
      id: Number(info.lastInsertRowid),
      nome: nome,
      email: email.toLowerCase(),
      telefone: telefone,
      cpf: cpf,
      foto: null,
    },
  });
});

app.post('/api/auth/login', function (req, res) {
  const email = trimOrNull(req.body && req.body.email);
  const senha = req.body && req.body.senha;
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }
  const customer = db
    .prepare('SELECT * FROM customers WHERE lower(email) = lower(?)')
    .get(email);
  if (!customer || !checkPassword(senha, customer.senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  startSession(res, 'cliente', customer.id);
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
});

app.post('/api/auth/logout', function (req, res) {
  const session = getSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', function (req, res) {
  const session = getSession(req);
  if (!session || session.tipo !== 'cliente') return res.json({ cliente: null });
  const customer = db
    .prepare('SELECT id, nome, email, telefone, cpf, foto, criado_em FROM customers WHERE id = ?')
    .get(session.user_id);
  res.json({ cliente: customer || null });
});

app.put('/api/auth/profile', requireCustomer, function (req, res) {
  const nome = trimOrNull(req.body && req.body.nome);
  let cpf = trimOrNull(req.body && req.body.cpf);
  if (cpf) cpf = cpf.replace(/\D/g, '');
  const telefone = trimOrNull(req.body && req.body.telefone);
  const foto = trimOrNull(req.body && req.body.foto);
  if (!nome) return res.status(400).json({ erro: 'Informe seu nome.' });
  if (cpf && cpf.length !== 11) {
    return res.status(400).json({ erro: 'O CPF precisa ter 11 dígitos.' });
  }
  db.prepare('UPDATE customers SET nome = ?, telefone = ?, cpf = ?, foto = ? WHERE id = ?').run(
    nome,
    telefone,
    cpf,
    foto,
    req.customer.id
  );
  const customer = db
    .prepare('SELECT id, nome, email, telefone, cpf, foto, criado_em FROM customers WHERE id = ?')
    .get(req.customer.id);
  res.json({ cliente: customer });
});

app.post('/api/auth/upload', requireCustomer, function (req, res) {
  const saved = saveDataUrl(req.body && req.body.dataUrl, 5 * 1024 * 1024);
  if (saved.erro) return res.status(saved.status || 400).json({ erro: saved.erro });
  res.status(201).json({ url: saved.url });
});

app.get('/api/auth/favorites', requireCustomer, function (req, res) {
  const rows = db
    .prepare(
      PRODUCT_SELECT + ' JOIN favorites f ON f.product_id = p.id WHERE f.customer_id = ? AND p.ativo = 1 ORDER BY f.criado_em DESC'
    )
    .all(req.customer.id);
  res.json(rows.map(productForStore));
});

app.post('/api/auth/favorites/:productId', requireCustomer, function (req, res) {
  const produto = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.productId);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const existing = db
    .prepare('SELECT 1 AS ok FROM favorites WHERE customer_id = ? AND product_id = ?')
    .get(req.customer.id, req.params.productId);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE customer_id = ? AND product_id = ?').run(
      req.customer.id,
      req.params.productId
    );
    return res.json({ favorito: false });
  }
  db.prepare('INSERT INTO favorites (customer_id, product_id) VALUES (?, ?)').run(
    req.customer.id,
    req.params.productId
  );
  res.json({ favorito: true });
});

app.get('/api/auth/orders', requireCustomer, function (req, res) {
  const rows = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC')
    .all(req.customer.id);
  res.json(
    rows.map(function (o) {
      return Object.assign({}, o, { itens: safeJson(o.itens, []) });
    })
  );
});

app.post('/api/orders', requireCustomer, function (req, res) {
  const body = req.body || {};
  const itens = Array.isArray(body.itens) ? body.itens : null;
  if (!itens || !itens.length) {
    return res.status(400).json({ erro: 'O carrinho está vazio.' });
  }
  const subtotal = validNumber(body.subtotal) || 0;
  const frete = validNumber(body.frete) || 0;
  const total = validNumber(body.total) || subtotal + frete;
  const info = db
    .prepare(`
      INSERT INTO orders
        (customer_id, cliente_nome, cliente_email, cliente_telefone, itens, subtotal, frete, total, cidade, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo')
    `)
    .run(
      req.customer.id,
      req.customer.nome,
      req.customer.email,
      req.customer.telefone || null,
      JSON.stringify(itens),
      subtotal,
      frete,
      total,
      trimOrNull(body.cidade)
    );
  res.status(201).json({ pedido: { id: Number(info.lastInsertRowid), status: 'novo' } });
});

/* ---------- admin: autenticação ---------- */

app.post('/api/admin/login', function (req, res) {
  const usuario = trimOrNull(req.body && req.body.usuario);
  const senha = req.body && req.body.senha;
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE usuario = ?').get(usuario);
  if (!admin || !checkPassword(senha, admin.senha)) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  }
  startSession(res, 'admin', admin.id);
  res.json({ admin: { id: admin.id, usuario: admin.usuario, nome: admin.nome } });
});

app.post('/api/admin/logout', function (req, res) {
  const session = getSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', function (req, res) {
  const session = getSession(req);
  if (!session || session.tipo !== 'admin') return res.json({ admin: null });
  const admin = db
    .prepare('SELECT id, usuario, nome FROM admins WHERE id = ?')
    .get(session.user_id);
  res.json({ admin: admin || null });
});

/* ---------- admin: produtos ---------- */

app.get('/api/admin/products', requireAdmin, function (req, res) {
  const rows = db.prepare(PRODUCT_SELECT + ' ORDER BY p.nome').all();
  res.json(rows.map(productOut));
});

function readProductBody(body) {
  const nome = trimOrNull(body && body.nome);
  const cat = trimOrNull(body && body.cat);
  const preco = validNumber(body && body.preco);
  const de = body.de == null || body.de === '' || body.de === 0 ? null : validNumber(body.de);
  const v = validNumber(body.v);
  const estoque = validNumber(body.estoque);
  if (!nome) return { erro: 'Informe o nome do produto.' };
  if (CATEGORIES.indexOf(cat) < 0) return { erro: 'Categoria inválida.' };
  if (preco == null || preco < 0) return { erro: 'Informe um preço válido.' };
  if (de != null && de <= preco) return { erro: 'O preço "de" deve ser maior que o preço atual.' };
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
      ativo: body.ativo === false || body.ativo === 0 ? 0 : 1,
    },
  };
}

app.post('/api/admin/products', requireAdmin, function (req, res) {
  const parsed = readProductBody(req.body);
  if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
  const d = parsed.data;
  let id = trimOrNull(req.body.id) || slugify(d.nome);
  if (!id) id = 'produto-' + Date.now();
  let finalId = id;
  let i = 2;
  while (db.prepare('SELECT id FROM products WHERE id = ?').get(finalId)) {
    finalId = id + '-' + i++;
  }
  db.prepare(`
    INSERT INTO products (id, nome, cat, preco, de, v, art, cor, foto, descricao, badge, estoque, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    finalId,
    d.nome,
    d.cat,
    d.preco,
    d.de,
    d.v,
    d.art,
    d.cor,
    d.foto,
    d.descricao,
    d.badge,
    d.estoque,
    d.ativo
  );
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(finalId);
  res.status(201).json({ produto: productOut(row) });
});

app.put('/api/admin/products/:id', requireAdmin, function (req, res) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const parsed = readProductBody(req.body);
  if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
  const d = parsed.data;
  db.prepare(`
    UPDATE products SET
      nome = ?, cat = ?, preco = ?, de = ?, v = ?, art = ?, cor = ?,
      foto = ?, descricao = ?, badge = ?, estoque = ?, ativo = ?, atualizado_em = datetime('now')
    WHERE id = ?
  `).run(
    d.nome,
    d.cat,
    d.preco,
    d.de,
    d.v,
    d.art,
    d.cor,
    d.foto,
    d.descricao,
    d.badge,
    d.estoque,
    d.ativo,
    req.params.id
  );
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(req.params.id);
  res.json({ produto: productOut(row) });
});

app.delete('/api/admin/products/:id', requireAdmin, function (req, res) {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Produto não encontrado.' });
  res.json({ ok: true });
});

/* ---------- admin: upload de imagem ---------- */

app.post('/api/admin/upload', requireAdmin, function (req, res) {
  const saved = saveDataUrl(req.body && req.body.dataUrl, 8 * 1024 * 1024);
  if (saved.erro) return res.status(saved.status || 400).json({ erro: saved.erro });
  res.status(201).json({ url: saved.url });
});

/* ---------- admin: clientes ---------- */

app.get('/api/admin/customers', requireAdmin, function (req, res) {
  const rows = db
    .prepare(`
      SELECT c.id, c.nome, c.email, c.telefone, c.cpf, c.foto, c.criado_em,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS pedidos,
        (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id) AS total_gasto
      FROM customers c
      ORDER BY c.id DESC
    `)
    .all();
  res.json(rows);
});

app.get('/api/admin/customers/:id', requireAdmin, function (req, res) {
  const customer = db
    .prepare('SELECT id, nome, email, telefone, cpf, foto, criado_em FROM customers WHERE id = ?')
    .get(req.params.id);
  if (!customer) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  const orders = db
    .prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC')
    .all(req.params.id)
    .map(function (o) {
      return Object.assign({}, o, { itens: safeJson(o.itens, []) });
    });
  res.json({ cliente: customer, pedidos: orders });
});

app.delete('/api/admin/customers/:id', requireAdmin, function (req, res) {
  const info = db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  res.json({ ok: true });
});

/* ---------- admin: pedidos ---------- */

app.get('/api/admin/orders', requireAdmin, function (req, res) {
  const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json(
    rows.map(function (o) {
      return Object.assign({}, o, { itens: safeJson(o.itens, []) });
    })
  );
});

app.patch('/api/admin/orders/:id', requireAdmin, function (req, res) {
  const status = trimOrNull(req.body && req.body.status);
  if (ORDER_STATUS.indexOf(status) < 0) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json({ ok: true, status: status });
});

/* ---------- admin: avaliações ---------- */

app.get('/api/admin/reviews', requireAdmin, function (req, res) {
  const rows = db
    .prepare(`
      SELECT r.*, p.nome AS produto_nome, p.foto AS produto_foto
      FROM reviews r
      LEFT JOIN products p ON p.id = r.product_id
      ORDER BY r.id DESC
    `)
    .all();
  res.json(rows);
});

app.delete('/api/admin/reviews/:id', requireAdmin, function (req, res) {
  const info = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Avaliação não encontrada.' });
  res.json({ ok: true });
});

/* ---------- admin: configurações ---------- */

app.get('/api/admin/settings', requireAdmin, function (req, res) {
  res.json(getSettings());
});

app.put('/api/admin/settings', requireAdmin, function (req, res) {
  const body = req.body || {};
  const whatsapp = String(body.whatsapp || '').replace(/\D/g, '');
  const texto = trimOrNull(body.whatsapp_texto) || whatsapp;
  const freteJ = validNumber(body.frete_jundiai);
  const freteV = validNumber(body.frete_varzea);
  if (whatsapp.length < 10 || whatsapp.length > 15) {
    return res.status(400).json({ erro: 'Informe o WhatsApp com código do país e DDD.' });
  }
  if (freteJ == null || freteJ < 0 || freteV == null || freteV < 0) {
    return res.status(400).json({ erro: 'Informe valores de entrega válidos.' });
  }
  setSetting('whatsapp', whatsapp);
  setSetting('whatsapp_texto', texto);
  setSetting('frete_jundiai', freteJ);
  setSetting('frete_varzea', freteV);
  res.json(getSettings());
});

app.post('/api/admin/password', requireAdmin, function (req, res) {
  const atual = req.body && req.body.senhaAtual;
  const nova = req.body && req.body.novaSenha;
  if (!atual || !nova) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  }
  if (String(nova).length < 6) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!checkPassword(atual, admin.senha)) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }
  db.prepare('UPDATE admins SET senha = ? WHERE id = ?').run(hashPassword(nova), req.admin.id);
  res.json({ ok: true });
});

/* ---------- admin: resumo ---------- */

app.get('/api/admin/stats', requireAdmin, function (req, res) {
  const totals = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM products) AS produtos,
        (SELECT COUNT(*) FROM products WHERE ativo = 1) AS produtos_ativos,
        (SELECT COUNT(*) FROM customers) AS clientes,
        (SELECT COUNT(*) FROM orders) AS pedidos,
        (SELECT COUNT(*) FROM orders WHERE status = 'novo') AS pedidos_novos,
        (SELECT COUNT(*) FROM reviews) AS avaliacoes,
        (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelado') AS receita
    `)
    .get();
  const recentes = db
    .prepare('SELECT id, cliente_nome, total, status, cidade, criado_em FROM orders ORDER BY id DESC LIMIT 8')
    .all();
  const baixoEstoque = db
    .prepare('SELECT id, nome, estoque FROM products WHERE ativo = 1 AND estoque <= 5 ORDER BY estoque LIMIT 8')
    .all();
  res.json({
    produtos: totals.produtos,
    produtosAtivos: totals.produtos_ativos,
    clientes: totals.clientes,
    pedidos: totals.pedidos,
    pedidosNovos: totals.pedidos_novos,
    avaliacoes: totals.avaliacoes,
    receita: totals.receita,
    recentes: recentes,
    baixoEstoque: baixoEstoque,
  });
});

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

app.listen(PORT, function () {
  console.log('Voto rodando em http://localhost:' + PORT);
  console.log('Painel admin: http://localhost:' + PORT + '/admin');
});
