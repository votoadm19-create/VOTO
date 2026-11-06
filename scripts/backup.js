'use strict';

// Backup manual do SQLite: node scripts/backup.js
// Uso recomendado: agendar no cron/systemd. Cópias ficam em data/backups/
// (ignoradas pelo git via data/). Restauração: pare o servidor, copie o arquivo
// de volta para data/voto.db removendo voto.db-wal/voto.db-shm, suba de novo.

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../src/config');
const { db } = require('../src/db/sqlite');

const KEEP_DAYS = 30;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  );
}

function main() {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  const dir = path.join(DATA_DIR, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const src = path.join(DATA_DIR, 'voto.db');
  if (!fs.existsSync(src)) {
    console.error('Banco não encontrado: ' + src);
    process.exit(1);
  }
  const dest = path.join(dir, 'voto-' + stamp() + '.db');
  fs.copyFileSync(src, dest);
  console.log('Backup criado: ' + dest);

  const limite = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  fs.readdirSync(dir)
    .filter((f) => f.startsWith('voto-') && f.endsWith('.db'))
    .forEach(function (f) {
      const full = path.join(dir, f);
      if (fs.statSync(full).mtimeMs < limite) {
        fs.unlinkSync(full);
        console.log('Removido (mais de ' + KEEP_DAYS + ' dias): ' + full);
      }
    });
}

try {
  main();
} finally {
  if (db && typeof db.close === 'function') db.close();
}
