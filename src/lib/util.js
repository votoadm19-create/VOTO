'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { UPLOAD_DIR } = require('../config');

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function saveDataUrl(dataUrl, maxBytes) {
  const match =
    typeof dataUrl === 'string'
      ? dataUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/)
      : null;
  if (!match) return { erro: 'Envie uma imagem PNG, JPG, WEBP ou GIF.' };
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > maxBytes) {
    return { status: 413, erro: 'Imagem muito grande (máximo ' + Math.round(maxBytes / 1024 / 1024) + ' MB).' };
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return { url: '/uploads/' + name };
}

function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function validNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

module.exports = { trimOrNull, slugify, validNumber, safeJson, saveDataUrl };
