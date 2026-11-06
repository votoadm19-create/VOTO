'use strict';

const crypto = require('crypto');
const { db } = require('../db/sqlite');

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

function equipeRow(session) {
  if (!session || session.tipo !== 'admin') return null;
  return (
    db
      .prepare('SELECT id, usuario, nome, papel FROM admins WHERE id = ?')
      .get(session.user_id) || null
  );
}

function requireAdmin(req, res, next) {
  const row = equipeRow(getSession(req));
  if (!row) {
    return res.status(401).json({ erro: 'Acesso restrito ao administrador.' });
  }
  if (row.papel !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  req.admin = row;
  next();
}

function requireEquipe(req, res, next) {
  const row = equipeRow(getSession(req));
  if (!row) {
    return res.status(401).json({ erro: 'Entre com a sua conta da equipe.' });
  }
  req.equipe = row;
  next();
}

function requireInfluenciador(req, res, next) {
  const session = getSession(req);
  if (!session || session.tipo !== 'influenciador') {
    return res.status(401).json({ erro: 'Entre na sua conta de influenciador.' });
  }
  const inf = db
    .prepare(
      'SELECT id, nome, email, telefone, cpf, cidade, rede, usuario_rede, seguidores, pix_tipo, pix_chave, coupon_code, ativo FROM influencers WHERE id = ?'
    )
    .get(session.user_id);
  if (!inf || inf.ativo !== 1) {
    return res.status(401).json({ erro: 'Conta de influenciador não encontrada.' });
  }
  req.influenciador = inf;
  next();
}

module.exports = {
  hashPassword,
  checkPassword,
  sha256,
  parseCookies,
  startSession,
  getSession,
  equipeRow,
  requireCustomer,
  requireAdmin,
  requireEquipe,
  requireInfluenciador,
};
