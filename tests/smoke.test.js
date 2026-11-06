'use strict';

// Smoke tests via node:test: sobe o servidor num banco temporário (VOTO_DATA_DIR)
// e exercita os fluxos principais (loja, cupom, influenciador, rate-limit).
// Uso: npm test

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3457;
const base = 'http://localhost:' + PORT;
let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voto-test-'));
let child = null;
let adminCookie = null;

async function waitUp() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Servidor não subiu a tempo');
}

async function req(method, p, body, cookie) {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await r.json();
  } catch {}
  const sc = r.headers.get('set-cookie');
  return { status: r.status, data, cookie: sc ? sc.split(';')[0] : null };
}

test.before(async function () {
  child = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      VOTO_DATA_DIR: tmpDir,
      VOTO_UPLOAD_DIR: path.join(tmpDir, 'uploads'),
      ADMIN_USER: 'admin-teste',
      ADMIN_PASS: 'senhaAdmin123',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitUp();
});

test.after(function () {
  if (child) child.kill('SIGTERM');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('health e loja', async function () {
  assert.equal((await req('GET', '/api/health')).status, 200);
  assert.equal((await fetch(base + '/')).status, 200);
  const prods = await req('GET', '/api/products');
  assert.equal(prods.status, 200);
  assert.ok(Array.isArray(prods.data) && prods.data.length > 0);
});

test('banco novo não tem demonstração', async function () {
  const promos = await req('GET', '/api/coupons');
  assert.deepEqual(promos.data, []);
  const login = await req('POST', '/api/influenciador/login', { email: 'larissa@exemplo.com', senha: 'voto1234' });
  assert.equal(login.status, 401);
});

test('cupom admin + pedido com desconto', async function () {
  const adm = await req('POST', '/api/admin/login', { usuario: 'admin-teste', senha: 'senhaAdmin123' });
  assert.equal(adm.status, 200);
  adminCookie = adm.cookie;
  const created = await req('POST', '/api/admin/coupons', { kind: 'promo', nome: 'Teste', code: 'TESTE10', desconto: 0.1, credito: 0 }, adminCookie);
  assert.equal(created.status, 201);
  const preview = await req('GET', '/api/coupons/preview?code=TESTE10&subtotal=200');
  assert.equal(preview.data.desconto, 20);
  const cust = await req('POST', '/api/auth/register', { nome: 'Cli', email: 'cli@x.com', senha: 'senha1234' });
  assert.equal(cust.status, 201);
  const order = await req('POST', '/api/orders', {
    itens: [{ pid: 'mochila-juvenil-vermelha', nome: 'Mochila', preco: 100, qtd: 2, det: null }],
    cidade: 'Jundiaí',
    cupom: 'TESTE10',
    subtotal: 200,
    frete: 10,
    total: 200,
  }, cust.cookie);
  assert.equal(order.status, 201);
  assert.equal(order.data.pedido.desconto, 20);
});

test('influenciador: cadastro → aprovação → login', async function () {
  const reg = await req('POST', '/api/influenciador/register', {
    nome: 'Ana Teste',
    email: 'ana.teste@x.com',
    senha: 'senhaAna123',
  });
  assert.equal(reg.status, 201);
  const id = reg.data.id;
  const blocked = await req('POST', '/api/influenciador/login', { email: 'ana.teste@x.com', senha: 'senhaAna123' });
  assert.equal(blocked.status, 403);
  const approved = await req('PATCH', '/api/admin/influenciadores/' + id, { acao: 'aprovar' }, adminCookie);
  assert.equal(approved.status, 200);
  assert.ok(approved.data.cupom.code);
  const login = await req('POST', '/api/influenciador/login', { email: 'ana.teste@x.com', senha: 'senhaAna123' });
  assert.equal(login.status, 200);
});

test('rate-limit bloqueia login após 10 tentativas', async function () {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    last = (await req('POST', '/api/admin/login', { usuario: 'nobody', senha: 'x' })).status;
  }
  assert.equal(last, 429);
});
