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

- Usuário padrão: `admin`
- Senha padrão: `voto123`

Para definir outro administrador inicial, rode na primeira vez:

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
├── database.js              # Pool PostgreSQL (só server.postgres.js)
├── server.postgres.js       # Variante PostgreSQL/Neon (não é o npm start)
├── schema.sql               # DDL PostgreSQL (inclui cupons/influenciadores/galpões)
└── package.json             # Node >=22.5, express + pg + dotenv
```

Fluxo: `public/*` → `fetch /api/*` → `src/routes/*` → `src/lib/*` → SQLite (`data/voto.db`); uploads em `uploads/`; config WhatsApp/frete em `window.VOTO_CONFIG`.

## Cupons, influenciadores e operação

Ver `public/README.md`. Resumo: tela inicial da loja tem atalhos **Influenciador** e **Cupons**; `/operacao` é restrito à equipe (admin ou papel `operacao`) e fica em atalho no painel admin — usuários de operação não veem o admin. Conta de demonstração (seed): `larissa@exemplo.com` / `voto1234` — **troque antes de ir ao ar**.

## PostgreSQL

`server.postgres.js` (com `database.js` + `schema.sql`) mantém a variante Neon para loja/admin. As rotas novas (cupons, influenciador, operação) vivem em `src/` (SQLite, `npm start`); o arquivo PostgreSQL ainda não foi espelhado — não use como fonte das rotas novas.
