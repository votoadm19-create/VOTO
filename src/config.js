'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const SEED_FILE = path.join(ROOT, 'seed', 'products.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

module.exports = { ROOT, DATA_DIR, UPLOAD_DIR, SEED_FILE, PUBLIC_DIR, PORT };
