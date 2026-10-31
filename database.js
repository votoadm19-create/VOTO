'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('A variável DATABASE_URL não foi configurada.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', function (err) {
  console.error('Erro inesperado no pool PostgreSQL:', err.message);
});

async function testConnection() {
  const result = await pool.query('SELECT NOW() AS horario');
  console.log('Conexão com PostgreSQL estabelecida:', result.rows[0].horario);
}

module.exports = {
  pool,
  testConnection,
};
