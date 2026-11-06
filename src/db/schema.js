'use strict';

const { db } = require('./sqlite');

function initSchema() {
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

CREATE TABLE IF NOT EXISTS coupons (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'promo',
  nome TEXT NOT NULL,
  email TEXT,
  cidade TEXT,
  pix_chave TEXT,
  pix_tipo TEXT,
  desconto REAL NOT NULL DEFAULT 0,
  credito REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS influencers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha TEXT NOT NULL,
  telefone TEXT,
  cpf TEXT,
  cidade TEXT,
  rede TEXT,
  usuario_rede TEXT,
  seguidores TEXT,
  pix_tipo TEXT,
  pix_chave TEXT,
  coupon_code TEXT REFERENCES coupons(code) ON DELETE SET NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  influencer_id INTEGER NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  valor REAL NOT NULL DEFAULT 0,
  pago_em TEXT NOT NULL DEFAULT (datetime('now')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  cmv REAL NOT NULL DEFAULT 50,
  entrega_pct REAL NOT NULL DEFAULT 8,
  imposto_pct REAL NOT NULL DEFAULT 6,
  fixo REAL NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hub_cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  cidade TEXT NOT NULL,
  taxa REAL NOT NULL DEFAULT 0,
  UNIQUE (hub_id, cidade)
);

CREATE TABLE IF NOT EXISTS hub_stock (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  hub_id INTEGER NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  qtd INTEGER NOT NULL DEFAULT 0,
  custo REAL,
  minimo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, hub_id)
);

CREATE TABLE IF NOT EXISTS perso_niveis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  preco REAL NOT NULL DEFAULT 0
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
ensureColumn('admins', 'papel', "TEXT NOT NULL DEFAULT 'admin'");
ensureColumn('orders', 'coupon_code', 'TEXT');
ensureColumn('orders', 'desconto', 'REAL NOT NULL DEFAULT 0');
ensureColumn('orders', 'credito', 'REAL NOT NULL DEFAULT 0');
ensureColumn('orders', 'credito_status', 'TEXT');
ensureColumn('orders', 'hub_id', 'INTEGER');
ensureColumn('orders', 'op_status', 'TEXT');
ensureColumn('orders', 'perso_json', 'TEXT');
}

module.exports = { initSchema };
