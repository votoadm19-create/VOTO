# Páginas de produção

Páginas ligadas à API real (`server.js`), cada uma com `index.html` + `style.css` + `app.js` separados:

| Rota | Diretório | Quem acessa |
|---|---|---|
| `/influenciador` | `influenciador/` | Influenciadores (login próprio). Na loja: atalho Influenciador (tela inicial, rodapé) |
| `/cupons` | `cupons/` | Público vê cupons promocionais + como usar; admin logado vê a gestão completa (criar cupons, pedidos, pagamento) |
| `/operacao` | `operacao/` | **Só equipe**: admin ou usuário com papel `operacao`. Atalho no painel admin. Sem login → volta ao `/admin` |

## Como funciona

- **Cupons**: criados no `/cupons` (admin) ou `POST /api/admin/coupons`. Tipo `inf` cria junto o acesso do influenciador (e-mail + senha). Checkout da loja aplica no carrinho (`/api/coupons/preview` e `POST /api/orders` com `cupom`), o servidor recalcula desconto e crédito e grava `coupon_code/desconto/credito/credito_status` no pedido. Fluxo do crédito: `aguardando → entrega → carencia → liberada → paga` (ações na aba Pedidos). Pagamento Pix: na aba Pagamento, quem bateu a meta (`cupom_meta`, padrão R$ 100) é pago e os pedidos viram `paga`. Senha de influenciador: botão "Nova senha" (mostrada uma vez).
- **Influenciador**: o próprio influenciador se cadastra no portal (`POST /api/influenciador/register`, entra como **pendente**). No painel admin, a aba **Influenciadores** lista quem pediu o cadastro, mostra detalhes (dados, cupom, pedidos, pagamentos) e permite **aprovar** (gera o cupom automaticamente e libera o acesso), **rejeitar**, **pausar** ou **ativar**. Depois de aprovado, entra com o e-mail/senha do cadastro e vê cupom, crédito liberado/em espera/recebido, pedidos e pagamentos. Edita telefone, cidade, rede e chave Pix em Meus dados. Conta de demonstração (`larissa@exemplo.com` / `voto1234`): criada **somente** em bancos novos com `VOTO_SEED_DEMO=1` — nunca em produção.
- **Operação**: galpões (`hubs` + `hub_cities` com taxa), pedidos com etapas `novo → sep → rota → ok`, estoque por galpão (`hub_stock` com custo/mínimo, baixado na criação do pedido e ao editar itens), financeiro calculado dos pedidos reais, níveis de personalização e cadastro/edição de produtos. Calendário: o dia de hoje usa os pedidos reais; os demais dias do mês distribuem o faturamento.

## Papéis

- `admin`: tudo (loja, admin, cupons, operação).
- `operacao`: só `/operacao` e APIs `/api/operacao/*`. Não abre o painel admin (ao logar, é redirecionado para `/operacao`) e recebe `403` nas APIs `/api/admin/*`.
- Criar usuário de operação: insert direto no banco com `papel='operacao'` (senha com hash scrypt, mesma lógica em `src/lib/auth.js`).
