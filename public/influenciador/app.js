/* =====================================================================
   VOTO INFLUENCIADOR. NOTAS PARA OS PROGRAMADORES

   Esta é a página que o influenciador usa: cadastro, entrada com e-mail e senha
   e painel com cupom, crédito, pedidos e dados de pagamento. Protótipo: os dados
   ficam na memória do navegador. Na loja de verdade, tudo vira banco de dados e API.

   TABELA SUGERIDA
   influencers : id, nome, cpf, email (único), telefone, rede, usuario, cidade,
                 pix_tipo ("cpf" | "email" | "telefone" | "aleatoria"), pix_chave,
                 senha_hash, status ("ativo" | "pausado"), coupon_code, criado_por, criado_em
   Os pedidos e pagamentos usam as mesmas tabelas da página "Voto Cupons"
   (orders, payments, coupons). O influenciador só enxerga os pedidos do próprio cupom.

   FLUXO
   1. O influenciador NÃO cria conta. Quem cria é a administração, na página "Voto Cupons"
      (Cupons > Novo cupom, tipo Influenciador). Ali ela informa nome, e-mail, senha provisória,
      Pix, cidade e o cupom. O sistema grava o influenciador e o cupom ao mesmo tempo.
   2. Esta página só tem a tela de Entrar (e-mail + senha). Ao entrar, abrir a sessão no
      servidor (cookie httpOnly). Não existe botão de criar cadastro.
   3. Cupom pausado ou influenciador com status "pausado": bloquear a entrada.
   4. A senha provisória aparece UMA vez para a administração, na hora de criar ou de gerar uma
      nova senha. Depois disso ninguém consegue ler a senha, só trocar por outra.

   SEGURANÇA (a página aqui é só demonstração)
   - Guardar só o hash da senha (argon2 ou bcrypt). Nunca a senha.
   - Validar tudo de novo no servidor: CPF, e-mail, telefone, chave Pix, tamanho da senha.
   - Limitar tentativas de entrada e de cadastro por IP e por e-mail.
   - O servidor decide o que o usuário vê. O painel nunca confia em dados do navegador.
   - O CPF aparece mascarado na tela. Evitar guardar sem criptografia.
   - Recuperar senha: hoje a administração gera uma nova senha. Se quiserem, dá para criar
     um link de recuperação por e-mail depois (não existe nesta prévia).

   REGRAS (vindas das configurações da página "Voto Cupons")
   desconto ao cliente, crédito do influenciador, base do crédito (valor pago ou preço original),
   meta mínima, dia do pagamento, carência em dias. Os números abaixo são exemplos.
   ===================================================================== */
(function () {
  var RULES = { disc: 0.03, credit: 0.03, base: "paid", goal: 100, payDay: 30, hold: 7 };
  var KIT = 289;

  var me = null, view = "entrar", tab = "inicio";

  function apiJSON(url, opts) {
    var o = Object.assign({ headers: {} }, opts || {});
    if (o.body && typeof o.body !== 'string') {
      o.body = JSON.stringify(o.body);
      o.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, o)
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.erro || "Não foi possível concluir a ação.");
          return data;
        });
      });
  }
  function applyMe(inf, dados) {
    if (!inf) { me = null; return; }
    var coupon = (dados && dados.coupon) || null;
    if (dados && dados.rules) {
      RULES.goal = dados.rules.meta;
      RULES.hold = dados.rules.carencia;
      RULES.payDay = dados.rules.diaPagamento;
    }
    me = {
      nome: inf.nome, email: inf.email, cpf: inf.cpf || "",
      tel: inf.telefone || "", rede: inf.rede || "", usuario: inf.usuario || "",
      seg: inf.seg || "", cidade: inf.cidade || "", pixTipo: inf.pixTipo || "",
      pixChave: inf.pixChave || "", code: inf.code || "",
      disc: coupon ? coupon.disc : RULES.disc, credit: coupon ? coupon.credit : RULES.credit,
      orders: (dados && dados.orders) || [],
      pays: ((dados && dados.pays) || []).map(function (p) { return { d: p.d, n: "", amt: p.n }; }),
    };
  }
  function loadMe() {
    return apiJSON("/api/influenciador/me")
      .then(function (data) {
        applyMe(data.influenciador, data.dados);
        if (data.influenciador) view = "painel";
      })
      .catch(function () {});
  }
  var REDES = ["Instagram", "TikTok", "YouTube", "WhatsApp ou grupo", "Outra"];
  var SEGS = ["Até 1 mil", "1 a 10 mil", "10 a 50 mil", "50 a 200 mil", "Mais de 200 mil"];
  var PIX = { cpf: "CPF", email: "E-mail", telefone: "Telefone", aleatoria: "Chave aleatória" };
  var ST = { aguardando: "Aguardando pagamento", entrega: "Pago · em entrega", carencia: "Em espera", liberada: "Crédito liberado", paga: "Crédito pago", cancelado: "Cancelado" };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function brl(n) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function pct(r) { return (r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function today() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  function sum(l, f) { return l.reduce(function (t, o) { return t + f(o); }, 0); }
  function pill(s) { return '<span class="pill ' + s + '">' + ST[s] + "</span>"; }
  function opts(list, sel, ph) { return (ph ? '<option value="">' + ph + "</option>" : "") + list.map(function (x) { return '<option' + (x === sel ? " selected" : "") + ">" + esc(x) + "</option>"; }).join(""); }

  /* ---------- regras de crédito ---------- */
  function counts(o) { return o.s !== "aguardando" && o.s !== "cancelado"; }
  function cred(u, o) { return counts(o) ? r2((RULES.base === "list" ? o.sub : r2(o.sub * (1 - u.disc))) * u.credit) : 0; }
  function paidVal(u, o) { return r2(o.sub * (1 - u.disc)); }
  function discAmt(u, o) { return r2(o.sub - paidVal(u, o)); }
  function ofS(u, sts) { return u.orders.filter(function (o) { return sts.indexOf(o.s) > -1; }); }
  function nextPayday() {
    var t = today();
    function pd(y, m) { var last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(RULES.payDay, last)); }
    var d = pd(t.getFullYear(), t.getMonth());
    if (d < t) d = pd(t.getFullYear(), t.getMonth() + 1);
    return d;
  }

  /* ---------- validação ---------- */
  function digits(s) { return String(s).replace(/\D/g, ""); }
  function cpfOk(v) {
    var c = digits(v);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += Number(c.charAt(i)) * (t + 1 - i);
      var dv = (s * 10) % 11 % 10;
      if (dv !== Number(c.charAt(t))) return false;
    }
    return true;
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function telOk(v) { var d = digits(v); return d.length === 10 || d.length === 11; }
  function maskCpf(v) { var d = digits(v).slice(0, 11); return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  function maskTel(v) {
    var d = digits(v).slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
    if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  }
  function pixOk(tipo, v) {
    if (tipo === "cpf") return cpfOk(v);
    if (tipo === "email") return emailOk(v);
    if (tipo === "telefone") return telOk(v);
    return /^[0-9a-fA-F-]{32,36}$/.test(v.trim());
  }
  /* ---------- peças de formulário ---------- */
  function field(id, label, input, hint, cls) {
    return '<div class="field' + (cls ? " " + cls : "") + '"><label for="' + id + '">' + label + "</label>" + input +
      (hint ? '<small class="hint" id="h-' + id + '">' + hint + "</small>" : "") + '<small class="err" id="e-' + id + '" role="alert"></small></div>';
  }
  function inp(id, attrs, val) { return '<input class="inp" id="' + id + '" ' + (attrs || "") + ' value="' + esc(val || "") + '">'; }
  function setErr(id, text) {
    var e = $("e-" + id), i = $(id);
    if (e) e.textContent = text || "";
    if (i) { if (text) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); }
    return !text;
  }
  function val(id) { var e = $(id); return e ? e.value.trim() : ""; }

  /* ---------- entrada e cadastro ---------- */
  function authView() {
    var facts = '<div class="facts"><div class="fact"><b>' + pct(RULES.disc) + '</b><span>de desconto para quem compra</span></div>' +
      '<div class="fact"><b>' + pct(RULES.credit) + '</b><span>de crédito para você em cada compra</span></div>' +
      '<div class="fact"><b>' + brl(RULES.goal).replace(",00", "") + '</b><span>mínimo para receber por Pix</span></div></div>';
    var pitch = '<aside class="pitch"><div class="eyebrow">Programa de influenciadores</div>' +
      "<h1>Indique a Voto e receba por cada compra feita com o seu cupom</h1>" +
      '<p class="lead">Quem compra com o seu cupom ganha desconto no carrinho. Você ganha crédito sobre a compra e recebe por Pix.</p>' + facts +
      "<ol><li>Cadastre-se como influenciador e aguarde a aprovação da Voto.</li><li>Depois de aprovado, seu cupom é gerado automaticamente.</li><li>Divulgue o cupom para quem compra material escolar.</li><li>Receba por Pix todo dia " + RULES.payDay + ", quando chegar a " + brl(RULES.goal) + ".</li></ol>" +
      '<div class="mini-ticket"><code>SEUCUPOM' + Math.round(RULES.disc * 100) + '</code><span>Exemplo de cupom</span></div></aside>';
    return '<div class="auth">' + pitch + '<div class="form-side"><div class="card"><h2 style="font-size:22px;letter-spacing:-0.01em">Entrar na sua conta</h2>' + loginForm() +
      (regMsg ? '<div class="fmsg" role="status">' + esc(regMsg) + "</div>" : "") +
      '<button class="btn ghost block" type="button" data-act="cadastro">Cadastre-se como influenciador</button>' +
      '<p class="hint-line">Novo por aqui? A equipe Voto aprova o cadastro antes de liberar o acesso.</p>' + rulesBox() + "</div></div></div>";
  }
  var regMsg = "";
  var regSuccess = null;
  function registerView() {
    function sec(titulo, items) {
      return '<div class="reg-sec"><h3>' + titulo + '</h3><div class="grid2">' + items + "</div></div>";
    }
    var form = '<form id="register-form" novalidate>' +
      sec("Seus dados",
        field("c-nome", "Nome completo", inp("c-nome", 'type="text" autocomplete="name" required minlength="3" placeholder="Seu nome"'), "") +
        field("c-email", "E-mail", inp("c-email", 'type="email" autocomplete="email" inputmode="email" required placeholder="voce@email.com"'), "Você vai entrar no portal com este e-mail.") +
        field("c-senha", "Senha (mínimo 8 caracteres)", '<div class="pw"><input class="inp" id="c-senha" type="password" autocomplete="new-password" minlength="8" required placeholder="Escolha uma senha"><button class="btn ghost sm" type="button" data-act="showpw" data-t="c-senha">Mostrar</button></div>', "") +
        field("c-tel", "WhatsApp", inp("c-tel", 'type="tel" inputmode="tel" autocomplete="tel" maxlength="15" placeholder="(11) 99999-9999"'), "") +
        field("c-cpf", "CPF", inp("c-cpf", 'type="text" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="000.000.000-00"'), "Ajuda a validar a sua identidade.") +
        field("c-cidade", "Cidade", inp("c-cidade", 'type="text" maxlength="40" placeholder="Jundiaí"'), "")) +
      sec("Onde você divulga",
        field("c-rede", "Rede social", '<select class="sel" id="c-rede">' + opts(REDES) + "</select>") +
        field("c-usuario", "Usuário ou link do perfil", inp("c-usuario", 'type="text" maxlength="80" placeholder="@voce"'), "É onde a Voto confere a divulgação.") +
        field("c-seg", "Seguidores", '<select class="sel" id="c-seg">' + opts(SEGS) + "</select>")) +
      '<div class="fmsg bad" id="c-msg" role="alert" hidden></div>' +
      '<button class="btn block" type="submit" id="c-submit">Enviar meu cadastro</button>' +
      '<button class="btn ghost block" type="button" data-act="to-login">Já tenho conta · Entrar</button></form>';
    return '<div class="auth-centered">' + '<div class="form-side"><div class="card"><h2 style="font-size:22px;letter-spacing:-0.01em">Cadastro de influenciador</h2>' +
      '<p class="hint-line">Preencha seus dados. Depois de aprovado pela equipe Voto, você recebe o acesso ao portal e o seu cupom é gerado automaticamente.</p>' + form + "</div></div></div>";
  }
  function successView() {
    return '<div class="auth-centered"><div class="card" style="text-align:center">' +
      '<div class="check" aria-hidden="true">✓</div>' +
      "<h2 style='font-size:22px;letter-spacing:-0.01em'>Cadastro enviado!</h2>" +
      '<p class="hint-line">Olá, <b>' + esc(regSuccess ? regSuccess.nome.split(" ")[0] : "influenciador") + '</b>! Seu cadastro está <b>em análise</b> pela equipe Voto.' +
      (regSuccess ? " Você vai entrar com <b>" + esc(regSuccess.email) + "</b> e a senha que cadastrou." : "") +
      "</p>" +
      '<ol class="steps" style="text-align:left"><li>A equipe aprova seu cadastro (normalmente em até 1 dia útil).</li><li>Seu cupom é gerado automaticamente.</li><li>Você recebe por Pix todo dia ' + RULES.payDay + ' ao bater ' + brl(RULES.goal) + ".</li></ol>" +
      '<button class="btn block" type="button" data-act="to-login">Voltar ao login</button></div></div>';
  }
  function doRegister() {
    var msg = $("c-msg");
    msg.hidden = true;
    var nome = val("c-nome"), email = val("c-email").toLowerCase(), senha = $("c-senha").value,
        tel = val("c-tel"), cpf = val("c-cpf").replace(/\D/g, ""), cidade = val("c-cidade"),
        rede = val("c-rede"), usuario = val("c-usuario"), seg = val("c-seg");
    if (nome.length < 3) { msg.textContent = "Informe seu nome completo."; msg.hidden = false; return; }
    if (!emailOk(email)) { msg.textContent = "Digite um e-mail válido."; msg.hidden = false; return; }
    if (!senha || senha.length < 8) { msg.textContent = "A senha precisa ter pelo menos 8 caracteres."; msg.hidden = false; return; }
    if (cpf && !cpfOk(cpf)) { msg.textContent = "Digite um CPF válido com 11 dígitos."; msg.hidden = false; return; }
    if (tel && !telOk(tel)) { msg.textContent = "Digite o WhatsApp com DDD, só números (10 ou 11 dígitos)."; msg.hidden = false; return; }
    var btn = $("c-submit");
    if (btn) { btn.disabled = true; btn.textContent = "Enviando…"; }
    apiJSON("/api/influenciador/register", {
      method: "POST",
      body: { nome: nome, email: email, senha: senha, telefone: tel, cpf: cpf, cidade: cidade, rede: rede, usuario: usuario, seg: seg },
    })
      .then(function () {
        regSuccess = { nome: nome, email: email };
        regMsg = "";
        view = "sucesso"; render(); toast("Cadastro enviado para análise.");
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = "Enviar meu cadastro"; }
        msg.textContent = err.message || "Não foi possível cadastrar. Tente de novo.";
        msg.hidden = false;
      });
  }
  function loginForm() {
    return '<form id="login-form" novalidate class="grid2" style="grid-template-columns:1fr">' +
      field("l-email", "E-mail", inp("l-email", 'type="email" autocomplete="email" inputmode="email" placeholder="voce@email.com"'), "") +
      field("l-senha", "Senha", '<div class="pw"><input class="inp" id="l-senha" type="password" autocomplete="current-password" placeholder="Sua senha"><button class="btn ghost sm" type="button" data-act="showpw" data-t="l-senha">Mostrar</button></div>', "") +
      '<div class="fmsg bad" id="l-msg" role="alert" hidden></div>' +
      '<button class="btn block" type="submit">Entrar</button></form>';
  }
  function rulesBox() {
    return '<details class="rules"><summary>Regras do programa</summary><ul>' +
      "<li>Quem compra com o seu cupom ganha " + pct(RULES.disc) + " de desconto, já aplicado no carrinho.</li>" +
      "<li>Você ganha " + pct(RULES.credit) + " de crédito sobre " + (RULES.base === "list" ? "o preço da compra, sem o desconto" : "o valor que o cliente pagou, já com o desconto") + ".</li>" +
      "<li>Depois da entrega, o crédito fica " + RULES.hold + " dias em espera. Se o pedido for cancelado ou devolvido, não conta.</li>" +
      "<li>Todo dia " + RULES.payDay + " a Voto soma o seu crédito liberado. Chegou a " + brl(RULES.goal) + ", você recebe por Pix.</li>" +
      "<li>Abaixo de " + brl(RULES.goal) + ", o valor acumula para o mês seguinte. Nada se perde.</li>" +
      "<li>Depois de aprovado, seu cupom é gerado automaticamente.</li></ul></details>";
  }

  function doLogin() {
    var email = val("l-email").toLowerCase(), senha = $("l-senha").value, msg = $("l-msg");
    setErr("l-email", ""); msg.hidden = true;
    if (!emailOk(email)) { setErr("l-email", "Digite o e-mail do seu cadastro."); return; }
    if (!senha) { msg.textContent = "Digite a sua senha."; msg.hidden = false; return; }
    apiJSON("/api/influenciador/login", { method: "POST", body: { email: email, senha: senha } })
      .then(function () { return loadMe(); })
      .then(function () {
        if (me) { tab = "inicio"; view = "painel"; render(); toast("Bem-vindo, " + me.nome.split(" ")[0]); }
      })
      .catch(function (err) {
        msg.textContent = err.message || "E-mail ou senha incorretos. Confira e tente de novo.";
        msg.hidden = false;
      });
  }
  /* ---------- painel ---------- */
  function panelView() {
    var nav = '<nav class="nav" aria-label="Seções">' + [["inicio", "Início"], ["pedidos", "Pedidos"], ["dados", "Meus dados"]].map(function (t) {
      return '<button data-act="tab" data-t="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : "") + ">" + t[1] + "</button>";
    }).join("") + "</nav>";
    return nav + (tab === "inicio" ? homeView() : tab === "pedidos" ? ordersView() : dataView());
  }
  function sums(u) {
    var lib = r2(sum(ofS(u, ["liberada"]), function (o) { return cred(u, o); }));
    var esp = r2(sum(ofS(u, ["entrega", "carencia"]), function (o) { return cred(u, o); }));
    var got = r2(sum(ofS(u, ["paga"]), function (o) { return cred(u, o); }));
    return { lib: lib, esp: esp, got: got, total: r2(lib + esp + got) };
  }
  function shareMsg(u) { return "Oi! Quer material escolar com entrega rápida? Peça na Voto e use o meu cupom " + u.code + " no carrinho para ganhar " + pct(u.disc) + " de desconto."; }
  function homeView() {
    var u = me, a = sums(u), nxt = nextPayday(), msg = shareMsg(u);
    var okO = u.orders.filter(counts);
    var p = Math.min(a.lib / RULES.goal * 100, 100);
    var flag;
    if (a.lib >= RULES.goal) flag = '<p class="flag">Meta batida. Você recebe ' + brl(a.lib) + " por Pix no dia " + fmt(nxt) + ".</p>";
    else if (a.lib > 0) flag = '<p class="flag warn">Faltam ' + brl(r2(RULES.goal - a.lib)) + " para a meta. Nada se perde: o valor acumula e vale para o próximo pagamento." + (a.esp > 0 ? " Mais " + brl(a.esp) + " estão em espera e podem ajudar a bater a meta." : "") + "</p>";
    else flag = '<p class="empty" style="margin-top:12px">Quando o crédito dos seus pedidos for liberado, ele aparece aqui.</p>';
    var d = r2(KIT * u.disc);
    return '<div class="head"><h1>Olá, ' + esc(u.nome.split(" ")[0]) + "</h1><p>Influenciador da Voto em " + esc(u.cidade) + ". Cada compra com o seu cupom rende crédito para você e desconto para quem compra.</p></div>" +
      '<div class="ticket"><div class="ticket-main"><div class="lbl">Seu cupom</div><div class="ticket-code" id="my-code">' + esc(u.code) + '</div>' +
      '<p class="hint">Quem comprar na Voto com esse cupom ganha ' + pct(u.disc) + " de desconto e você ganha " + pct(u.credit) + " de crédito sobre a compra.</p>" +
      '<div class="ticket-acts"><button class="btn" data-act="copy" data-t="my-code">Copiar cupom</button><a class="btn alt" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Compartilhar no WhatsApp</a></div></div>' +
      '<div class="ticket-side"><div><b>' + pct(u.disc) + "</b><span>de desconto para o cliente</span></div><div><b>" + pct(u.credit) + "</b><span>de crédito para você</span></div></div></div>" +
      (!u.pixChave ? '<p class="flag warn">Complete sua <b>chave Pix</b> em Meus dados para receber seus pagamentos. <button class="link" type="button" data-act="tab" data-t="dados">Preencher agora</button></p>' : "") +
      '<div class="panel"><div class="balance"><div><div class="lbl">Crédito liberado</div><div class="big">' + brl(a.lib) + '</div></div><div class="next-pay"><div class="lbl">Próximo pagamento</div><div class="nxt">' + fmt(nxt) + "</div></div></div>" +
      '<div class="goal"><div class="row"><span>Meta para receber</span><b>' + brl(a.lib) + " de " + brl(RULES.goal) + '</b></div><div class="bar"><i style="width:' + p + '%"></i></div></div>' + flag +
      '<div class="mini"><div><div class="lbl">Em espera ou entrega</div><div class="v">' + brl(a.esp) + '</div></div><div><div class="lbl">Já recebido</div><div class="v">' + brl(a.got) + '</div></div><div><div class="lbl">Total de crédito</div><div class="v">' + brl(a.total) + "</div></div></div></div>" +
      '<div class="stats"><div class="tile green"><div class="lbl">Vendido com o seu cupom</div><div class="val">' + brl(sum(okO, function (o) { return paidVal(u, o); })) + '</div></div><div class="tile"><div class="lbl">Pedidos pagos</div><div class="val">' + okO.length + '</div></div><div class="tile"><div class="lbl">Desconto dado a quem você indicou</div><div class="val">' + brl(sum(okO, function (o) { return discAmt(u, o); })) + "</div></div></div>" +
      '<div class="cols"><div class="panel"><div class="panel-h"><h2>Quanto você ganha</h2></div><div class="field"><label for="calc">Preço da compra: <b class="num" id="calc-v"></b></label><input type="range" id="calc" min="50" max="3000" step="50" value="1000"></div><p class="calc-out">O cliente paga <b class="plain" id="calc-p"></b>.<br>Você recebe <b id="calc-o"></b> de crédito.</p></div>' +
      '<div class="panel"><div class="panel-h"><h2>Assim o cliente usa</h2></div><div class="mock"><div class="it"><span>Kit médio</span><span class="num">' + brl(KIT) + '</span></div><div class="cp"><div>Cupom <code>' + esc(u.code) + "</code></div><span>" + pct(u.disc) + ' de desconto</span></div><div class="it"><span>Desconto</span><span class="num">−' + brl(d) + '</span></div><div class="it"><b>Total</b><b class="num">' + brl(KIT - d) + '</b></div></div><p style="margin-top:12px;font-size:13.5px;color:var(--muted)">O desconto já vem aplicado no carrinho. O pedido vai para o WhatsApp da Voto com o valor final e o seu cupom.</p></div></div>' +
      '<div class="cols"><div class="panel"><div class="panel-h"><h2>Mensagem pronta</h2></div><div class="msg" id="my-msg">' + esc(msg) + '</div><p style="margin-top:12px"><button class="btn ghost sm" data-act="copy" data-t="my-msg">Copiar mensagem</button></p></div>' +
      '<div class="panel"><div class="panel-h"><h2>Como você recebe</h2></div><ol class="steps"><li>Alguém compra com o seu cupom, paga, e a Voto entrega.</li><li>O crédito fica ' + RULES.hold + " dias em espera, para ver se o pedido volta. Pedido cancelado ou devolvido não conta.</li><li>Todo dia " + RULES.payDay + " a Voto soma o seu crédito liberado.</li><li>Se chegou a " + brl(RULES.goal) + ", você recebe por Pix. Se não, o valor acumula e vale no mês seguinte.</li></ol></div></div>";
  }
  function ordersView() {
    var u = me, mine = u.orders.slice().sort(function (x, y) { return y.id - x.id; });
    var list = mine.length ? mine.map(function (o) {
      return '<li><div><div class="t">Pedido #' + o.id + " · " + esc(o.item) + '</div><div class="s">' + o.d + " · cliente pagou " + brl(paidVal(u, o)) + " · " + pill(o.s) + '</div></div><div class="c">' + (counts(o) ? "+" + brl(cred(u, o)) : "—") + "</div></li>";
    }).join("") : '<li class="empty">Nenhum pedido ainda. Divulgue o seu cupom para começar.</li>';
    var pays = ofS(u, ["paga"]);
    var hist = u.pays.length ? u.pays.map(function (h) {
      return "<tr><td>" + esc(h.d) + '</td><td class="r">' + h.n + '</td><td class="r"><b>' + brl(h.amt != null ? h.amt : r2(sum(pays, function (o) { return cred(u, o); }))) + "</b></td></tr>";
    }).join("") : '<tr><td colspan="3" class="empty">Nenhum pagamento recebido ainda.</td></tr>';
    return '<div class="head"><h1>Seus pedidos</h1><p>Cada linha é uma compra feita com o seu cupom e o crédito que ela rende. O crédito aparece quando o cliente paga.</p></div>' +
      '<div class="panel"><div class="panel-h"><h2>Pedidos com o seu cupom</h2></div><ul class="feed">' + list + "</ul></div>" +
      '<div class="panel"><div class="panel-h"><h2>Situação do crédito</h2></div><dl class="legend">' +
      '<dt>' + pill("aguardando") + "</dt><dd>O cliente fez o pedido, mas ainda não pagou. Não gera crédito.</dd>" +
      "<dt>" + pill("entrega") + "</dt><dd>O cliente pagou e a Voto ainda vai entregar.</dd>" +
      "<dt>" + pill("carencia") + "</dt><dd>Já foi entregue. Espera " + RULES.hold + " dias para ver se o cliente cancela ou devolve.</dd>" +
      "<dt>" + pill("liberada") + "</dt><dd>Passou a espera. O valor entra na soma do pagamento do dia " + RULES.payDay + ".</dd>" +
      "<dt>" + pill("paga") + "</dt><dd>Já foi pago a você por Pix.</dd>" +
      "<dt>" + pill("cancelado") + "</dt><dd>Pedido cancelado ou devolvido. Não gera crédito.</dd></dl></div>" +
      '<div class="panel"><div class="panel-h"><h2>Pagamentos recebidos</h2></div><div class="tablebox"><table><thead><tr><th>Data</th><th class="r">Pedidos</th><th class="r">Valor pago</th></tr></thead><tbody>' + hist + "</tbody></table></div></div>";
  }
  function dataView() {
    var u = me;
    return '<div class="head"><h1>Meus dados</h1><p>Mantenha o telefone e a chave Pix em dia para o pagamento chegar certo. Para mudar nome, CPF ou e-mail, fale com a Voto.</p></div>' +
      '<div class="panel"><form id="data-form" novalidate><div class="grid2">' +
      field("d-nome", "Nome", '<input class="inp" id="d-nome" readonly value="' + esc(u.nome) + '">') +
      field("d-email", "E-mail", '<input class="inp" id="d-email" readonly value="' + esc(u.email) + '">') +
      field("d-cpf", "CPF", '<input class="inp" id="d-cpf" readonly value="' + esc("•••." + u.cpf.slice(4, 7) + ".•••-" + u.cpf.slice(-2)) + '">') +
      field("d-code", "Cupom", '<input class="inp" id="d-code" readonly value="' + esc(u.code) + '">') +
      field("d-tel", "WhatsApp", inp("d-tel", 'type="tel" inputmode="tel" autocomplete="tel" maxlength="15"', u.tel)) +
      field("d-cidade", "Cidade", inp("d-cidade", 'type="text" maxlength="40"', u.cidade)) +
      field("d-rede", "Onde você divulga", '<select class="sel" id="d-rede">' + opts(REDES, u.rede) + "</select>") +
      field("d-usuario", "Usuário ou link", inp("d-usuario", 'type="text" maxlength="80"', u.usuario)) +
      field("d-pixtipo", "Tipo da chave Pix", '<select class="sel" id="d-pixtipo">' + Object.keys(PIX).map(function (k) { return '<option value="' + k + '"' + (k === u.pixTipo ? " selected" : "") + ">" + PIX[k] + "</option>"; }).join("") + "</select>") +
      field("d-pix", "Chave Pix", inp("d-pix", 'type="text" autocomplete="off"', u.pixChave), "Use uma chave que esteja no seu nome.") +
      '</div><div class="fmsg bad" id="d-msg" role="alert" hidden style="margin-top:14px"></div><p style="margin-top:16px"><button class="btn" type="submit">Salvar dados</button></p></form></div>' +
      '<div class="panel"><div class="panel-h"><h2>Sair da conta</h2></div><button class="btn ghost" data-act="logout">Sair</button></div>';
  }
  function saveData() {
    var u = me, ok = true, g = {};
    ["tel", "cidade", "rede", "usuario", "pixtipo", "pix"].forEach(function (k) { g[k] = val("d-" + k); });
    function chk(id, cond, text) { if (!setErr("d-" + id, cond ? "" : text)) ok = false; }
    chk("tel", telOk(g.tel), "Digite o DDD e o número.");
    chk("cidade", g.cidade.length >= 2, "Informe a sua cidade.");
    chk("usuario", g.usuario.length >= 3, "Informe o seu usuário ou o link do perfil.");
    if (g.pix) chk("pix", pixOk(g.pixtipo, g.pix), "Chave Pix inválida para o tipo escolhido.");
    else setErr("d-pix", "");
    var msg = $("d-msg");
    if (!ok) { msg.textContent = "Confira os campos em vermelho."; msg.hidden = false; return; }
    msg.hidden = true;
    apiJSON("/api/influenciador/profile", {
      method: "PUT",
      body: {
        nome: u.nome, telefone: g.tel, cidade: g.cidade, rede: g.rede,
        usuario: g.usuario, seg: u.seg || "", pixTipo: g.pixtipo, pixChave: g.pix,
      },
    })
      .then(function () { return loadMe(); })
      .then(function () { render(); toast("Dados salvos"); })
      .catch(function (err) {
        msg.textContent = err.message || "Não foi possível salvar.";
        msg.hidden = false;
      });
  }

  /* ---------- tela ---------- */
  function render() {
    var who = $("who");
    if (me && view !== "entrar") {
      who.hidden = false;
      who.innerHTML = '<span class="nm">' + esc(me.nome.split(" ")[0]) + '</span><button class="btn ghost sm" data-act="logout">Sair</button>';
    } else { who.hidden = true; who.innerHTML = ""; }
    $("app").innerHTML = view === "painel" ? panelView() : view === "cadastro" ? registerView() : view === "sucesso" ? successView() : authView();
    if (view === "painel" && tab === "inicio") calc();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function calc() {
    if (!$("calc")) return;
    var u = me, v = Number($("calc").value), pay = r2(v * (1 - u.disc));
    $("calc-v").textContent = brl(v); $("calc-p").textContent = brl(pay);
    $("calc-o").textContent = brl(r2((RULES.base === "list" ? v : pay) * u.credit));
  }
  var tt;
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2600); }
  function copyText(id) {
    var el = $(id), text = el.textContent.trim();
    function fb() { var r = document.createRange(); r.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selecionado. Use copiar do aparelho."); }
    try { navigator.clipboard.writeText(text).then(function () { toast("Copiado"); }, fb); } catch (e) { fb(); }
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var a = t.dataset.act;
    if (a === "tab") { tab = t.dataset.t; render(); }
    else if (a === "copy") copyText(t.dataset.t);
    else if (a === "logout") { apiJSON("/api/influenciador/logout", { method: "POST" }).catch(function () {}).then(function () { me = null; view = "entrar"; render(); toast("Você saiu da conta"); }); }
    else if (a === "showpw") { var i = $(t.dataset.t); var show = i.type === "password"; i.type = show ? "text" : "password"; t.textContent = show ? "Ocultar" : "Mostrar"; }
    else if (a === "cadastro") { regMsg = ""; view = "cadastro"; render(); }
    else if (a === "to-login") { view = "entrar"; render(); }
  });
  document.addEventListener("submit", function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === "login-form") doLogin();
    else if (id === "register-form") doRegister();
    else if (id === "data-form") saveData();
  });
  document.addEventListener("input", function (e) {
    var t = e.target, id = t.id;
    if (id === "calc") { calc(); return; }
    if (id === "d-tel" || id === "c-tel") t.value = maskTel(t.value);
    else if (id === "d-pix" || id === "c-pix") {
      var tipo = $(id === "c-pix" ? "c-pixtipo" : "d-pixtipo").value;
      if (tipo === "cpf") t.value = maskCpf(t.value); else if (tipo === "telefone") t.value = maskTel(t.value);
    }
    else if (id === "c-cpf") t.value = maskCpf(t.value);
    if (id.indexOf("-") === 1 && $("e-" + id) && $("e-" + id).textContent) setErr(id, "");
  });
  document.addEventListener("change", function (e) {
    var id = e.target.id;
    if (id === "d-pixtipo" || id === "c-pixtipo") {
      var pix = $(id === "c-pixtipo" ? "c-pix" : "d-pix"), tipo = e.target.value;
      pix.placeholder = { cpf: "000.000.000-00", email: "voce@email.com", telefone: "(11) 99999-0000", aleatoria: "32 caracteres ou letras" }[tipo];
      pix.inputMode = tipo === "email" || tipo === "aleatoria" ? "text" : "numeric";
      pix.value = "";
      setErr(id === "c-pixtipo" ? "c-pix" : "d-pix", "");
    }
  });

  loadMe().then(function () { render(); });
})();
