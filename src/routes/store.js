'use strict';
const { db } = require('../db/sqlite');
const { requireCustomer } = require('../lib/auth');
const { PRODUCT_SELECT } = require('../lib/domain');
const { productForStore } = require('../lib/domain');
const { getSettings } = require('../lib/domain');
const { trimOrNull } = require('../lib/util');

function register(app) {
/* ---------- loja: produtos ---------- */

app.get('/api/products', function (req, res) {
  const rows = db
    .prepare(PRODUCT_SELECT + ' WHERE p.ativo = 1 ORDER BY p.criado_em, p.nome')
    .all();
  res.json(rows.map(productForStore));
});

app.get('/api/products.js', function (req, res) {
  const rows = db
    .prepare(PRODUCT_SELECT + ' WHERE p.ativo = 1 ORDER BY p.criado_em, p.nome')
    .all();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send('window.VOTO_PRODUCTS = ' + JSON.stringify(rows.map(productForStore)) + ';');
});

app.get('/api/config.js', function (req, res) {
  const s = getSettings();
  const config = {
    whatsapp: s.whatsapp,
    whatsappTexto: s.whatsapp_texto,
    frete: {
      'Jundiaí': Number(s.frete_jundiai) || 10,
      'Várzea Paulista': Number(s.frete_varzea) || 15,
    },
  };
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send('window.VOTO_CONFIG = ' + JSON.stringify(config) + ';');
});

app.get('/api/products/:id/reviews', function (req, res) {
  const rows = db
    .prepare(
      'SELECT id, nota, comentario, customer_nome, criado_em FROM reviews WHERE product_id = ? ORDER BY id DESC'
    )
    .all(req.params.id);
  const media = rows.length
    ? Math.round((rows.reduce(function (a, r) { return a + r.nota; }, 0) / rows.length) * 10) / 10
    : null;
  res.json({ media: media, total: rows.length, avaliacoes: rows });
});

app.post('/api/products/:id/reviews', requireCustomer, function (req, res) {
  const produto = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' });
  const nota = Number(req.body && req.body.nota);
  const comentario = trimOrNull(req.body && req.body.comentario);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
    return res.status(400).json({ erro: 'Escolha uma nota de 1 a 5 estrelas.' });
  }
  db.prepare(`
    INSERT INTO reviews (product_id, customer_id, customer_nome, nota, comentario)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, customer_id) DO UPDATE SET
      nota = excluded.nota, comentario = excluded.comentario, criado_em = datetime('now')
  `).run(req.params.id, req.customer.id, req.customer.nome, nota, comentario);
  res.status(201).json({ ok: true });
});
}

module.exports = { register };
