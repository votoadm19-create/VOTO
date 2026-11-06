'use strict';

const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./sqlite');
const { SEED_FILE } = require('../config');
const { hashPassword } = require('../lib/auth');
const { couponRules, getSettings } = require('../lib/domain');

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (count > 0) return;
  let seed = [];
  try {
    seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  } catch (err) {
    console.warn('Aviso: não foi possível ler seed/products.json:', err.message);
    return;
  }
  const insert = db.prepare(`
    INSERT INTO products (id, nome, cat, preco, de, v, art, cor, foto, badge, estoque, ativo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  seed.forEach(function (p) {
    insert.run(
      p.id,
      p.nome,
      p.cat,
      p.preco,
      p.de == null ? null : p.de,
      p.v || 0,
      p.art || 'kit',
      p.cor || '#e2561c',
      p.foto || null,
      p.badge || null,
      typeof p.estoque === 'number' ? p.estoque : 50
    );
  });
  console.log('Produtos iniciais importados: ' + seed.length);
}

function seedAdmin() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (count > 0) return;
  const usuario = process.env.ADMIN_USER || 'admin';
  const gerada = !process.env.ADMIN_PASS;
  const senha = process.env.ADMIN_PASS || crypto.randomBytes(12).toString('base64url');
  db.prepare('INSERT INTO admins (usuario, nome, senha) VALUES (?, ?, ?)').run(
    usuario,
    'Administrador',
    hashPassword(senha)
  );
  console.log('Administrador criado: usuário "' + usuario + '"');
  if (gerada) {
    console.log(
      'SENHA DO PRIMEIRO ACESSO (copie agora, aparece só uma vez): ' + senha
    );
    console.log('Defina ADMIN_USER/ADMIN_PASS no .env para escolher as próximas credenciais.');
  }
}

function seedCuponsOperacao() {
  const regras = couponRules();
  if (process.env.VOTO_SEED_DEMO === '1' && db.prepare('SELECT COUNT(*) AS n FROM coupons').get().n === 0) {
    db.prepare(
      'INSERT INTO coupons (code, kind, nome, email, cidade, pix_chave, pix_tipo, desconto, credito, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(
      'LARISSA5',
      'inf',
      'Larissa Prado',
      'larissa@exemplo.com',
      'Jundiaí',
      '(11) 99999-1234',
      'telefone',
      regras.descontoPadrao,
      regras.creditoPadrao
    );
    db.prepare(
      'INSERT OR IGNORE INTO influencers (nome, email, senha, telefone, cidade, rede, usuario_rede, seguidores, pix_tipo, pix_chave, coupon_code, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    ).run(
      'Larissa Prado',
      'larissa@exemplo.com',
      hashPassword('voto1234'),
      '(11) 99999-1234',
      'Jundiaí',
      'Instagram',
      '@larissaprado',
      '10 a 50 mil',
      'telefone',
      '(11) 99999-1234',
      'LARISSA5'
    );
    console.log(
      'Seed: cupom LARISSA5 + influenciadora larissa@exemplo.com / voto1234 (troque a senha em produção).'
    );
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM hubs').get().n === 0) {
    const info = db.prepare('INSERT INTO hubs (nome, cmv, entrega_pct, imposto_pct, fixo) VALUES (?, ?, ?, ?, ?)').run(
      'Jundiaí',
      50,
      8,
      6,
      0
    );
    const hubId = Number(info.lastInsertRowid);
    const ins = db.prepare('INSERT OR IGNORE INTO hub_cities (hub_id, cidade, taxa) VALUES (?, ?, ?)');
    ins.run(hubId, 'Jundiaí', Number(getSettings().frete_jundiai) || 10);
    ins.run(hubId, 'Várzea Paulista', Number(getSettings().frete_varzea) || 15);
    const st = db.prepare('INSERT OR IGNORE INTO hub_stock (product_id, hub_id, qtd, custo, minimo) VALUES (?, ?, ?, NULL, 0)');
    db.prepare('SELECT id, estoque FROM products').all().forEach(function (p) {
      st.run(p.id, hubId, Number(p.estoque) || 0);
    });
    console.log('Seed: galpão Jundiaí (Jundiaí + Várzea Paulista) com estoque inicial.');
  }
  if (db.prepare('SELECT COUNT(*) AS n FROM perso_niveis').get().n === 0) {
    const ins = db.prepare('INSERT INTO perso_niveis (nome, descricao, preco) VALUES (?, ?, ?)');
    ins.run('Nível 1', 'Até 5 itens personalizados', 20);
    ins.run('Nível 2', 'De 6 a 15 itens personalizados', 40);
    ins.run('Nível 3', 'Mais de 15 itens personalizados', 60);
  }
}

function initSeeds() {
  seedProducts();
  seedAdmin();
  seedCuponsOperacao();
  db.prepare('DELETE FROM sessions WHERE expira_em < ?').run(Date.now());
}

module.exports = { initSeeds, seedProducts, seedAdmin, seedCuponsOperacao };
