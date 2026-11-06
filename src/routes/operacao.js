'use strict';
const { db } = require('../db/sqlite');
const { requireEquipe } = require('../lib/auth');
const { equipeRow } = require('../lib/auth');
const { getSession } = require('../lib/auth');
const { PRODUCT_SELECT } = require('../lib/domain');
const { productOut } = require('../lib/domain');
const { adjustOrderStock } = require('../lib/domain');
const { findCoupon } = require('../lib/domain');
const { hubOut } = require('../lib/domain');
const { readProductBody } = require('../lib/domain');
const { OP_STATUS } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');
const { slugify } = require('../lib/util');
const { validNumber } = require('../lib/util');
const { safeJson } = require('../lib/util');
const { saveDataUrl } = require('../lib/util');
const path = require('path');
const { ROOT } = require('../config');

function register(app) {
app.get('/operacao', function (req, res) {
  if (!equipeRow(getSession(req))) return res.redirect('/admin');
  res.sendFile(path.join(ROOT, 'public', 'operacao', 'index.html'));
});

app.get('/api/equipe/me', function (req, res) {
  const row = equipeRow(getSession(req));
  res.json({ equipe: row ? { usuario: row.usuario, nome: row.nome, papel: row.papel } : null });
});

/* ---------- operação: galpões, pedidos, estoque, financeiro ---------- */

app.get('/api/operacao/hubs', requireEquipe, function (req, res) {
  res.json(db.prepare('SELECT * FROM hubs ORDER BY nome').all().map(hubOut));
});

app.post('/api/operacao/hubs', requireEquipe, function (req, res) {
  const nome = trimOrNull(req.body && req.body.nome);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome do galpão.' });
  const exists = db.prepare('SELECT id FROM hubs WHERE lower(nome) = lower(?)').get(nome);
  if (exists) return res.status(409).json({ erro: 'Já existe um galpão com esse nome.' });
  const info = db
    .prepare('INSERT INTO hubs (nome, cmv, entrega_pct, imposto_pct, fixo) VALUES (?, ?, ?, ?, ?)')
    .run(
      nome,
      validNumber(req.body.cmv) || 0,
      validNumber(req.body.ent) || 0,
      validNumber(req.body.imp) || 0,
      validNumber(req.body.fixo) || 0
    );
  const hub = db.prepare('SELECT * FROM hubs WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ galpao: hubOut(hub) });
});

app.put('/api/operacao/hubs/:id', requireEquipe, function (req, res) {
  const hub = db.prepare('SELECT * FROM hubs WHERE id = ?').get(req.params.id);
  if (!hub) return res.status(404).json({ erro: 'Galpão não encontrado.' });
  const nome = trimOrNull(req.body && req.body.nome) || hub.nome;
  db.prepare('UPDATE hubs SET nome = ?, cmv = ?, entrega_pct = ?, imposto_pct = ?, fixo = ? WHERE id = ?').run(
    nome,
    validNumber(req.body.cmv) != null ? req.body.cmv : hub.cmv,
    validNumber(req.body.ent) != null ? req.body.ent : hub.entrega_pct,
    validNumber(req.body.imp) != null ? req.body.imp : hub.imposto_pct,
    validNumber(req.body.fixo) != null ? req.body.fixo : hub.fixo,
    hub.id
  );
  const cidades = Array.isArray(req.body.cidades) ? req.body.cidades : null;
  if (cidades) {
    db.prepare('DELETE FROM hub_cities WHERE hub_id = ?').run(hub.id);
    const ins = db.prepare('INSERT INTO hub_cities (hub_id, cidade, taxa) VALUES (?, ?, ?)');
    cidades.forEach(function (c) {
      const cidade = trimOrNull(c && (c.cidade || c.nome));
      if (cidade) ins.run(hub.id, cidade, (c && validNumber(c.taxa)) || 0);
    });
  }
  res.json({ galpao: hubOut(db.prepare('SELECT * FROM hubs WHERE id = ?').get(hub.id)) });
});

app.delete('/api/operacao/hubs/:id', requireEquipe, function (req, res) {
  const info = db.prepare('DELETE FROM hubs WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Galpão não encontrado.' });
  res.json({ ok: true });
});

app.get('/api/operacao/orders', requireEquipe, function (req, res) {
  const hubId = validNumber(req.query.hub_id);
  const rows = hubId
    ? db.prepare('SELECT * FROM orders WHERE hub_id = ? ORDER BY id DESC').all(hubId)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  res.json(
    rows.map(function (o) {
      return {
        id: o.id,
        hub_id: o.hub_id,
        name: o.cliente_nome || 'Cliente',
        cidade: o.cidade || '',
        items: safeJson(o.itens, []),
        subtotal: Number(o.subtotal) || 0,
        frete: Number(o.frete) || 0,
        total: Number(o.total) || 0,
        status: o.status,
        op_status: o.op_status || 'novo',
        coupon: o.coupon_code || null,
        perso: o.perso_json ? safeJson(o.perso_json, null) : null,
        criado_em: o.criado_em,
      };
    })
  );
});

app.patch('/api/operacao/orders/:id', requireEquipe, function (req, res) {
  const op = trimOrNull(req.body && req.body.op_status);
  if (OP_STATUS.indexOf(op) < 0) return res.status(400).json({ erro: 'Etapa inválida.' });
  const info = db.prepare('UPDATE orders SET op_status = ? WHERE id = ?').run(op, req.params.id);
  if (!info.changes) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  if (op === 'ok') {
    db.prepare(
      "UPDATE orders SET status = 'entregue' WHERE id = ? AND status NOT IN ('entregue', 'cancelado')"
    ).run(req.params.id);
  }
  res.json({ ok: true, op_status: op });
});

app.get('/api/operacao/stock', requireEquipe, function (req, res) {
  const hubId = validNumber(req.query.hub_id);
  const rows = db
    .prepare(
      'SELECT p.id, p.nome, p.cat, p.preco, p.estoque, hs.hub_id, hs.qtd, hs.custo, hs.minimo FROM products p LEFT JOIN hub_stock hs ON hs.product_id = p.id AND (? IS NULL OR hs.hub_id = ?) ORDER BY p.nome'
    )
    .all(hubId, hubId);
  res.json(
    rows.map(function (r) {
      return {
        id: r.id,
        nome: r.nome,
        cat: r.cat,
        preco: Number(r.preco) || 0,
        est: Number(r.estoque) || 0,
        hub_id: r.hub_id,
        qtd: r.qtd == null ? null : Number(r.qtd),
        custo: r.custo == null ? null : Number(r.custo),
        min: Number(r.minimo) || 0,
      };
    })
  );
});

app.put('/api/operacao/stock', requireEquipe, function (req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : null;
  if (!items) return res.status(400).json({ erro: 'Envie items para atualizar.' });
  const up = db.prepare(
    'INSERT INTO hub_stock (product_id, hub_id, qtd, custo, minimo) VALUES (?, ?, ?, ?, ?) ON CONFLICT(product_id, hub_id) DO UPDATE SET qtd = excluded.qtd, custo = excluded.custo, minimo = excluded.minimo'
  );
  items.forEach(function (it) {
    const pid = trimOrNull(it && it.id);
    const hubId = validNumber(it && it.hub_id);
    if (!pid || !hubId) return;
    up.run(
      pid,
      hubId,
      Math.max(0, Math.round(validNumber(it.qtd) || 0)),
      it.custo == null || it.custo === '' ? null : validNumber(it.custo),
      Math.max(0, Math.round(validNumber(it.min) || 0))
    );
  });
  res.json({ ok: true });
});

app.get('/api/operacao/perso', requireEquipe, function (req, res) {
  const rows = db.prepare('SELECT * FROM perso_niveis ORDER BY id').all();
  res.json(
    rows.map(function (r) {
      return { id: r.id, nome: r.nome, desc: r.descricao || '', preco: Number(r.preco) || 0 };
    })
  );
});

app.put('/api/operacao/perso', requireEquipe, function (req, res) {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;
  if (!items || !items.length) return res.status(400).json({ erro: 'Envie os níveis de personalização.' });
  db.prepare('DELETE FROM perso_niveis').run();
  const ins = db.prepare('INSERT INTO perso_niveis (nome, descricao, preco) VALUES (?, ?, ?)');
  items.forEach(function (it) {
    const nome = trimOrNull(it && it.nome);
    if (nome) ins.run(nome, trimOrNull(it && it.desc), Math.max(0, validNumber(it && it.preco) || 0));
  });
  res.json({ ok: true });
});

app.get('/api/operacao/financeiro', requireEquipe, function (req, res) {
  const hubId = validNumber(req.query.hub_id);
  const tot = hubId
    ? db
        .prepare(
          "SELECT COALESCE(SUM(total), 0) AS fat, COALESCE(SUM(subtotal), 0) AS prod, COUNT(*) AS n FROM orders WHERE hub_id = ? AND status != 'cancelado'"
        )
        .get(hubId)
    : db
        .prepare(
          "SELECT COALESCE(SUM(total), 0) AS fat, COALESCE(SUM(subtotal), 0) AS prod, COUNT(*) AS n FROM orders WHERE status != 'cancelado'"
        )
        .get();
  const hub = hubId
    ? db.prepare('SELECT * FROM hubs WHERE id = ?').get(hubId)
    : db.prepare('SELECT * FROM hubs ORDER BY id LIMIT 1').get();
  const cmv = Number((tot.prod || 0) * ((hub && hub.cmv) || 0) / 100) || 0;
  const ent = Number((tot.fat || 0) * ((hub && hub.entrega_pct) || 0) / 100) || 0;
  const imp = Number((tot.fat || 0) * ((hub && hub.imposto_pct) || 0) / 100) || 0;
  const fixo = Number((hub && hub.fixo) || 0) || 0;
  const lucro = (tot.fat || 0) - cmv - ent - imp - fixo;
  res.json({
    fat: Number(tot.fat) || 0,
    pedidos: Number(tot.n) || 0,
    cmv: cmv,
    ent: ent,
    imp: imp,
    fixo: fixo,
    lucro: lucro,
  });
});

app.post('/api/operacao/upload', requireEquipe, function (req, res) {
  const saved = saveDataUrl(req.body && req.body.dataUrl, 8 * 1024 * 1024);
  if (saved.erro) return res.status(saved.status || 400).json({ erro: saved.erro });
  res.status(201).json({ url: saved.url });
});

app.get('/api/operacao/products', requireEquipe, function (req, res) {
  const rows = db.prepare(PRODUCT_SELECT + ' ORDER BY p.nome').all();
  res.json(rows.map(productOut));
});

app.put('/api/operacao/products/:id', requireEquipe, function (req, res) {
  const current = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const parsed = readProductBody(req.body);
  if (parsed.erro) return res.status(400).json({ erro: parsed.erro });
  const d = parsed.data;
  db.prepare(
    'UPDATE products SET nome = ?, cat = ?, preco = ?, de = ?, v = ?, art = ?, cor = ?, foto = ?, descricao = ?, badge = ?, estoque = ?, ativo = ?, atualizado_em = datetime(\'now\') WHERE id = ?'
  ).run(d.nome, d.cat, d.preco, d.de, d.v, d.art, d.cor, d.foto, d.descricao, d.badge, d.estoque, d.ativo, req.params.id);
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(req.params.id);
  res.json({ produto: productOut(row) });
});

app.put('/api/operacao/orders/:id', requireEquipe, function (req, res) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : null;
  if (items) {
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
    let persoJson = null;
    let persoPreco = 0;
    if (body.perso != null) {
      if (body.perso) {
        const nivel = trimOrNull(body.perso.nivel);
        const preco = validNumber(body.perso.preco);
        if (!nivel || preco == null || preco < 0) {
          return res.status(400).json({ erro: 'Personalização inválida.' });
        }
        persoPreco = preco;
        persoJson = JSON.stringify({
          nivel: nivel,
          desc: trimOrNull(body.perso.desc) || '',
          preco: preco,
          nota: trimOrNull(body.perso.nota) || '',
        });
      }
    } else if (order.perso_json) {
      persoJson = order.perso_json;
      const saved = safeJson(order.perso_json, null);
      persoPreco = saved ? Number(saved.preco) || 0 : 0;
    }
    const total = Math.round((subtotal - desconto + persoPreco + (Number(order.frete) || 0)) * 100) / 100;
    db.prepare(
      'UPDATE orders SET itens = ?, subtotal = ?, desconto = ?, credito = ?, total = ?, perso_json = ? WHERE id = ?'
    ).run(JSON.stringify(clean), subtotal, desconto, credito, total, persoJson, req.params.id);
    adjustOrderStock(order, safeJson(order.itens, []), clean);
  }
  if (!items && body.perso !== undefined) {
    let persoJson = null;
    let persoPreco = 0;
    if (body.perso) {
      const nivel = trimOrNull(body.perso.nivel);
      const preco = validNumber(body.perso.preco);
      if (!nivel || preco == null || preco < 0) {
        return res.status(400).json({ erro: 'Personalização inválida.' });
      }
      persoPreco = preco;
      persoJson = JSON.stringify({
        nivel: nivel,
        desc: trimOrNull(body.perso.desc) || '',
        preco: preco,
        nota: trimOrNull(body.perso.nota) || '',
      });
    }
    const subtotal = Number(order.subtotal) || 0;
    const total =
      Math.round(
        (subtotal - (Number(order.desconto) || 0) + persoPreco + (Number(order.frete) || 0)) * 100
      ) / 100;
    db.prepare('UPDATE orders SET total = ?, perso_json = ? WHERE id = ?').run(
      total,
      persoJson,
      req.params.id
    );
  }
  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  res.json({
    pedido: {
      id: updated.id,
      items: safeJson(updated.itens, []),
      subtotal: Number(updated.subtotal) || 0,
      desconto: Number(updated.desconto) || 0,
      credito: Number(updated.credito) || 0,
      total: Number(updated.total) || 0,
      perso: updated.perso_json ? safeJson(updated.perso_json, null) : null,
    },
  });
});

app.post('/api/operacao/products', requireEquipe, function (req, res) {
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
  db.prepare(
    'INSERT INTO products (id, nome, cat, preco, de, v, art, cor, foto, descricao, badge, estoque, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(finalId, d.nome, d.cat, d.preco, d.de, d.v, d.art, d.cor, d.foto, d.descricao, d.badge, d.estoque, d.ativo);
  const row = db.prepare(PRODUCT_SELECT + ' WHERE p.id = ?').get(finalId);
  res.status(201).json({ produto: productOut(row) });
});
}

module.exports = { register };
