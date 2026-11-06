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
const { loginLimiter } = require('../lib/rateLimit');
const { ORDER_STATUS } = require('../lib/domain');
const { couponRules } = require('../lib/domain');
const { findCoupon } = require('../lib/domain');
const { couponOut } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { slugify } = require('../lib/util');
const { validNumber } = require('../lib/util');
const { safeJson } = require('../lib/util');
const { adjustOrderStock } = require('../lib/domain');
const { saveDataUrl } = require('../lib/util');

function register(app) {
/* ---------- admin: autenticação ---------- */

app.post('/api/admin/login', loginLimiter, function (req, res) {
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

app.post('/api/admin/customers/:id/reset-senha', requireAdmin, function (req, res) {
  const senha = req.body && req.body.senha;
  if (!senha || String(senha).length < 6) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }
  const info = db.prepare('UPDATE customers SET senha = ? WHERE id = ?').run(hashPassword(String(senha)), req.params.id);
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
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (ORDER_STATUS.indexOf(status) < 0) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  if (status === 'cancelado' && order.status !== 'cancelado') {
    safeJson(order.itens, []).forEach(function (it) {
      const pid = it.pid || null;
      const qtd = Number(it.qtd) || 0;
      if (pid && qtd > 0) {
        db.prepare('UPDATE products SET estoque = estoque + ? WHERE id = ?').run(qtd, pid);
        if (order.hub_id) {
          db.prepare('UPDATE hub_stock SET qtd = qtd + ? WHERE product_id = ? AND hub_id = ?').run(
            qtd,
            pid,
            order.hub_id
          );
        }
      }
    });
    if (order.credito_status && order.credito_status !== 'cancelado' && order.credito_status !== 'paga') {
      db.prepare('UPDATE orders SET credito_status = \'cancelado\' WHERE id = ?').run(req.params.id);
    }
  }
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true, status: status });
});

app.put('/api/admin/orders/:id', requireAdmin, function (req, res) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;
  if (!items || !items.length) return res.status(400).json({ erro: 'Envie os itens do pedido.' });
  const clean = [];
  let subtotal = 0;
  for (const it of items) {
    const nome = trimOrNull(it && it.nome);
    const preco = validNumber(it && it.preco);
    const qtd = Math.round(validNumber(it && it.qtd) || 0);
    if (!nome || preco == null || preco < 0 || qtd < 1) {
      return res.status(400).json({ erro: 'Item inválido no pedido.' });
    }
    clean.push({ key: it.key || null, pid: it.pid || null, nome: nome, preco: preco, qtd: qtd, det: it.det || null });
    subtotal += preco * qtd;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  let desconto = Number(order.desconto) || 0;
  let credito = Number(order.credito) || 0;
  if (order.coupon_code) {
    const coupon = findCoupon(order.coupon_code);
    if (coupon) {
      desconto = Math.round(subtotal * (Number(coupon.desconto) || 0) * 100) / 100;
      credito =
        coupon.kind === 'inf'
          ? Math.round((subtotal - desconto) * (Number(coupon.credito) || 0) * 100) / 100
          : 0;
    }
  }
  let persoPreco = 0;
  if (order.perso_json) {
    const saved = safeJson(order.perso_json, null);
    persoPreco = saved ? Number(saved.preco) || 0 : 0;
  }
  const total = Math.round((subtotal - desconto + persoPreco + (Number(order.frete) || 0)) * 100) / 100;
  adjustOrderStock(order, safeJson(order.itens, []), clean);
  db.prepare('UPDATE orders SET itens = ?, subtotal = ?, desconto = ?, credito = ?, total = ? WHERE id = ?').run(
    JSON.stringify(clean),
    subtotal,
    desconto,
    credito,
    total,
    req.params.id
  );
  res.json({ ok: true, pedido: { id: order.id, subtotal: subtotal, desconto: desconto, credito: credito, total: total } });
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

/* ---------- admin: influenciadores ---------- */

function influencerAdminOut(row) {
  const code = row.coupon_code || null;
  let pedidos = 0;
  let vendas = 0;
  let liberado = 0;
  if (code) {
    const agg = db
      .prepare(
        'SELECT COUNT(*) AS n, COALESCE(SUM(subtotal), 0) AS vendas FROM orders WHERE coupon_code = ? AND status != \'cancelado\' AND credito_status != \'cancelado\''
      )
      .get(code);
    pedidos = Number(agg.n) || 0;
    vendas = Number(agg.vendas) || 0;
    const lib = db
      .prepare(
        "SELECT COALESCE(SUM(credito), 0) AS total FROM orders WHERE coupon_code = ? AND credito_status = 'liberada'"
      )
      .get(code);
    liberado = Number(lib.total) || 0;
  }
  const pago = db
    .prepare('SELECT COALESCE(SUM(valor), 0) AS total FROM payments WHERE influencer_id = ?')
    .get(row.id);
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
    cupom: code || '',
    status: row.status || 'pendente',
    criadoEm: row.criado_em || '',
    pedidos: pedidos,
    vendas: vendas,
    liberado: liberado,
    recebido: Number(pago.total) || 0,
  };
}

app.get('/api/admin/influenciadores', requireAdmin, function (req, res) {
  const status = trimOrNull(req.query.status);
  const rows = status
    ? db.prepare('SELECT * FROM influencers WHERE status = ? ORDER BY criado_em DESC').all(status)
    : db.prepare('SELECT * FROM influencers ORDER BY criado_em DESC').all();
  res.json(rows.map(influencerAdminOut));
});

app.get('/api/admin/influenciadores/:id', requireAdmin, function (req, res) {
  const inf = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  if (!inf) return res.status(404).json({ erro: 'Influenciador não encontrado.' });
  const coupon = inf.coupon_code ? findCoupon(inf.coupon_code) : null;
  const pedidos = inf.coupon_code
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
            desconto: Number(o.desconto) || 0,
            credito: Number(o.credito) || 0,
            s: o.credito_status || o.status || 'aguardando',
            d: o.criado_em ? String(o.criado_em).slice(5, 10) : '',
            cu: o.cliente_nome || 'Cliente',
          };
        })
    : [];
  const pagamentos = db
    .prepare('SELECT pago_em, valor FROM payments WHERE influencer_id = ? ORDER BY id DESC')
    .all(inf.id)
    .map(function (p) {
      return { d: String(p.pago_em || '').slice(0, 10), valor: Number(p.valor) || 0 };
    });
  res.json({
    influenciador: influencerAdminOut(inf),
    cupom: coupon ? couponOut(coupon) : null,
    pedidos: pedidos,
    pagamentos: pagamentos,
  });
});

app.patch('/api/admin/influenciadores/:id', requireAdmin, function (req, res) {
  const acao = trimOrNull(req.body && req.body.acao);
  const inf = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  if (!inf) return res.status(404).json({ erro: 'Influenciador não encontrado.' });
  const status = inf.status || 'pendente';
  if (acao === 'aprovar') {
    if (status !== 'pendente' && status !== 'rejeitado') {
      return res.status(400).json({ erro: 'Só é possível aprovar cadastro pendente ou rejeitado.' });
    }
    const regras = couponRules();
    let code = inf.coupon_code || '';
    if (!code) {
      const base = slugify(inf.nome).replace(/-/g, '').toUpperCase().slice(0, 8) || 'INFLU';
      code = base + Math.floor(10 + Math.random() * 90);
      let i = 2;
      while (findCoupon(code)) code = base + (10 + Math.floor(Math.random() * 90)) + i++;
      db.prepare(
        'INSERT INTO coupons (code, kind, nome, email, cidade, pix_chave, pix_tipo, desconto, credito, ativo) VALUES (?, \'inf\', ?, ?, ?, ?, ?, ?, ?, 1)'
      ).run(
        code,
        inf.nome,
        inf.email,
        inf.cidade || null,
        inf.pix_chave || null,
        inf.pix_tipo || null,
        regras.descontoPadrao,
        regras.creditoPadrao
      );
    }
    db.prepare('UPDATE influencers SET status = \'ativo\', ativo = 1, coupon_code = ? WHERE id = ?').run(code, inf.id);
    const atualizado = db.prepare('SELECT * FROM influencers WHERE id = ?').get(inf.id);
    res.json({ ok: true, influenciador: influencerAdminOut(atualizado), cupom: couponOut(findCoupon(code)) });
    return;
  }
  if (acao === 'rejeitar') {
    if (status !== 'pendente') {
      return res.status(400).json({ erro: 'Só é possível rejeitar cadastro pendente.' });
    }
    db.prepare("UPDATE influencers SET status = 'rejeitado', ativo = 0 WHERE id = ?").run(inf.id);
    res.json({ ok: true, influenciador: influencerAdminOut(db.prepare('SELECT * FROM influencers WHERE id = ?').get(inf.id)) });
    return;
  }
  if (acao === 'pausar') {
    if (status !== 'ativo') {
      return res.status(400).json({ erro: 'Só é possível pausar influenciador ativo.' });
    }
    db.prepare("UPDATE influencers SET status = 'pausado', ativo = 0 WHERE id = ?").run(inf.id);
    res.json({ ok: true, influenciador: influencerAdminOut(db.prepare('SELECT * FROM influencers WHERE id = ?').get(inf.id)) });
    return;
  }
  if (acao === 'ativar') {
    if (status !== 'pausado' && status !== 'rejeitado') {
      return res.status(400).json({ erro: 'Só é possível ativar influenciador pausado ou rejeitado.' });
    }
    db.prepare("UPDATE influencers SET status = 'ativo', ativo = 1 WHERE id = ?").run(inf.id);
    res.json({ ok: true, influenciador: influencerAdminOut(db.prepare('SELECT * FROM influencers WHERE id = ?').get(inf.id)) });
    return;
  }
  res.status(400).json({ erro: 'Ação inválida.' });
});
}

module.exports = { register };
