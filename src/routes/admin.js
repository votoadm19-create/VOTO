'use strict';
const { db } = require('../db/sqlite');
const { requireAdmin } = require('../lib/auth');
const { equipeRow } = require('../lib/auth');
const { getSession } = require('../lib/auth');
const { startSession } = require('../lib/auth');
const { hashPassword } = require('../lib/auth');
const { checkPassword } = require('../lib/auth');
const { PRODUCT_SELECT } = require('../lib/domain');
const { productOut } = require('../lib/domain');
const { getSettings } = require('../lib/domain');
const { setSetting } = require('../lib/domain');
const { readProductBody } = require('../lib/domain');
const { ORDER_STATUS } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { slugify } = require('../lib/util');
const { validNumber } = require('../lib/util');
const { safeJson } = require('../lib/util');
const { saveDataUrl } = require('../lib/util');

function register(app) {
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
  res.json({
    admin: {
      id: admin.id,
      usuario: admin.usuario,
      nome: admin.nome,
      papel: admin.papel || 'admin',
    },
  });
});

app.post('/api/admin/logout', function (req, res) {
  const session = getSession(req);
  if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(session.token);
  res.clearCookie('voto_sess', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', function (req, res) {
  const row = equipeRow(getSession(req));
  res.json({
    admin: row
      ? { id: row.id, usuario: row.usuario, nome: row.nome, papel: row.papel }
      : null,
  });
});

/* ---------- admin: produtos ---------- */

app.get('/api/admin/products', requireAdmin, function (req, res) {
  const rows = db.prepare(PRODUCT_SELECT + ' ORDER BY p.nome').all();
  res.json(rows.map(productOut));
});


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
}

module.exports = { register };
