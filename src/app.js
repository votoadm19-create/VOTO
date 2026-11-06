'use strict';

const express = require('express');
const path = require('path');
const { ROOT, UPLOAD_DIR, PUBLIC_DIR } = require('./config');
const { initSchema } = require('./db/schema');
const { initSeeds } = require('./db/seed');
const { equipeRow, getSession } = require('./lib/auth');

initSchema();
initSeeds();

function requireEquipePage(req, res, next) {
  if (!equipeRow(getSession(req))) return res.redirect('/admin');
  next();
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', function (req, res) {
    try {
      const { db } = require('./db/sqlite');
      db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: true, db: 'ok', agora: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ ok: false, db: 'erro', erro: 'Banco indisponível.' });
    }
  });

  app.get('/', function (req, res) {
    res.sendFile(path.join(PUBLIC_DIR, 'store', 'index.html'));
  });
  app.get('/index.html', function (req, res) {
    res.sendFile(path.join(PUBLIC_DIR, 'store', 'index.html'));
  });
  app.use('/imgs', express.static(path.join(ROOT, 'imgs')));
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/admin', express.static(path.join(PUBLIC_DIR, 'admin')));
  app.use('/', express.static(path.join(PUBLIC_DIR, 'store')));

  require('./routes/store').register(app);
  require('./routes/customer').register(app);
  require('./routes/admin').register(app);
  require('./routes/coupons').register(app);
  require('./routes/influencer').register(app);
  require('./routes/operacao').register(app);

  app.use('/cupons', express.static(path.join(PUBLIC_DIR, 'cupons')));
  app.use('/influenciador', express.static(path.join(PUBLIC_DIR, 'influenciador')));
  app.use('/operacao', requireEquipePage, express.static(path.join(PUBLIC_DIR, 'operacao')));

  app.use(function (req, res) {
    res.status(404).json({ erro: 'Rota não encontrada.' });
  });

  app.use(function (err, req, res, next) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { createApp };
