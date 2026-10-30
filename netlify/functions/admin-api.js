const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

// Setup directories (igual ao server.js original)
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Initialize database
const db = new DatabaseSync(path.join(DATA_DIR, 'voto.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Create tables (idempotent - safe to run always)
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

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  expira_em INTEGER NOT NULL
);
`);

// Ensure admin exists
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;
  const usuario = process.env.ADMIN_USER || 'admin';
  const senha = process.env.ADMIN_PASS || 'voto123';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), salt, 64).toString('hex');
  db.prepare('INSERT INTO admins (usuario, nome, senha) VALUES (?, ?, ?)').run(usuario, 'Administrador', salt + ':' + hash);
  console.log('Admin ensured: usuario "' + usuario + '"');
}
ensureAdmin();

// Helper functions (do server.js original)
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

// API handler - receives event with url, method, headers, body
exports.handler = async (event) => {
  try {
    const url = new URL(event.url || `https://${event.headers.host}${event.path}`);
    const path = url.pathname;
    const method = event.method || 'GET';
    const headers = event.headers || {};
    const cookies = headers.cookie || '';
    const cookieParsed = parseCookies(cookies);
    
    // Get session token from cookie
    function getToken() {
      if (cookieParsed.voto_sess) return cookieParsed.voto_sess;
      if (url.searchParams.get('token')) return url.searchParams.get('token');
      return null;
    }
    
    function getSession(token) {
      if (!token) return null;
      const row = db.prepare('SELECT * FROM sessions WHERE token = ?').get(sha256(token));
      if (!row) return null;
      if (row.expira_em < Date.now()) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(row.token);
        return null;
      }
      return row;
    }

    // --- ROTAS ADMIN ---

    // POST /api/admin/login
    if (path === '/api/admin/login' && method === 'POST') {
      let body = {};
      try { body = JSON.parse(event.body); } catch (e) {}
      
      const usuario = body.usuario || (process.env.ADMIN_USER || 'admin');
      const senha = body.senha || (process.env.ADMIN_PASS || 'voto123');
      
      if (!usuario || !senha) {
        return { statusCode: 400, body: JSON.stringify({ erro: 'Informe usuário e senha.' }) };
      }
      
      const admin = db.prepare('SELECT * FROM admins WHERE usuario = ?').get(usuario);
      if (!admin || !checkPassword(senha, admin.senha)) {
        return { statusCode: 401, body: JSON.stringify({ erro: 'Usuário ou senha incorretos.' }) };
      }
      
      // Create session
      const token = crypto.randomBytes(32).toString('hex');
      const maxAge = 7 * 24 * 60 * 60 * 1000;
      db.prepare('INSERT INTO sessions (token, tipo, user_id, expira_em) VALUES (?, ?, ?, ?)').run(
        sha256(token),
        'admin',
        admin.id,
        Date.now() + maxAge
      );
      
      return {
        statusCode: 200,
        headers: {
          'Set-Cookie': `voto_sess=${token}; Path=/; HttpOnly; SameSite=Lax`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          admin: { id: admin.id, usuario: admin.usuario, nome: admin.nome },
          token 
        )
      };
    }

    // GET /api/admin/me
    if (path === '/api/admin/me') {
      const token = getToken();
      const session = getSession(token);
      if (!session) {
        return { statusCode: 401, body: JSON.stringify({ admin: null }) };
      }
      const admin = db.prepare('SELECT id, usuario, nome FROM admins WHERE id = ?').get(session.user_id);
      return { statusCode: 200, body: JSON.stringify({ admin: admin || null }) };
    }

    // POST /api/admin/logout
    if (path === '/api/admin/logout') {
      const token = getToken();
      if (token) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(sha256(token));
      }
      return {
        statusCode: 200,
        headers: {
          'Set-Cookie': `voto_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ok: true })
      };
    }

    // --- Se nao for rota admin, retornar 404 ---
    return { statusCode: 404, body: JSON.stringify({ erro: 'Rota não encontrada' }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ erro: e.message }) };
  }
};