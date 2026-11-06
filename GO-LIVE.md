# Go‑live — checklist para clientes reais

Estado medido em 6 de novembro de 2026 (banco atual em `data/voto.db`).

## Bloqueadores (fazer antes de divulgar)

- [ ] **Catálogo real**: o banco atual tem apenas **1 produto oculto e 0 ativos** — a loja abre vazia. Importar o catálogo (executar o seed em banco novo ou cadastrar pelo painel) e ativar os produtos.
- [ ] **Fotos dos produtos**: nenhum produto tem foto (aparece ilustração). Cadastrar foto de cada produto no painel (upload aceita até 8 MB).
- [ ] **Confirmações do negócio no painel**: WhatsApp da loja (hoje é um número padrão — `5511947400141`; confirme se é o WhatsApp oficial), fretes (R$ 10/15) e cidades atendidas.
- [ ] **Senha do admin forte**: o `.env` tem uma senha, mas o banco atual usa a senha antiga. Definir a senha final em Configurações e os dados de acesso do `.env`.
- [ ] **Remover dados de teste**: clientes/cupons de teste criados durante os testes (clientes `3001*`? higienizar pelo painel).
- [ ] **Demonstrador**: `VOTO_SEED_DEMO` está desligado (correto) — não ligar em produção.

## Infra / deploy

- [ ] **Domínio + HTTPS**: hoje roda em `http://localhost:3000`. Publicar atrás de proxy reverso (Nginx/Caddy) com HTTPS e definir `COOKIE_SECURE=1` no `.env`.
- [ ] **Serviço systemd ou gerenciador de processos** para subir no boot (exemplo de unidade no repositório se quiser).
- [ ] **Backup agendado**: `npm run backup` no cron (ex.: todo dia 03:00) — retenção de 30 dias já implementada.
- [ ] **Monitoramento**: `GET /api/health` (200/503) para saudável/não saudável, para o seu monitor externo.

## Funcional / comercial

- [ ] Conversar com os primeiros clientes e validar: finalizar pelo WhatsApp, Pix, frete e personalização de kits.
- [ ] Revisar saldos de estoque físicos vs. sistema (estoque baixa automaticamente por pedido e por edição).
- [ ] Conferir cupons/proms: criar o primeiro cupom promocional real (mínimo/validade/limite já suportados).
- [ ] Cupons de influenciadores: cadastros entram como pendentes — aprovar no painel (gera o cupom).

## Design (próximos passos — baixo risco)

- [ ] Fotos reais uniformes nos cards (o placeholder ilustrado é só reserva).
- [ ] Seções da home com ritmo mais editorial (estilo "vitrine") e carrossel de banners já existe.
- [ ] Validação de acessibilidade: contraste dos textos do header/degrade no mobile e foco de teclado.

## O que já está pronto

- Loja + conta do cliente + carrinho + cupom no checkout + WhatsApp.
- Painel admin completo (produtos, clientes com senha redefinível, pedidos com edição e WhatsApp, avaliações, configurações).
- Cupons e programa de influenciadores (cadastro → aprovação → portal → pagamento Pix por meta).
- Operação por galpão (pedidos/etapas, estoque, financeiro real do dia, personalização).
- Termos de serviço e privacidade no footer, rate-limit, `npm test`, backup e cache-busting.
