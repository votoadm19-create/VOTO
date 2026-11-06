'use strict';
const { db } = require('../db/sqlite');
const { requireAdmin } = require('../lib/auth');
const { hashPassword } = require('../lib/auth');
const { setSetting } = require('../lib/domain');
const { couponRules } = require('../lib/domain');
const { findCoupon } = require('../lib/domain');
const { couponOut } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { slugify } = require('../lib/util');
const { validNumber } = require('../lib/util');
const { safeJson } = require('../lib/util');
const path = require('path');
const { ROOT } = require('../config');

function register(app) {
app.get('/cupons', function (req, res) {
  res.sendFile(path.join(ROOT, 'public', 'cupons', 'index.html'));
});

/* ---------- cupons públicos ---------- */

app.get('/api/coupons', function (req, res) {
  const rows = db
    .prepare(
      "SELECT code, kind, nome, desconto FROM coupons WHERE ativo = 1 AND kind = 'promo' ORDER BY nome"
    )
    .all();
  res.json(
    rows.map(function (r) {
      return { code: r.code, name: r.nome, disc: Number(r.desconto) || 0 };
    })
  );
});

app.get('/api/coupons/preview', function (req, res) {
  const coupon = findCoupon(req.query.code);
  const subtotal = validNumber(req.query.subtotal) || 0;
  if (!coupon || coupon.ativo !== 1) {
    return res.status(404).json({ erro: 'Cupom inválido ou pausado.' });
  }
  const desconto = Math.round(subtotal * (Number(coupon.desconto) || 0) * 100) / 100;
  res.json({
    code: coupon.code,
    name: coupon.nome,
    kind: coupon.kind,
    disc: Number(coupon.desconto) || 0,
    desconto: desconto,
    subtotal: subtotal,
    total: Math.round((subtotal - desconto) * 100) / 100,
  });
});

/* ---------- admin: cupons e influenciadores ---------- */

function couponOrdersOut() {
  return db
    .prepare('SELECT * FROM orders WHERE coupon_code IS NOT NULL ORDER BY id DESC')
    .all()
    .map(function (o) {
      const itens = safeJson(o.itens, []);
      const itemTxt = itens.length
        ? itens.map(function (i) { return (i.qtd || 1) + 'x ' + (i.nome || 'item'); }).join(', ')
        : 'Pedido';
      const d = o.criado_em ? String(o.criado_em).slice(5, 10) : '';
      const [mm, dd] = d.split('-');
      return {
        id: o.id,
        c: o.coupon_code,
        item: itemTxt,
        sub: Number(o.subtotal) || 0,
        s: o.credito_status || o.status || 'aguardando',
        d: dd + '/' + mm,
        cu: o.cliente_nome || 'Cliente',
      };
    });
}

app.get('/api/admin/coupons-painel', requireAdmin, function (req, res) {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY criado_em DESC').all().map(couponOut);
  const pays = {};
  db.prepare('SELECT influencer_id, COALESCE(SUM(valor), 0) AS total FROM payments GROUP BY influencer_id')
    .all()
    .forEach(function (r) {
      pays[r.influencer_id] = Number(r.total) || 0;
    });
  const infPays = db
    .prepare('SELECT i.coupon_code, COALESCE(SUM(p.valor), 0) AS total FROM payments p JOIN influencers i ON i.id = p.influencer_id GROUP BY i.coupon_code')
    .all();
  const pagoPorCoupon = {};
  infPays.forEach(function (r) {
    pagoPorCoupon[r.coupon_code] = Number(r.total) || 0;
  });
  const payments = db
    .prepare(
      'SELECT p.pago_em, p.valor, i.coupon_code AS code FROM payments p JOIN influencers i ON i.id = p.influencer_id ORDER BY p.id DESC'
    )
    .all()
    .map(function (p) {
      const [yy, mm, dd] = String(p.pago_em || '').slice(0, 10).split('-');
      return {
        d: dd + '/' + mm + '/' + yy,
        code: p.code,
        amt: Number(p.valor) || 0,
        n: '',
      };
    });
  res.json({
    coupons: coupons,
    orders: couponOrdersOut(),
    rules: couponRules(),
    pagoPorCoupon: pagoPorCoupon,
    pays: pays,
    payments: payments,
  });
});

function couponBody(body) {
  const kind = body && body.kind === 'inf' ? 'inf' : 'promo';
  const nome = trimOrNull(body && body.nome);
  const desconto = validNumber(body && (body.desconto != null ? body.desconto : body.disc));
  const credito = validNumber(body && (body.credito != null ? body.credito : body.credit));
  if (!nome) return { erro: 'Informe o nome do cupom/promocional.' };
  if (desconto == null || desconto < 0 || desconto > 0.9) return { erro: 'Desconto inválido (0 a 90%).' };
  if (credito == null || credito < 0 || credito > 0.5) return { erro: 'Crédito inválido (0 a 50%).' };
  return {
    data: {
      kind: kind,
      nome: nome,
      email: trimOrNull(body && body.email),
      cidade: trimOrNull(body && (body.cidade != null ? body.cidade : body.city)),
      pix: trimOrNull(body && (body.pix_chave != null ? body.pix_chave : body.pix)),
      pixTipo: trimOrNull(body && (body.pix_tipo != null ? body.pix_tipo : body.pixTipo)),
      desconto: desconto,
      credito: kind === 'inf' ? credito : 0,
      ativa: body && (body.ativo === false || body.on === false) ? 0 : 1,
    },
  };
}

app.post('/api/admin/coupons', requireAdmin, function (req, res) {
  const parsed = couponBody(req.body);
  if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
  const d = parsed.data;
  let code = trimOrNull(req.body && req.body.code);
  if (!code) {
    const base = slugify(d.nome).replace(/-/g, '').toUpperCase().slice(0, 8) || 'CUPOM';
    code = base + Math.floor(10 + Math.random() * 90);
  }
  code = code.toUpperCase();
  if (findCoupon(code)) return res.status(409).json({ erro: 'Este código de cupom já existe.' });
  let senhaGerada = null;
  db.prepare(
    'INSERT INTO coupons (code, kind, nome, email, cidade, pix_chave, pix_tipo, desconto, credito, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(code, d.kind, d.nome, d.email, d.cidade, d.pix, d.pixTipo, d.desconto, d.credito, d.ativa);
  if (d.kind === 'inf' && d.email) {
    const senha = trimOrNull(req.body && (req.body.senha || req.body.pass));
    if (!senha || String(senha).length < 8) {
      return res.status(400).json({ erro: 'Para influenciador, informe a senha de acesso (mínimo 8 caracteres).' });
    }
    const exists = db.prepare('SELECT id FROM influencers WHERE lower(email) = lower(?)').get(d.email);
    if (exists) {
      db.prepare('UPDATE influencers SET senha = ?, coupon_code = ?, ativo = 1 WHERE id = ?')
        .run(hashPassword(String(senha)), code, exists.id);
    } else {
      db.prepare(
        'INSERT INTO influencers (nome, email, senha, telefone, cidade, pix_tipo, pix_chave, coupon_code, ativo) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1)'
      ).run(d.nome, d.email, hashPassword(String(senha)), d.cidade, d.pixTipo, d.pix, code);
    }
  }
  const row = findCoupon(code);
  res.status(201).json({ cupom: couponOut(row) });
});

app.put('/api/admin/coupons/:code', requireAdmin, function (req, res) {
  const atual = findCoupon(req.params.code);
  if (!atual) return res.status(404).json({ erro: 'Cupom não encontrado.' });
  const parsed = couponBody(req.body);
  if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
  const d = parsed.data;
  db.prepare(
    'UPDATE coupons SET kind = ?, nome = ?, email = ?, cidade = ?, pix_chave = ?, pix_tipo = ?, desconto = ?, credito = ?, ativo = ? WHERE code = ?'
  ).run(d.kind, d.nome, d.email, d.cidade, d.pix, d.pixTipo, d.desconto, d.credito, d.ativa, atual.code);
  res.json({ cupom: couponOut(findCoupon(atual.code)) });
});

app.delete('/api/admin/coupons/:code', requireAdmin, function (req, res) {
  const atual = findCoupon(req.params.code);
  if (!atual) return res.status(404).json({ erro: 'Cupom não encontrado.' });
  db.prepare('UPDATE coupons SET ativo = 0 WHERE code = ?').run(atual.code);
  res.json({ ok: true });
});

app.post('/api/admin/coupons/:code/reset-senha', requireAdmin, function (req, res) {
  const coupon = findCoupon(req.params.code);
  if (!coupon || coupon.kind !== 'inf') {
    return res.status(404).json({ erro: 'Cupom de influenciador não encontrado.' });
  }
  const senha = trimOrNull(req.body && req.body.senha);
  if (!senha || String(senha).length < 8) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }
  const inf = db.prepare('SELECT * FROM influencers WHERE coupon_code = ?').get(coupon.code);
  if (!inf) return res.status(404).json({ erro: 'Influenciador não encontrado.' });
  db.prepare('UPDATE influencers SET senha = ?, ativo = 1 WHERE id = ?').run(
    hashPassword(String(senha)),
    inf.id
  );
  res.json({ ok: true });
});

app.put('/api/admin/coupon-rules', requireAdmin, function (req, res) {
  const body = req.body || {};
  const meta = validNumber(body.meta != null ? body.meta : body.goal);
  const carencia = validNumber(body.carencia != null ? body.carencia : body.hold);
  const dia = validNumber(body.diaPagamento != null ? body.diaPagamento : body.payDay);
  const credito = validNumber(body.creditoPadrao != null ? body.creditoPadrao : body.credit);
  const desconto = validNumber(body.descontoPadrao != null ? body.descontoPadrao : body.disc);
  if (meta == null || meta < 0) return res.status(400).json({ erro: 'Meta inválida.' });
  if (carencia == null || carencia < 0) return res.status(400).json({ erro: 'Carência inválida.' });
  if (dia == null || dia < 1 || dia > 31) return res.status(400).json({ erro: 'Dia de pagamento inválido (1 a 31).' });
  setSetting('cupom_meta', meta);
  setSetting('cupom_carencia', carencia);
  setSetting('cupom_dia_pagamento', dia);
  if (credito != null) setSetting('cupom_credito_padrao', credito);
  if (desconto != null) setSetting('cupom_desconto_padrao', desconto);
  if (body.portalUrl != null || body.portal != null) {
    setSetting('cupom_portal_url', trimOrNull(body.portalUrl != null ? body.portalUrl : body.portal) || '');
  }
  res.json({ rules: couponRules() });
});

const CREDITO_NEXT = { aguardando: 'entrega', entrega: 'carencia', carencia: 'liberada' };

app.patch('/api/admin/coupon-orders/:id', requireAdmin, function (req, res) {
  const acao = trimOrNull(req.body && req.body.acao);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  let novo = null;
  if (acao === 'pay' && order.credito_status === 'aguardando') novo = 'entrega';
  else if (acao === 'deliver' && order.credito_status === 'entrega') novo = 'carencia';
  else if (acao === 'release' && order.credito_status === 'carencia') novo = 'liberada';
  else if (acao === 'cancel') novo = 'cancelado';
  else return res.status(400).json({ erro: 'Transição inválida para o estado atual.' });
  db.prepare('UPDATE orders SET credito_status = ?, status = ? WHERE id = ?').run(
    novo,
    novo === 'cancelado' ? 'cancelado' : order.status,
    req.params.id
  );
  res.json({ ok: true, status: novo });
});

app.post('/api/admin/coupon-pay', requireAdmin, function (req, res) {
  const code = trimOrNull(req.body && req.body.code);
  const coupon = findCoupon(code);
  if (!coupon || coupon.kind !== 'inf') {
    return res.status(404).json({ erro: 'Cupom de influenciador não encontrado.' });
  }
  const inf = db.prepare('SELECT * FROM influencers WHERE coupon_code = ?').get(coupon.code);
  if (!inf) return res.status(404).json({ erro: 'Influenciador não encontrado.' });
  const liberadas = db
    .prepare("SELECT COALESCE(SUM(credito), 0) AS total FROM orders WHERE coupon_code = ? AND credito_status = 'liberada'")
    .get(coupon.code);
  const valor = Number(liberadas.total) || 0;
  if (valor <= 0) return res.status(400).json({ erro: 'Sem crédito liberado para pagar.' });
  db.prepare('INSERT INTO payments (influencer_id, valor) VALUES (?, ?)').run(inf.id, valor);
  db.prepare("UPDATE orders SET credito_status = 'paga' WHERE coupon_code = ? AND credito_status = 'liberada'")
    .run(coupon.code);
  res.json({ ok: true, valor: valor });
});
}

module.exports = { register };
