# Voto

Loja de materiais escolares + painel administrativo + cupons/influenciadores/operação.

## Como rodar

Requisitos: Node.js 22.5 ou superior.

```bash
npm install
npm start
```

- Site: http://localhost:3000
- Painel admin: http://localhost:3000/admin
- Cupons: http://localhost:3000/cupons · Influenciador: http://localhost:3000/influenciador · Operação: http://localhost:3000/operacao (equipe)

Na primeira execução o banco `data/voto.db` é criado e os produtos iniciais são importados de `seed/products.json`.

## Acesso ao painel

Na primeira execução (sem nenhum admin no banco), um usuário é criado:

- Sem `ADMIN_USER`/`ADMIN_PASS` no `.env`: usuário `admin` com **senha aleatória gerada no boot** — ela aparece uma única vez no log do servidor. Copie na hora.
- Com `ADMIN_USER`/`ADMIN_PASS` definidos, esses valores são usados.

Na primeira vez, prefira definir no `.env` (veja `.env.example`):

```bash
ADMIN_USER=seuUsuario ADMIN_PASS=suaSenha npm start
```

As senhas são armazenadas com hash (scrypt) e as sessões usam cookie HttpOnly.

## O que o painel faz

- Resumo com produtos, clientes, pedidos, avaliações e receita
- Cadastro, edição, duplicação, exclusão, estoque e visibilidade dos produtos
- Descrição do produto exibida na página do site
- Upload de imagem ou URL da imagem do produto
- Lista de clientes com CPF, foto, exportação CSV e histórico de pedidos
- Lista de pedidos com filtros por status, busca e alteração de status
- Moderação de avaliações enviadas pelos clientes
- Configuração do WhatsApp e dos valores de entrega pelo painel
- Alteração da senha do administrador

As alterações de produtos e configurações aparecem no site imediatamente ao recarregar a página.

## Área do cliente

- Cadastro, login e edição de perfil (nome, CPF, telefone e foto)
- Lista de produtos favoritos
- Histórico de compras
- Avaliação de produtos com nota e comentário
- Cupom de desconto aplicado no carrinho e enviado no pedido
- Mensagens de pedido no WhatsApp com dados do cliente, itens, subtotal, entrega e total

## Operação

- Saúde: `GET /api/health` → `{ ok, db }` (200/503) para monitorar e deploys.
- Backup do banco: `npm run backup` (fazer checkpoint no WAL e copia com data em `data/backups/`, mantém 30 dias). Para restaurar: pare o servidor, copie o arquivo de volta para `data/voto.db`, apague `voto.db-wal`/`voto.db-shm` e suba de novo. Agende no cron/systemd.
- Testes: `npm test` sobe o servidor num banco temporário (sem tocar em `data/`) e roda a suíte de fumaça.
- Logins têm rate-limit simples em memória (10 tentativas/5 min por IP): em produções com múltiplas réplicas, use um gateway na frente.

## Estrutura

```
Projeto - VOTO/
├── server.js                # Entry fino: monta a app e escuta (PORT padrão 3000)
├── src/
│   ├── config.js            # ROOT, pastas, PORT
│   ├── app.js               # App Express: estáticos, páginas, 404/500
│   ├── db/
│   │   ├── sqlite.js        # Conexão SQLite (node:sqlite) — singleton
│   │   ├── schema.js        # DDL + migrações ensureColumn
│   │   └── seed.js          # Produtos, admin, cupom/galpão de demonstração
│   ├── lib/
│   │   ├── auth.js          # Senhas (scrypt), sessões, guardas require*
│   │   ├── domain.js        # Settings, produtos, cupons, galpões, regras
│   │   └── util.js          # trimOrNull, slugify, validNumber, safeJson, upload
│   └── routes/
│       ├── store.js         # Loja pública: produtos, config, avaliações
│       ├── customer.js      # Conta do cliente, favoritos, pedidos (com cupom)
│       ├── admin.js         # Painel: auth, produtos, clientes, pedidos, avaliações, stats
│       ├── coupons.js       # /cupons: promos públicos, gestão de cupons, pagamento Pix
│       ├── influencer.js    # /influenciador: portal (login, dashboard, perfil)
│       └── operacao.js      # /operacao: galpões, pedidos/etapas, estoque, financeiro
├── public/
│   ├── README.md            # Cupons, influenciador e operação (fluxos, papéis)
│   ├── store/               # Loja: index.html, style.css, js/01-core,02-state,03-views,04-app
│   ├── admin/               # Painel: index.html, admin.css, js/01-core,02-views,03-actions
│   ├── cupons/              # index.html + style.css + app.js
│   ├── influenciador/       # index.html + style.css + app.js
│   └── operacao/            # index.html + style.css + app.js (só equipe)
├── seed/products.json       # Catálogo inicial
├── imgs/logo/               # Logos | imgs/products/ (vazio)
├── data/                    # voto.db SQLite (gerado, ignorado no git)
├── uploads/                 # Imagens enviadas pelo painel (ignorado no git)
├── schema.sql               # DDL PostgreSQL de referência (a variante Neon foi removida; ver abaixo)
└── package.json             # Node >=22.5, express + pg + dotenv
```

Fluxo: `public/*` → `fetch /api/*` → `src/routes/*` → `src/lib/*` → SQLite (`data/voto.db`); uploads em `uploads/`; config WhatsApp/frete em `window.VOTO_CONFIG`.

## Cupons, influenciadores e operação

Ver `public/README.md`. Resumo: tela inicial da loja tem atalhos **Influenciador** e **Cupons**; `/operacao` é restrito à equipe (admin ou papel `operacao`) e fica em atalho no painel admin — usuários de operação não veem o admin. A conta de demonstração (`larissa@exemplo.com`) **não é criada por padrão** — só em bancos novos com `VOTO_SEED_DEMO=1`.

## PostgreSQL

A variante Neon (`server.postgres.js` + `database.js`) foi **removida** para não ter duas implementações divergentes da mesma API. Fonte única: `src/` (SQLite, `npm start`). `schema.sql` fica como referência de DDL caso queiram recriar um adaptador Postgres sobre `src/routes/*` no futuro.
