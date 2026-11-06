'use strict';
const { db } = require('../db/sqlite');
const { requireCustomer } = require('../lib/auth');
const { getSession } = require('../lib/auth');
const { startSession } = require('../lib/auth');
const { hashPassword } = require('../lib/auth');
const { checkPassword } = require('../lib/auth');
const { PRODUCT_SELECT } = require('../lib/domain');
const { productForStore } = require('../lib/domain');
const { findCoupon } = require('../lib/domain');
const { couponCheck } = require('../lib/domain');
const { loginLimiter, registerLimiter } = require('../lib/rateLimit');
const { hubForCidade } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { validNumber } = require('../lib/util');
const { safeJson } = require('../lib/util');
const { saveDataUrl } = require('../lib/util');

function register(app) {
/* ---------- loja: clientes ---------- */

app.post('/api/auth/register', registerLimiter, function (req, res) {
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

app.post('/api/auth/login', loginLimiter, function (req, res) {
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
  let couponCode = null;
  let desconto = 0;
  let credito = 0;
  let creditoStatus = null;
  if (body.cupom) {
    const coupon = findCoupon(body.cupom);
    const couponErr = couponCheck(coupon, subtotal);
    if (couponErr) {
      return res.status(400).json({ erro: couponErr });
    }
    couponCode = coupon.code;
    desconto = Math.round(subtotal * (Number(coupon.desconto) || 0) * 100) / 100;
    credito =
      coupon.kind === 'inf'
        ? Math.round((subtotal - desconto) * (Number(coupon.credito) || 0) * 100) / 100
        : 0;
    creditoStatus = 'aguardando';
  }
  const cidade = trimOrNull(body.cidade);
  const hub = hubForCidade(cidade);
  const opStatus = hub ? 'novo' : null;
  const total =
    Math.round((subtotal - desconto + frete) * 100) / 100;
  const info = db
    .prepare(`
      INSERT INTO orders
        (customer_id, cliente_nome, cliente_email, cliente_telefone, itens, subtotal, frete, total, cidade, status, coupon_code, desconto, credito, credito_status, hub_id, op_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'novo', ?, ?, ?, ?, ?, ?)
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
      cidade,
      couponCode,
      desconto,
      credito,
      creditoStatus,
      hub ? hub.id : null,
      opStatus
    );
  itens.forEach(function (it) {
    const pid = it.pid || null;
    const qtd = validNumber(it.qtd) || 0;
    if (pid && qtd > 0) {
      db.prepare('UPDATE products SET estoque = MAX(estoque - ?, 0) WHERE id = ?').run(qtd, pid);
    }
  });
  if (hub) {
    const dec = db.prepare(
      'UPDATE hub_stock SET qtd = MAX(qtd - ?, 0) WHERE product_id = ? AND hub_id = ?'
    );
    itens.forEach(function (it) {
      const pid = it.pid || null;
      const qtd = validNumber(it.qtd) || 0;
      if (pid && qtd > 0) dec.run(qtd, pid, hub.id);
    });
  }
  res.status(201).json({
    pedido: {
      id: Number(info.lastInsertRowid),
      status: 'novo',
      coupon: couponCode,
      desconto: desconto,
      credito: credito,
      total: total,
    },
  });
});
}

module.exports = { register };
