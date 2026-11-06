'use strict';

const { PORT } = require('./src/config');
const { createApp } = require('./src/app');

const app = createApp();

app.listen(PORT, function () {
  console.log('Voto rodando em http://localhost:' + PORT);
  console.log('Painel admin: http://localhost:' + PORT + '/admin');
});
