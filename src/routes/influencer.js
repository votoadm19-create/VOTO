'use strict';
const { db } = require('../db/sqlite');
const { requireInfluenciador } = require('../lib/auth');
const { getSession } = require('../lib/auth');
const { startSession } = require('../lib/auth');
const { checkPassword } = require('../lib/auth');
const { hashPassword } = require('../lib/auth');
const { loginLimiter, registerLimiter } = require('../lib/rateLimit');
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
    status: row.status || 'pendente',
    criadoEm: row.criado_em || '',
  };
}

const PIX_TIPOS = ['cpf', 'email', 'telefone', 'aleatoria'];

app.post('/api/influenciador/register', registerLimiter, function (req, res) {
  const body = req.body || {};
  const nome = trimOrNull(body.nome);
  const email = trimOrNull(body.email);
  const senha = body.senha;
  const telefone = trimOrNull(body.telefone);
  let cpf = trimOrNull(body.cpf);
  if (cpf) cpf = cpf.replace(/\D/g, '');
  const cidade = trimOrNull(body.cidade);
  const rede = trimOrNull(body.rede);
  const usuario = trimOrNull(body.usuario);
  const seg = trimOrNull(body.seg);
  const pixTipo = trimOrNull(body.pixTipo);
  const pixChave = trimOrNull(body.pixChave);
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Preencha nome, e-mail e senha.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ erro: 'Informe um e-mail válido.' });
  }
  if (String(senha).length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }
  if (cpf && cpf.length !== 11) {
    return res.status(400).json({ erro: 'O CPF precisa ter 11 dígitos.' });
  }
  if (pixTipo && PIX_TIPOS.indexOf(pixTipo) < 0) {
    return res.status(400).json({ erro: 'Tipo de chave Pix inválido.' });
  }
  const exists = db.prepare('SELECT id FROM influencers WHERE lower(email) = lower(?)').get(email);
  if (exists) {
    return res.status(409).json({ erro: 'Este e-mail já tem um cadastro de influenciador.' });
  }
  if (cpf) {
    const cpfExists = db.prepare('SELECT id FROM influencers WHERE cpf = ?').get(cpf);
    if (cpfExists) {
      return res.status(409).json({ erro: 'Este CPF já tem um cadastro de influenciador.' });
    }
  }
  const info = db
    .prepare(
      'INSERT INTO influencers (nome, email, senha, telefone, cpf, cidade, rede, usuario_rede, seguidores, pix_tipo, pix_chave, coupon_code, ativo, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, \'pendente\')'
    )
    .run(nome, email.toLowerCase(), hashPassword(String(senha)), telefone, cpf, cidade, rede, usuario, seg, pixTipo, pixChave);
  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    status: 'pendente',
    mensagem: 'Cadastro enviado! A equipe Voto vai analisar e, se aprovado, ativar o seu acesso.',
  });
});

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

app.post('/api/influenciador/login', loginLimiter, function (req, res) {
  const email = trimOrNull(req.body && req.body.email);
  const senha = req.body && req.body.senha;
  if (!email || !senha) return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  const inf = db.prepare('SELECT * FROM influencers WHERE lower(email) = lower(?)').get(email);
  if (!inf || !checkPassword(senha, inf.senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }
  const status = inf.status || 'pendente';
  if (status !== 'ativo') {
    const msg =
      status === 'pendente'
        ? 'Seu cadastro está em análise. Aguarde a aprovação da equipe Voto.'
        : status === 'rejeitado'
          ? 'Este cadastro não foi aprovado. Fale com a equipe Voto para mais informações.'
          : 'Seu acesso ao portal está pausado. Fale com a equipe Voto.';
    return res.status(403).json({ erro: msg });
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
      'SELECT id, nome, email, telefone, cpf, cidade, rede, usuario_rede, seguidores, pix_tipo, pix_chave, coupon_code, ativo, status, criado_em FROM influencers WHERE id = ?'
    )
    .get(session.user_id);
  const liberado =
    Boolean(inf) && inf.ativo === 1 && (inf.status || 'ativo') === 'ativo';
  res.json({
    influenciador: liberado ? influencerOut(inf) : null,
    dados: liberado ? influencerDashboard(inf) : null,
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
