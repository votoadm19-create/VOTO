/* =====================================================================
   VOTO CUPONS — NOTAS PARA OS PROGRAMADORES

   Esta página é um protótipo. Os dados ficam na memória do navegador e
   somem ao recarregar. Na loja de verdade, tudo abaixo vira banco de dados
   e API. Os nomes das variáveis já sugerem as tabelas.

   TABELAS SUGERIDAS
   coupons : code (único), kind ("inf" influenciador | "promo" promocional),
             name, city, pix, disc (desconto ao cliente, 0.03 = 3%),
             credit (crédito ao dono, só kind "inf"), on (ativo)
   orders  : id, coupon_code, item, sub (preço sem desconto),
             dr (desconto aplicado no pedido), v (valor pago pelo cliente),
             cr (taxa de crédito do pedido), cb ("paid" | "list" = base do crédito),
             s (situação), rel (data em que a espera termina), data, cliente
   payments: data, coupon_code, valor, qtde de pedidos
   settings: disc, credit, base, goal (meta mínima), payDay (dia do pagamento),
             hold (dias de carência)

   SITUAÇÃO DO PEDIDO (campo s)
   aguardando -> entrega -> carencia -> liberada -> paga      (cancelado em qualquer ponto)
     aguardando : cliente fez o pedido e não pagou. Sem crédito.
     entrega    : cliente pagou, falta entregar.
     carencia   : entregue. Espera "hold" dias para ver se volta. Sem crédito ainda.
     liberada   : passou a espera. Conta para o pagamento do dia.
     paga       : crédito já pago ao influenciador.
     cancelado  : cancelado ou devolvido. Sem crédito.
   Em produção, o salto carencia -> liberada deve ser automático (rotina diária):
   quando hoje >= rel e o pedido não foi cancelado ou devolvido.

   ACESSO DO INFLUENCIADOR (portal "Voto Influenciador")
   Só a administração cria contas. Ao criar um cupom do tipo influenciador, o sistema grava
   o cupom e o acesso juntos: coupons.email (único) e senha_hash. A senha provisória aparece
   uma vez para a administração copiar e enviar. Guardar só o hash (argon2 ou bcrypt).
   "Nova senha" gera outra senha e mostra uma vez. Cupom pausado bloqueia a entrada no portal.
   O influenciador não consegue criar conta sozinho.

   REGRA DO DESCONTO
   O desconto é aplicado no carrinho do site, antes de o pedido ir para o WhatsApp.
   A IA do WhatsApp só confirma o valor que chegou, não valida cupom.
   IMPORTANTE: o servidor deve recalcular o desconto a partir do cupom e dos preços,
   sem confiar no valor enviado pelo navegador.
     v = sub - arredondar(sub * disc)

   REGRA DO CRÉDITO
     crédito do pedido = (cb == "paid" ? v : sub) * cr          (arredondado a 2 casas)
   Cupom promocional ("promo") tem cr = 0: dá desconto, não gera crédito.
   A taxa e a base ficam gravadas no pedido na hora da venda. Mudar o padrão
   depois não altera pedidos antigos.

   REGRA DO PAGAMENTO (todo dia "payDay", padrão 30)
   1. Para cada influenciador: liberado = soma do crédito dos pedidos em "liberada".
   2. Se liberado >= goal (padrão R$ 100): paga por Pix e marca os pedidos como "paga".
   3. Se liberado < goal: não paga. Os pedidos continuam "liberada" e entram na soma do
      mês seguinte (o valor acumula, nada se perde).
   4. Mês com menos dias que payDay: paga no último dia do mês.
   5. Pedidos em "entrega" ou "carencia" no dia do pagamento ficam para o próximo.
   ===================================================================== */
(function () {
  var KITS = { basico: { n: "Kit básico", v: 189 }, medio: { n: "Kit médio", v: 289 }, premium: { n: "Kit premium", v: 459 }, escola: { n: "Compra para escola (30 kits)", v: 1000 } };
  var state = { disc: 0.03, credit: 0.03, base: "paid", goal: 100, payDay: 30, hold: 7, portal: "" };
  var lastAccess = null;   /* acesso recém criado ou senha nova, mostrado uma vez */
  var ME = "";
  var filter = "todas", filterAff = "todos", nextId = 1074;
  var applied = null;   /* cupom aplicado no carrinho do simulador */
  var coupons = [], orders = [], history = [];

  function apiJSON(url, opts) {
    return fetch(url, Object.assign({ headers: {} }, opts || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.erro || "Não foi possível concluir a ação.");
          return data;
        });
      });
  }
  function decorateOrders() {
    orders.forEach(function (o) {
      var c = cp(o.c) || { disc: 0, credit: 0 };
      o.dr = c.disc; o.cr = c.credit; o.cb = "paid"; o.v = r2(o.sub * (1 - o.dr));
    });
  }
  function loadPainel(done) {
    return apiJSON("/api/admin/coupons-painel")
      .then(function (data) {
        coupons = data.coupons || [];
        orders = data.orders || [];
        history = data.payments || [];
        var r = data.rules || {};
        state.goal = r.meta; state.payDay = r.diaPagamento; state.hold = r.carencia;
        state.disc = r.descontoPadrao; state.credit = r.creditoPadrao; state.portal = r.portalUrl || "";
        syncRulesForm(); kindForm(); decorateOrders(); render();
        if (done) done(true);
      })
      .catch(function (err) {
        if (done) done(false, err);
      });
  }
  function syncRulesForm() {
    if ($("r-disc")) $("r-disc").value = Math.round((state.disc || 0) * 100 * 10) / 10;
    if ($("r-credit")) $("r-credit").value = Math.round((state.credit || 0) * 100 * 10) / 10;
    if ($("r-goal")) $("r-goal").value = state.goal;
    if ($("r-day")) $("r-day").value = state.payDay;
    if ($("r-hold")) $("r-hold").value = state.hold;
    if ($("r-portal")) $("r-portal").value = state.portal || "";
  }
  function showPublic() {
    document.querySelectorAll("[data-view]").forEach(function (s) { s.hidden = true; });
    document.querySelectorAll(".nav a").forEach(function (a) { a.removeAttribute("aria-current"); });
    apiJSON("/api/coupons")
      .then(function (list) {
        var el = document.getElementById("cupons-public");
        var html = '<div class="head"><h1>Cupons</h1><p>Use o cupom no carrinho para ganhar desconto. Se você é influenciador, entre com o acesso que a Voto criou para você.</p></div>';
        html += list.length
          ? '<div class="panel"><div class="panel-h"><h2>Cupons ativos</h2></div><ul class="feed">' + list.map(function (c) {
              return '<li><div><div class="t">' + esc(c.name) + '</div><div class="s">' + pct(c.disc) + ' de desconto</div></div><div class="c"><code>' + esc(c.code) + '</code></div></li>';
            }).join("") + "</ul></div>"
          : '<div class="panel"><p>Nenhum cupom promocional ativo no momento.</p></div>';
        html += '<div class="panel"><div class="panel-h"><h2>É influenciador?</h2></div><p>Entre com o e-mail e a senha criados pela Voto.</p><p style="margin-top:12px"><a class="btn" href="/influenciador">Entrar no portal do influenciador</a></p></div>';
        el.innerHTML = html; el.hidden = false;
      })
      .catch(function () {});
  }


  var ST = { aguardando: "Aguardando pagamento", entrega: "Pago · em entrega", carencia: "Em espera", liberada: "Crédito liberado", paga: "Crédito pago", cancelado: "Cancelado" };
  var ACTS = {
    aguardando: [["pay", "Confirmar pagamento", ""], ["cancel", "Cancelar", "ghost"]],
    entrega: [["deliver", "Marcar entregue", ""], ["cancel", "Cancelar", "ghost"]],
    carencia: [["release", "Liberar agora", ""], ["cancel", "Cancelar", "ghost"]],
    liberada: [["cancel", "Cancelar", "ghost"]],
    paga: [], cancelado: []
  };
  var FILTERS = [["todas", "Todos"], ["aguardando", "Aguardando pagamento"], ["entrega", "Em entrega"], ["carencia", "Em espera"], ["liberada", "Crédito liberado"], ["paga", "Crédito pago"], ["cancelado", "Cancelados"]];

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function brl(n) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function pct(r) { return (r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"; }
  function pill(s) { return '<span class="pill ' + s + '">' + ST[s] + "</span>"; }
  function counts(o) { return o.s !== "aguardando" && o.s !== "cancelado"; }
  function cbase(o) { return o.cb === "list" ? o.sub : o.v; }
  function cred(o) { return counts(o) ? r2(cbase(o) * o.cr) : 0; }
  function discAmt(o) { return r2(o.sub - o.v); }
  function sum(list, f) { return list.reduce(function (t, o) { return t + f(o); }, 0); }
  function cp(code) { return coupons.filter(function (a) { return a.code === code; })[0]; }
  function infs() { return coupons.filter(function (c) { return c.kind === "inf"; }); }
  function paid(o) { return o.v; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); }
  function fmtShort(d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1); }
  function today() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }

  /* ---- regra do pagamento ---- */
  function nextPayday() {
    var t = today();
    function pd(y, m) { var last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(state.payDay, last)); }
    var d = pd(t.getFullYear(), t.getMonth());
    if (d < t) d = pd(t.getFullYear(), t.getMonth() + 1);
    return d;
  }
  function daysUntil(d) { return Math.round((d - today()) / 86400000); }
  function ofCode(code, sts) { return orders.filter(function (o) { return o.c === code && sts.indexOf(o.s) > -1; }); }
  function liberado(code) { return r2(sum(ofCode(code, ["liberada"]), cred)); }
  function emEspera(code) { return r2(sum(ofCode(code, ["entrega", "carencia"]), cred)); }
  function recebido(code) { return r2(sum(ofCode(code, ["paga"]), cred)); }
  function payStatus(code) { var l = liberado(code); if (l <= 0) return "sem"; return l >= state.goal ? "recebe" : "acumula"; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function payOne(code) {
    return apiJSON("/api/admin/coupon-pay", { method: "POST", body: { code: code } })
      .then(function (data) {
        return loadPainel().then(function () { return data.valor; });
      })
      .catch(function (err) {
        toast(err.message || "Não foi possível pagar.");
        return 0;
      });
  }

  function fillVars() {
    var map = { "v-hold": String(state.hold), "v-day": String(state.payDay), "v-goal": brl(state.goal) };
    Object.keys(map).forEach(function (k) {
      Array.prototype.forEach.call(document.querySelectorAll("." + k), function (el) { el.textContent = map[k]; });
    });
  }

  /* ---------- resumo ---------- */
  function renderResumo() {
    var ok = orders.filter(counts);
    var list = infs();
    var recebem = list.filter(function (c) { return payStatus(c.code) === "recebe"; });
    var acumulam = list.filter(function (c) { return payStatus(c.code) === "acumula"; });
    var aPagar = sum(recebem, function (c) { return liberado(c.code); });
    var acum = sum(acumulam, function (c) { return liberado(c.code); });
    var espera = sum(list, function (c) { return emEspera(c.code); });
    var pago = sum(history, function (h) { return h.amt; });
    var nxt = nextPayday();
    $("stats").innerHTML =
      '<div class="tile green"><div class="lbl">Vendido com cupom</div><div class="val">' + brl(sum(ok, paid)) + '</div><div class="sub">' + ok.length + " pedidos pagos</div></div>" +
      '<div class="tile"><div class="lbl">Desconto dado aos clientes</div><div class="val">' + brl(sum(ok, discAmt)) + '</div><div class="sub">já abatido no carrinho</div></div>' +
      '<div class="tile hero"><div class="lbl">A pagar em ' + fmt(nxt) + '</div><div class="val">' + brl(aPagar) + '</div><div class="sub">' + recebem.length + (recebem.length === 1 ? " influenciador bateu" : " influenciadores bateram") + " a meta</div></div>" +
      '<div class="tile"><div class="lbl">Acumulando abaixo da meta</div><div class="val">' + brl(acum) + '</div><div class="sub">' + acumulam.length + (acumulam.length === 1 ? " influenciador" : " influenciadores") + "</div></div>" +
      '<div class="tile"><div class="lbl">Crédito em espera</div><div class="val">' + brl(espera) + '</div><div class="sub">em entrega ou carência</div></div>' +
      '<div class="tile"><div class="lbl">Crédito já pago</div><div class="val">' + brl(pago) + '</div><div class="sub">' + coupons.filter(function (a) { return a.on; }).length + " cupons ativos</div></div>";

    var wait = orders.filter(function (o) { return o.s === "aguardando"; }).length;
    var al = [];
    if (recebem.length) al.push('<a class="alert" href="#pagamento">' + recebem.length + (recebem.length === 1 ? " influenciador recebe" : " influenciadores recebem") + " em " + fmtShort(nxt) + "</a>");
    if (wait) al.push('<a class="alert" href="#pedidos" data-f="aguardando">' + wait + (wait === 1 ? " pedido aguarda pagamento" : " pedidos aguardam pagamento") + "</a>");
    var rel = orders.filter(function (o) { return o.s === "carencia"; }).length;
    if (rel) al.push('<a class="alert" href="#pedidos" data-f="carencia">' + rel + (rel === 1 ? " pedido em espera" : " pedidos em espera") + "</a>");
    $("alerts").innerHTML = al.length ? al.join("") : '<span class="alert calm">Tudo em dia</span>';

    var rows = coupons.map(function (a) { return { a: a, s: sum(ok.filter(function (o) { return o.c === a.code; }), paid) }; }).sort(function (x, y) { return y.s - x.s; });
    var max = rows[0] && rows[0].s ? rows[0].s : 1;
    $("rank").innerHTML = rows.map(function (r) {
      return '<div class="rank-row"><div class="who' + (r.a.on ? "" : " off") + '">' + esc(r.a.name) + ' <span class="code">' + esc(r.a.code) + '</span></div><div class="v">' + brl(r.s) + '</div><div class="bar"><i style="width:' + (r.s / max * 100) + '%"></i></div></div>';
    }).join("");

    $("feed").innerHTML = orders.slice().sort(function (x, y) { return y.id - x.id; }).slice(0, 6).map(function (o) {
      return '<li><div><div class="t">#' + o.id + " · " + esc(o.cu) + '</div><div class="s">' + esc(o.item) + " · pagou " + brl(o.v) + " · <span class=\"code\">" + esc(o.c) + "</span> · " + pill(o.s) + '</div></div><div class="c">' + (o.cr && counts(o) ? brl(cred(o)) : "—") + "</div></li>";
    }).join("");
  }

  /* ---------- cupons ---------- */
  function renderCupons() {
    $("cup-body").innerHTML = coupons.map(function (a) {
      var mine = orders.filter(function (o) { return o.c === a.code; });
      var ok = mine.filter(counts);
      var sub = a.kind === "inf" ? esc(a.city || "—") + " · Pix " + esc(a.pix ? "••••" + a.pix.slice(-4) : "não cadastrado") + "<br>Acesso: " + esc(a.email || "sem e-mail") : "Sem dono, não gera crédito";
      return '<tr class="' + (a.on ? "" : "off") + '"><td><div class="who">' + esc(a.name) + "<small>" + sub + '</small></div><span class="code">' + esc(a.code) + '</span></td><td><span class="pill ' + (a.kind === "inf" ? "inf" : "promo") + '">' + (a.kind === "inf" ? "Influenciador" : "Promocional") + '</span></td><td class="r">' + pct(a.disc) + '</td><td class="r">' + (a.kind === "inf" ? pct(a.credit) : "—") + '</td><td><span class="pill ' + (a.on ? "ativo" : "pausado") + '">' + (a.on ? "Ativo" : "Pausado") + '</span></td><td class="r">' + ok.length + '</td><td class="r sold">' + brl(sum(ok, paid)) + '</td><td class="r">' + (a.kind === "inf" ? brl(liberado(a.code)) : "—") + '</td><td><div class="acts"><button class="btn xs ghost" data-action="toggle" data-code="' + esc(a.code) + '">' + (a.on ? "Pausar" : "Ativar") + "</button>" + (a.kind === "inf" ? '<button class="btn xs ghost" data-action="resetpw" data-code="' + esc(a.code) + '">Nova senha</button>' : "") + "</div></td></tr>";
    }).join("");
    function setv(id, v) { if (document.activeElement !== $(id)) $(id).value = v; }
    setv("r-disc", state.disc * 100); setv("r-credit", state.credit * 100); setv("r-goal", state.goal); setv("r-day", state.payDay); setv("r-hold", state.hold); setv("r-portal", state.portal);
    renderAccess();
    $("r-base").value = state.base;
  }

  /* ---------- acesso do influenciador ---------- */
  function genPass() {
    var al = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", out = "", i, buf;
    try { buf = new Uint32Array(10); crypto.getRandomValues(buf); } catch (e) { buf = null; }
    for (i = 0; i < 10; i++) out += al.charAt((buf ? buf[i] : Math.floor(Math.random() * 1e9)) % al.length);
    return out;
  }
  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
  function accessMsg(x) {
    var a = cp(x.code), L = ["Oi, " + x.name.split(" ")[0] + "! O seu acesso ao portal de influenciadores da Voto já está pronto."];
    if (state.portal) L.push("Portal: " + state.portal);
    L.push("E-mail: " + x.email, "Senha: " + x.pass, "", "Seu cupom: " + x.code + " (" + pct(a.disc) + " de desconto para quem compra e " + pct(a.credit) + " de crédito para você).");
    return L.join("\n");
  }
  function renderAccess() {
    var el = $("access");
    if (!lastAccess) { el.innerHTML = ""; return; }
    var x = lastAccess, msg = accessMsg(x);
    el.innerHTML = '<div class="panel" style="margin-top:22px"><div class="panel-h"><h2>' + (x.reset ? "Nova senha de " : "Acesso criado para ") + esc(x.name) + "</h2><p>Copie e envie agora. A senha não aparece de novo.</p></div>" +
      '<div class="msg" id="acc-msg">' + esc(msg) + '</div>' +
      (state.portal ? "" : '<p class="rules-note">Dica: coloque o link do portal em "Regras de crédito e pagamento" para ele sair na mensagem.</p>') +
      '<div class="acts" style="margin-top:12px"><button class="btn" data-action="copy" data-target="acc-msg">Copiar mensagem</button><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Enviar pelo WhatsApp</a><button class="btn ghost" data-action="closeacc">Fechar</button></div></div>';
  }
  function kindForm() {
    var inf = $("n-kind").value === "inf";
    Array.prototype.forEach.call(document.querySelectorAll("[data-inf]"), function (el) { el.hidden = !inf; });
    $("n-name-l").textContent = inf ? "Nome do influenciador" : "Nome da promoção";
    $("n-name").placeholder = inf ? "Larissa Prado" : "Volta às aulas";
    $("n-disc").value = inf ? state.disc * 100 : 10;
    $("n-credit").value = state.credit * 100;
  }

  /* ---------- pedidos ---------- */
  function renderPedidos() {
    $("filters").innerHTML = FILTERS.map(function (f) {
      var n = f[0] === "todas" ? orders.length : orders.filter(function (o) { return o.s === f[0]; }).length;
      return '<button class="chip" data-action="filter" data-f="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + " " + n + "</button>";
    }).join("");
    var sel = $("f-aff");
    var opts = '<option value="todos">Todos os cupons</option>' + coupons.map(function (a) { return '<option value="' + esc(a.code) + '">' + esc(a.code) + " · " + esc(a.name) + "</option>"; }).join("");
    if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; }
    sel.value = filterAff;
    var list = orders.filter(function (o) { return (filter === "todas" || o.s === filter) && (filterAff === "todos" || o.c === filterAff); }).sort(function (x, y) { return y.id - x.id; });
    $("ledger").innerHTML = list.length ? list.map(function (o) {
      var when = o.s === "carencia" ? '<div class="who"><small>libera em ' + o.rel + "</small></div>" : "";
      var btns = ACTS[o.s].map(function (a) { return '<button class="btn xs ' + a[2] + '" data-action="' + a[0] + '" data-id="' + o.id + '">' + a[1] + "</button>"; }).join("");
      var creditCell = !o.cr ? '<span style="color:var(--muted)">sem dono</span>' : (counts(o) ? brl(cred(o)) + '<div class="who"><small>' + pct(o.cr) + " de " + (o.cb === "list" ? "preço original" : "valor pago") + "</small></div>" : "—");
      return '<tr><td><span class="code">#' + o.id + '</span><div class="who"><small>' + o.d + '</small></div></td><td><span class="code">' + esc(o.c) + '</span></td><td><div class="who">' + esc(o.cu) + "<small>" + esc(o.item) + '</small></div></td><td class="r sold">' + brl(o.v) + '<div class="who"><small>preço ' + brl(o.sub) + " · desconto −" + brl(discAmt(o)) + " (" + pct(o.dr) + ')</small></div></td><td class="r">' + creditCell + "</td><td>" + pill(o.s) + when + '</td><td><div class="acts">' + btns + "</div></td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty">Nenhum pedido nessa seleção.</td></tr>';
  }

  /* ---------- pagamento ---------- */
  function renderPagamento() {
    var list = infs();
    var nxt = nextPayday(), dd = daysUntil(nxt);
    var recebem = list.filter(function (c) { return payStatus(c.code) === "recebe"; });
    var acumulam = list.filter(function (c) { return payStatus(c.code) === "acumula"; });
    var total = sum(recebem, function (c) { return liberado(c.code); });
    $("pay-stats").innerHTML =
      '<div class="tile"><div class="lbl">Próximo pagamento</div><div class="val">' + fmt(nxt) + '</div><div class="sub">' + (dd === 0 ? "é hoje" : dd === 1 ? "amanhã" : "em " + dd + " dias") + "</div></div>" +
      '<div class="tile hero"><div class="lbl">Total a pagar</div><div class="val">' + brl(total) + '</div><div class="sub">' + recebem.length + (recebem.length === 1 ? " influenciador" : " influenciadores") + " na meta</div></div>" +
      '<div class="tile"><div class="lbl">Abaixo da meta</div><div class="val">' + brl(sum(acumulam, function (c) { return liberado(c.code); })) + '</div><div class="sub">acumula para o mês seguinte</div></div>' +
      '<div class="tile"><div class="lbl">Meta mínima</div><div class="val">' + brl(state.goal) + '</div><div class="sub">de crédito liberado</div></div>';
    $("pay-all").disabled = recebem.length === 0;
    $("pay-body").innerHTML = list.map(function (c) {
      var l = liberado(c.code), st = payStatus(c.code);
      var pillHtml = st === "recebe" ? '<span class="pill recebe">Bateu a meta · recebe</span>' : st === "acumula" ? '<span class="pill acumula">Abaixo da meta · acumula</span>' : '<span class="pill sem">Sem crédito liberado</span>';
      var falta = st === "acumula" ? brl(r2(state.goal - l)) : "—";
      var btn = st === "recebe" ? '<button class="btn xs" data-action="payone" data-code="' + esc(c.code) + '">Pagar ' + brl(l) + "</button>" : "";
      return '<tr class="' + (c.on ? "" : "off") + '"><td><div class="who">' + esc(c.name) + '<small><span class="code">' + esc(c.code) + "</span></small></div></td><td>" + esc(c.pix || "—") + '</td><td class="r sold">' + brl(l) + '</td><td class="r">' + brl(emEspera(c.code)) + "</td><td>" + pillHtml + '</td><td class="r">' + falta + '</td><td><div class="acts">' + btn + "</div></td></tr>";
    }).join("");
    $("hist-body").innerHTML = history.length ? history.map(function (h) {
      var c = cp(h.code);
      return "<tr><td>" + h.d + '</td><td><div class="who">' + esc(c ? c.name : h.code) + '<small><span class="code">' + esc(h.code) + '</span></small></div></td><td class="r">' + h.n + '</td><td class="r sold">' + brl(h.amt) + "</td></tr>";
    }).join("") : '<tr><td colspan="4" class="empty">Nenhum pagamento feito ainda.</td></tr>';
  }

  /* ---------- influenciador ---------- */
  function renderAfiliado() {
    var list = infs();
    if (!cp(ME) || cp(ME).kind !== "inf") ME = list[0].code;
    var a = cp(ME);
    var sel = $("me-sel");
    var opts = list.map(function (x) { return '<option value="' + esc(x.code) + '">' + esc(x.name) + " (" + esc(x.code) + ")</option>"; }).join("");
    if (sel.dataset.sig !== opts) { sel.innerHTML = opts; sel.dataset.sig = opts; }
    sel.value = ME;
    var first = a.name.split(" ")[0];
    $("me-h").textContent = "Olá, " + first;
    $("me-p").textContent = (a.city ? "Influenciador da Voto em " + a.city + ". " : "") + "Cada compra com o seu cupom rende crédito para você e desconto para quem compra.";
    $("me-code").textContent = a.code;
    $("me-disc").textContent = pct(a.disc);
    $("me-credit").textContent = pct(a.credit);
    $("me-disc2").textContent = pct(a.disc);
    $("me-credit2").textContent = pct(a.credit);
    var msg = "Oi! Quer material escolar com entrega rápida? Peça na Voto e use o meu cupom " + a.code + " no carrinho para ganhar " + pct(a.disc) + " de desconto.";
    $("me-msg").textContent = msg;
    $("me-share").href = "https://wa.me/?text=" + encodeURIComponent(msg);
    $("mock-code").textContent = a.code;
    $("mock-who").textContent = pct(a.disc) + " de desconto";
    var d = r2(289 * a.disc);
    $("mock-d").textContent = "−" + brl(d);
    $("mock-t").textContent = brl(289 - d);

    var mine = orders.filter(function (o) { return o.c === ME; }).sort(function (x, y) { return y.id - x.id; });
    var lib = liberado(ME), esp = emEspera(ME), got = recebido(ME), total = r2(lib + esp + got);
    var nxt = nextPayday();
    $("avail").textContent = brl(lib);
    $("nxt").textContent = fmt(nxt);
    var p = Math.min(lib / state.goal * 100, 100);
    $("goal").innerHTML = '<div class="row"><span>Meta para receber</span><b>' + brl(lib) + " de " + brl(state.goal) + '</b></div><div class="bar"><i style="width:' + p + '%"></i></div>';
    var flag;
    if (lib >= state.goal && lib > 0) flag = '<p class="flag">Meta batida. Você recebe ' + brl(lib) + " por Pix no dia " + fmt(nxt) + ".</p>";
    else if (lib > 0) flag = '<p class="flag warn">Faltam ' + brl(r2(state.goal - lib)) + " para a meta. Nada se perde: o valor acumula e vale para o próximo pagamento." + (esp > 0 ? " Mais " + brl(esp) + " estão em espera e podem ajudar a bater a meta." : "") + "</p>";
    else flag = '<p class="empty" style="margin-top:12px">Quando o crédito dos seus pedidos for liberado, ele aparece aqui.</p>';
    $("pay-flag").innerHTML = flag;
    $("mini").innerHTML =
      '<div><div class="lbl">Em espera ou entrega</div><div class="v">' + brl(esp) + "</div></div>" +
      '<div><div class="lbl">Já recebido</div><div class="v">' + brl(got) + "</div></div>" +
      '<div><div class="lbl">Total de crédito</div><div class="v">' + brl(total) + "</div></div>";

    var okMine = mine.filter(counts);
    $("me-stats").innerHTML =
      '<div class="tile green"><div class="lbl">Vendido com o seu cupom</div><div class="val">' + brl(sum(okMine, paid)) + "</div></div>" +
      '<div class="tile"><div class="lbl">Pedidos pagos</div><div class="val">' + okMine.length + "</div></div>" +
      '<div class="tile"><div class="lbl">Desconto dado a quem você indicou</div><div class="val">' + brl(sum(okMine, discAmt)) + "</div></div>";

    $("me-orders").innerHTML = mine.length ? mine.map(function (o) {
      return '<li><div><div class="t">Pedido #' + o.id + " · " + esc(o.item) + '</div><div class="s">' + o.d + " · cliente pagou " + brl(o.v) + " · " + pill(o.s) + '</div></div><div class="c">' + (counts(o) ? "+" + brl(cred(o)) : "—") + "</div></li>";
    }).join("") : '<li class="empty">Nenhum pedido ainda. Divulgue o seu cupom para começar.</li>';
    calc();
  }
  function calc() {
    var a = cp(ME) || { disc: state.disc, credit: state.credit };
    var v = Number($("calc").value);
    var pay = r2(v * (1 - a.disc));
    $("calc-v").textContent = brl(v);
    $("calc-p").textContent = brl(pay);
    $("calc-o").textContent = brl(r2((state.base === "list" ? v : pay) * a.credit));
  }

  /* ---------- simulador ---------- */
  function simSub() { return KITS[$("s-kit").value].v; }
  function simTotals() {
    var sub = simSub();
    var a = applied ? cp(applied) : null;
    var d = a ? r2(sub * a.disc) : 0;
    $("s-totals").innerHTML =
      '<div class="tl"><span>Subtotal</span><span class="num">' + brl(sub) + "</span></div>" +
      (a ? '<div class="tl disc"><span>Cupom ' + esc(a.code) + " (" + pct(a.disc) + ')</span><span class="num">−' + brl(d) + "</span></div>" : "") +
      '<div class="tl total"><span>Total</span><span class="num">' + brl(sub - d) + "</span></div>";
  }
  function setMsg(t, kind) { var m = $("s-msg"); m.textContent = t; m.className = kind || ""; }
  function applyCoupon() {
    var code = $("s-coupon").value.trim().toUpperCase().replace(/\s+/g, "");
    $("s-coupon").value = code;
    if (!code) { applied = null; setMsg("", ""); simTotals(); return true; }
    var a = cp(code);
    if (!a) { applied = null; setMsg("Cupom não encontrado.", "bad"); simTotals(); return false; }
    if (!a.on) { applied = null; setMsg("Esse cupom está pausado.", "bad"); simTotals(); return false; }
    applied = code;
    setMsg("Cupom aplicado: " + pct(a.disc) + " de desconto.", "good");
    simTotals();
    return true;
  }
  var chatTimers = [];
  function simulate() {
    var raw = $("s-coupon").value.trim();
    if (raw && (!applied || applied !== raw.toUpperCase().replace(/\s+/g, ""))) {
      if (!applyCoupon()) return toast("Aplique um cupom válido ou apague o campo para seguir.");
    }
    chatTimers.forEach(clearTimeout); chatTimers = [];
    var name = $("s-name").value.trim() || "cliente";
    var kit = KITS[$("s-kit").value];
    var city = $("s-city").value;
    var a = applied ? cp(applied) : null;
    var sub = kit.v, d = a ? r2(sub * a.disc) : 0, total = sub - d;
    var chat = $("chat");
    chat.innerHTML = "";
    var order = { id: nextId++, c: a ? a.code : "—", item: kit.n, sub: sub, dr: a ? a.disc : 0, cr: a && a.kind === "inf" ? a.credit : 0, cb: state.base, v: total, s: "aguardando", d: fmtShort(new Date()), cu: name };
    var msgs = [];
    msgs.push(["me", "Olá! Quero fazer o pedido:\n• " + kit.n + " — " + brl(sub) + (a ? "\nCupom " + a.code + " (" + pct(a.disc) + "): −" + brl(d) : "") + "\nTotal: " + brl(total) + "\nCidade: " + city]);
    msgs.push(["ia", "Oi, " + name + "! Recebi o seu pedido de " + brl(total) + (a ? ", com o desconto do cupom já aplicado" : "") + ". Como você prefere pagar? Pode ser Pix, com código ou QR Code."]);
    if (a) msgs.push(["sys", "Pedido #" + order.id + " registrado · " + brl(total) + " (desconto " + brl(d) + ")" + (a.kind === "inf" ? " · crédito de " + brl(r2((state.base === "list" ? sub : total) * a.credit)) + " para " + a.name.split(" ")[0] : " · cupom promocional, sem crédito")]);
    else msgs.push(["sys", "Pedido #" + order.id + " registrado · " + brl(total) + " · sem cupom"]);
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    msgs.forEach(function (m, i) {
      function add() {
        var el = document.createElement("div");
        el.className = "bub " + m[0];
        el.textContent = m[1];
        chat.appendChild(el);
        chat.scrollTop = chat.scrollHeight;
        if (i === msgs.length - 1) {
          if (order.c !== "—") { orders.push(order); render(); toast("Pedido #" + order.id + " criado. Confirme o pagamento em Pedidos."); }
          else toast("Pedido #" + order.id + " sem cupom. Esta tela só lista pedidos com cupom.");
        }
      }
      if (reduce) add(); else chatTimers.push(setTimeout(add, i * 700));
    });
  }

  function render() { fillVars(); renderResumo(); renderCupons(); renderPedidos(); renderPagamento(); renderAfiliado(); }

  var tt;
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2800); }
  function copyText(id) {
    var text = $(id).textContent.trim();
    function fb() { var r = document.createRange(); r.selectNodeContents($(id)); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selecionado. Use copiar do aparelho."); }
    try { navigator.clipboard.writeText(text).then(function () { toast("Copiado"); }, fb); } catch (e) { fb(); }
  }
  function genCode(name, pctNum) {
    var base = name.split(/\s+/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (base.length < 3) base = "VOTO";
    var n = Math.round(pctNum);
    if (!cp(base + n)) return base + n;
    for (var i = 2; i < 100; i++) { var c = base + n + "_" + i; if (!cp(c)) return c; }
    return base + Date.now() % 1000;
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-action]");
    if (!t) { var al = e.target.closest("a[data-f]"); if (al) { filter = al.dataset.f; filterAff = "todos"; } return; }
    var act = t.dataset.action, id = Number(t.dataset.id), code = t.dataset.code;
    function find() { return orders.filter(function (o) { return o.id === id; })[0]; }
    if (act === "copy") return copyText(t.dataset.target);
    if (act === "genpass") { $("n-pass").value = genPass(); return; }
    if (act === "filter") { filter = t.dataset.f; }
    else if (act === "pay" || act === "deliver" || act === "release" || act === "cancel") {
      apiJSON("/api/admin/coupon-orders/" + id, { method: "PATCH", body: { acao: act } })
        .then(function () { return loadPainel(); })
        .then(function () { toast(act === "pay" ? "Pagamento confirmado. Pedido em entrega." : act === "deliver" ? "Entregue." : act === "release" ? "Crédito liberado." : "Pedido cancelado. Sem crédito."); })
        .catch(function (err) { toast(err.message || "Não foi possível atualizar o pedido."); });
      return;
    }
    else if (act === "closeacc") { lastAccess = null; }
    else if (act === "resetpw") {
      var ra = cp(code);
      if (!ra) return;
      var newPass = genPass();
      apiJSON("/api/admin/coupons/" + encodeURIComponent(code) + "/reset-senha", { method: "POST", body: { senha: newPass } })
        .then(function () {
          lastAccess = { name: ra.name, code: code, email: ra.email || "", pass: newPass, reset: true };
          toast("Nova senha gerada para " + ra.name.split(" ")[0] + ". Copie e envie.");
          try { window.scrollTo(0, 0); } catch (e) {}
        })
        .catch(function (err) { toast(err.message || "Não foi possível gerar a nova senha."); });
      return;
    }
    else if (act === "toggle") {
      var a = cp(code);
      if (!a) return;
      apiJSON("/api/admin/coupons/" + encodeURIComponent(code), { method: "PUT", body: { kind: a.kind, nome: a.name, email: a.email, cidade: a.city, pix: a.pix, pixTipo: a.pixTipo, desconto: a.disc, credito: a.credit, ativo: !a.on } })
        .then(function () { return loadPainel(); })
        .then(function () { toast("Cupom " + code + (a.on ? " pausado." : " ativado.")); })
        .catch(function (err) { toast(err.message || "Não foi possível alterar o cupom."); });
      return;
    }
    else if (act === "payone") {
      payOne(code).then(function (v) { toast(v ? brl(v) + " pagos para " + code : "Esse influenciador ainda não bateu a meta."); });
      return;
    }
    else if (act === "payall") {
      var tot = 0, n = 0;
      var targets = infs().filter(function (c) { return payStatus(c.code) === "recebe"; });
      var chain = Promise.resolve();
      targets.forEach(function (c) {
        chain = chain.then(function () { return payOne(c.code); }).then(function (v) { if (v) { tot = r2(tot + v); n++; } });
      });
      chain.then(function () { toast(n ? brl(tot) + " pagos para " + n + (n === 1 ? " influenciador" : " influenciadores") : "Ninguém bateu a meta ainda."); });
      return;
    }
    render();
  });

  $("n-kind").addEventListener("change", kindForm);
  $("new-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var kind = $("n-kind").value, inf = kind === "inf";
    var name = $("n-name").value.trim();
    var code = $("n-code").value.trim().toUpperCase().replace(/\s+/g, "");
    var disc = Number($("n-disc").value), credit = Number($("n-credit").value);
    if (!name) return;
    if (!(disc > 0 && disc <= 50)) return toast("O desconto precisa ficar entre 1% e 50%.");
    if (inf && !(credit >= 0 && credit <= 30)) return toast("O crédito precisa ficar entre 0% e 30%.");
    if (code && !/^[A-Z0-9]{4,14}$/.test(code)) return toast("O código precisa ter de 4 a 14 letras ou números.");
    if (code && cp(code)) return toast("Esse código já existe. Escolha outro.");
    var email = inf ? $("n-email").value.trim().toLowerCase() : "", pass = inf ? $("n-pass").value : "";
    if (inf && !emailOk(email)) return toast("Digite o e-mail de acesso do influenciador.");
    if (inf && coupons.some(function (c) { return c.email === email; })) return toast("Já existe um acesso com esse e-mail.");
    if (inf && pass.length < 8) return toast("A senha precisa ter pelo menos 8 caracteres. Use o botão Gerar.");
    apiJSON("/api/admin/coupons", {
      method: "POST",
      body: {
        code: code || null, kind: kind, nome: name, email: email || null,
        cidade: inf ? $("n-city").value.trim() : "", pix: inf ? $("n-pix").value.trim() : "",
        desconto: disc / 100, credito: inf ? credit / 100 : 0,
        senha: inf ? pass : null, ativo: true,
      },
    })
      .then(function (data) {
        var created = data.cupom || { code: code };
        lastAccess = inf ? { name: name, code: created.code, email: email, pass: pass } : null;
        return loadPainel().then(function () {
          toast(inf ? "Cupom " + created.code + " e acesso criados. Copie a mensagem para enviar." : "Cupom " + created.code + " criado: " + pct(disc / 100) + " de desconto");
        });
      })
      .then(function () { e.target.reset(); kindForm(); })
      .catch(function (err) { toast(err.message || "Não foi possível criar o cupom."); });
  });
  $("rules-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var d = Number($("r-disc").value), c = Number($("r-credit").value), g = Number($("r-goal").value), day = Number($("r-day").value), h = Number($("r-hold").value);
    if (!(d >= 0 && d <= 50) || !(c >= 0 && c <= 30)) return toast("Confira o desconto e o crédito.");
    if (!(g >= 0)) return toast("A meta mínima precisa ser zero ou mais.");
    if (!(day >= 1 && day <= 31 && Math.floor(day) === day)) return toast("O dia do pagamento precisa ficar entre 1 e 31.");
    if (!(h >= 0 && h <= 60 && Math.floor(h) === h)) return toast("A carência precisa ficar entre 0 e 60 dias.");
    apiJSON("/api/admin/coupon-rules", {
      method: "PUT",
      body: {
        descontoPadrao: d / 100, creditoPadrao: c / 100, meta: g, diaPagamento: day,
        carencia: h, portalUrl: $("r-portal").value.trim(),
      },
    })
      .then(function () { return loadPainel(); })
      .then(function () { toast("Regras salvas. A carência vale para as próximas entregas."); })
      .catch(function (err) { toast(err.message || "Não foi possível salvar as regras."); });
  });
  $("f-aff").addEventListener("change", function () { filterAff = this.value; render(); });
  $("me-sel").addEventListener("change", function () { ME = this.value; render(); });
  $("calc").addEventListener("input", calc);
  $("s-kit").addEventListener("change", simTotals);
  $("s-apply").addEventListener("click", applyCoupon);
  $("s-coupon").addEventListener("input", function () { if (applied) { applied = null; setMsg("", ""); simTotals(); } });
  $("s-coupon").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } });
  $("s-go").addEventListener("click", simulate);

  function route() {
    var v = location.hash.replace("#", "");
    if (["resumo", "cupons", "pedidos", "pagamento", "simulador", "afiliado"].indexOf(v) < 0) v = "resumo";
    Array.prototype.forEach.call(document.querySelectorAll("[data-view]"), function (s) { s.hidden = s.dataset.view !== v; });
    Array.prototype.forEach.call(document.querySelectorAll(".nav a"), function (a) { if (a.dataset.v === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  window.addEventListener("hashchange", route);
  loadPainel(function (ok) {
    if (!ok) { showPublic(); return; }
    kindForm(); applyCoupon(); route();
  });
})();
