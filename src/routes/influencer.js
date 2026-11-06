'use strict';
const { db } = require('../db/sqlite');
const { requireInfluenciador } = require('../lib/auth');
const { getSession } = require('../lib/auth');
const { startSession } = require('../lib/auth');
const { checkPassword } = require('../lib/auth');
const { couponRules } = require('../lib/domain');
const { findCoupon } = require('../lib/domain');
const { couponOut } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { safeJson } = require('../lib/util');
const path = require('path');
const { ROOT } = require('../config');

function register(app) {
app.get('/influenciador', function (req, res) {
  res.sendFile(path.join(ROOT, 'public', 'influenciador', 'index.html'));
});

/* ---------- influenciador: portal ---------- */

function influencerOut(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone || '',
    cpf: row.cpf || '',
    cidade: row.cidade || '',
    rede: row.rede || '',
    usuario: row.usuario_rede || '',
    seg: row.seguidores || '',
    pixTipo: row.pix_tipo || '',
    pixChave: row.pix_chave || '',
    code: row.coupon_code || '',
  };
}

function influencerDashboard(inf) {
  const coupon = inf.coupon_code ? findCoupon(inf.coupon_code) : null;
  const orders = inf.coupon_code
    ? db
        .prepare('SELECT * FROM orders WHERE coupon_code = ? ORDER BY id DESC')
        .all(inf.coupon_code)
        .map(function (o) {
          const itens = safeJson(o.itens, []);
          const itemTxt = itens.length
            ? itens.map(function (i) { return (i.qtd || 1) + 'x ' + (i.nome || 'item'); }).join(', ')
            : 'Pedido';
          return {
            id: o.id,
            item: itemTxt,
            sub: Number(o.subtotal) || 0,
            s: o.credito_status || 'aguardando',
            d: o.criado_em ? String(o.criado_em).slice(5, 10) : '',
          };
        })
    : [];
  const pays = db
    .prepare('SELECT pago_em, valor FROM payments WHERE influencer_id = ? ORDER BY id DESC')
    .all(inf.id)
    .map(function (p) {
      return { d: String(p.pago_em || '').slice(0, 10), n: Number(p.valor) || 0 };
    });
  return {
    coupon: coupon ? couponOut(coupon) : null,
    orders: orders,
    pays: pays,
    rules: couponRules(),
  };
}

app.post('/api/influenciador/login', function (req, res) {
  const email = trimOrNull(req.body && req.body.email);
  const senha = req.body && req.body.senha;
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const inf = db.prepare('SELECT * FROM influencers WHERE lower(email) = lower(?)').get(email);
  if (!inf || inf.ativo !== 1 || !checkPassword(senha, inf.senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  startSession(res, 'influenciador', inf.id);
  res.json({ influenciador: influencerOut(inf) });
});

app.post('/api/influenciador/logout', function (req, res) {
  const session = getSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/influenciador/me', function (req, res) {
  const session = getSession(req);
  if (!session || session.tipo !== 'influenciador') return res.json({ influenciador: null });
  const inf = db
    .prepare(
      'SELECT id, nome, email, telefone, cpf, cidade, rede, usuario_rede, seguidores, pix_tipo, pix_chave, coupon_code, ativo FROM influencers WHERE id = ?'
    )
    .get(session.user_id);
  res.json({
    influenciador: inf && inf.ativo === 1 ? influencerOut(inf) : null,
    dados: inf && inf.ativo === 1 ? influencerDashboard(inf) : null,
  });
});

app.put('/api/influenciador/profile', requireInfluenciador, function (req, res) {
  const body = req.body || {};
  const nome = trimOrNull(body.nome);
  if (!nome) return res.status(400).json({ erro: 'Informe seu nome.' });
  db.prepare(
    'UPDATE influencers SET nome = ?, telefone = ?, cidade = ?, rede = ?, usuario_rede = ?, seguidores = ?, pix_tipo = ?, pix_chave = ? WHERE id = ?'
  ).run(
    nome,
    trimOrNull(body.telefone),
    trimOrNull(body.cidade),
    trimOrNull(body.rede),
    trimOrNull(body.usuario),
    trimOrNull(body.seg),
    trimOrNull(body.pixTipo),
    trimOrNull(body.pixChave),
    req.influenciador.id
  );
  const inf = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.influenciador.id);
  res.json({ influenciador: influencerOut(inf) });
});
}

module.exports = { register };
