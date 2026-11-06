'use strict';

// Limite simples em memória por IP (janela fixa). Protege logins contra força bruta.
// Não substitui um gateway/WAF em produção, mas bloqueia tentativas automáticas em loop.
function createLimiter(max, windowMs) {
  const hits = new Map();
  return function (req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (hits.size > 5000) {
      hits.forEach(function (v, k) {
        if (v.reset <= now) hits.delete(k);
      });
    }
    if (entry.count > max) {
      return res.status(429).json({
        erro: 'Muitas tentativas. Tente novamente em alguns minutos.',
      });
    }
    next();
  };
}

const FIVE_MIN = 5 * 60 * 1000;
const loginLimiter = createLimiter(10, FIVE_MIN);
const registerLimiter = createLimiter(20, FIVE_MIN);

module.exports = { createLimiter, loginLimiter, registerLimiter };
