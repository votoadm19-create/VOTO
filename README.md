# Voto

Loja de materiais escolares + painel administrativo.

## Como rodar

Requisitos: Node.js 22.5 ou superior.

```bash
npm install
npm start
```

- Site: http://localhost:3000
- Painel admin: http://localhost:3000/admin

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
- Mensagens de pedido no WhatsApp com dados do cliente, itens, subtotal, entrega e total

## Estrutura

- `server.js` — API Express + SQLite (`node:sqlite`) e autenticação
- `index.html`, `script.js`, `style.css` — loja
- `admin/` — painel administrativo
- `seed/products.json` — catálogo inicial
- `data/` — banco de dados (gerado automaticamente, ignorado no git)
- `uploads/` — imagens enviadas pelo painel (ignorado no git)
