'use strict';

const { db } = require('../db/sqlite');
const { trimOrNull, slugify, validNumber, safeJson } = require('./util');

const CATEGORIES = ['kit-f', 'kit-m', 'material', 'papelaria', 'mochilas', 'fem', 'masc'];
const ORDER_STATUS = ['novo', 'confirmado', 'enviado', 'entregue', 'cancelado'];
const DEFAULT_SETTINGS = {
  whatsapp: '5511947400141',
  whatsapp_texto: '11 94740-0141',
  frete_jundiai: '10',
  frete_varzea: '15',
  cupom_meta: '100',
  cupom_carencia: '7',
  cupom_dia_pagamento: '30',
  cupom_credito_padrao: '0.03',
  cupom_desconto_padrao: '0.03',
  cupom_portal_url: '',
};

function getSettings() {
  const out = Object.assign({}, DEFAULT_SETTINGS);
  db.prepare('SELECT chave, valor FROM settings').all().forEach(function (row) {
    out[row.chave] = row.valor;
  });
  return out;
}

function setSetting(chave, valor) {
  db.prepare(
    'INSERT INTO settings (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor'
  ).run(chave, String(valor));
}

function productOut(row) {
  return {
    id: row.id,
    nome: row.nome,
    cat: row.cat,
    preco: row.preco,
    de: row.de == null ? null : row.de,
    v: row.v,
    art: row.art,
    cor: row.cor,
    foto: row.foto || null,
    descricao: row.descricao || null,
    badge: row.badge || null,
    estoque: row.estoque,
    ativo: !!row.ativo,
    nota_media: row.nota_media == null ? null : row.nota_media,
    total_avaliacoes: row.total_avaliacoes == null ? 0 : row.total_avaliacoes,
    criado_em: row.criado_em,
    atualizado_em: row.atualizado_em,
  };
}

function productForStore(row) {
  const p = productOut(row);
  if (p.de == null) delete p.de;
  if (!p.foto) delete p.foto;
  if (!p.descricao) delete p.descricao;
  if (!p.badge) delete p.badge;
  delete p.estoque;
  delete p.ativo;
  delete p.criado_em;
  delete p.atualizado_em;
  return p;
}

const PRODUCT_SELECT = `
  SELECT p.*,
    (SELECT ROUND(AVG(r.nota), 1) FROM reviews r WHERE r.product_id = p.id) AS nota_media,
    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS total_avaliacoes
  FROM products p
`;

const OP_STATUS = ['novo', 'sep', 'rota', 'ok'];
const CREDITO_STATUS = ['aguardando', 'entrega', 'carencia', 'liberada', 'paga', 'cancelado'];

function couponRules() {
  const s = getSettings();
  return {
    meta: Number(s.cupom_meta) || 100,
    carencia: Number(s.cupom_carencia) || 7,
    diaPagamento: Number(s.cupom_dia_pagamento) || 30,
    creditoPadrao: Number(s.cupom_credito_padrao) || 0.03,
    descontoPadrao: Number(s.cupom_desconto_padrao) || 0.03,
    portalUrl: s.cupom_portal_url || '',
  };
}

function findCoupon(code) {
  if (!code) return null;
  return (
    db.prepare('SELECT * FROM coupons WHERE lower(code) = lower(?)').get(String(code).trim()) || null
  );
}

function couponOut(row) {
  return {
    code: row.code,
    kind: row.kind,
    name: row.nome,
    email: row.email || '',
    city: row.cidade || '',
    pix: row.pix_chave || '',
    pixTipo: row.pix_tipo || '',
    disc: Number(row.desconto) || 0,
    credit: Number(row.credito) || 0,
    on: !!row.ativo,
  };
}

function hubForCidade(cidade) {
  if (!cidade) return null;
  return (
    db
      .prepare('SELECT h.* FROM hubs h JOIN hub_cities hc ON hc.hub_id = h.id WHERE lower(hc.cidade) = lower(?)')
      .get(cidade) || null
  );
}

function hubOut(hub) {
  const cidades = db
    .prepare('SELECT cidade, taxa FROM hub_cities WHERE hub_id = ? ORDER BY cidade')
    .all(hub.id)
    .map(function (c) {
      return { cidade: c.cidade, taxa: Number(c.taxa) || 0 };
    });
  return {
    id: hub.id,
    nome: hub.nome,
    cmv: Number(hub.cmv) || 0,
    ent: Number(hub.entrega_pct) || 0,
    imp: Number(hub.imposto_pct) || 0,
    fixo: Number(hub.fixo) || 0,
    cidades: cidades,
  };
}

function readProductBody(body) {
  const nome = trimOrNull(body && body.nome);
  const cat = trimOrNull(body && body.cat);
  const preco = validNumber(body && body.preco);
  const de = body.de == null || body.de === '' || body.de === 0 ? null : validNumber(body.de);
  const v = validNumber(body.v);
  const estoque = validNumber(body.estoque);
  if (!nome) return { erro: 'Informe o nome do produto.' };
  if (CATEGORIES.indexOf(cat) < 0) return { erro: 'Categoria inválida.' };
  if (preco == null || preco < 0) return { erro: 'Informe um preço válido.' };
  if (de != null && de <= preco) return { erro: 'O preço "de" deve ser maior que o preço atual.' };
  return {
    data: {
      nome: nome,
      cat: cat,
      preco: preco,
      de: de,
      v: v == null ? 0 : Math.max(0, Math.round(v)),
      art: trimOrNull(body.art) || 'kit',
      cor: trimOrNull(body.cor) || '#e2561c',
      foto: trimOrNull(body.foto),
      descricao: trimOrNull(body.descricao),
      badge: trimOrNull(body.badge),
      estoque: estoque == null ? 0 : Math.max(0, Math.round(estoque)),
      ativo: body.ativo === false || body.ativo === 0 ? 0 : 1,
    },
  };
}

module.exports = {
  CATEGORIES,
  ORDER_STATUS,
  OP_STATUS,
  CREDITO_STATUS,
  DEFAULT_SETTINGS,
  PRODUCT_SELECT,
  getSettings,
  setSetting,
  productOut,
  productForStore,
  couponRules,
  findCoupon,
  couponOut,
  hubForCidade,
  hubOut,
  readProductBody,
};
