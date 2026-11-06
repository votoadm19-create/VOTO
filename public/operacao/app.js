/* =====================================================================
   VOTO OPERAÇÃO. NOTAS PARA OS PROGRAMADORES

   Protótipo: os dados ficam na memória do navegador e somem ao recarregar.

   PERSONALIZAÇÃO
   personalization_levels : nome, desc (quantidade de itens), preco. Editável na aba Ajustes.
   orders.perso           : { i, nivel, desc, preco, nota } ou null.
     O preço do nível é copiado para o pedido na hora da escolha. Mudar o preço
     em Ajustes não altera pedidos que já foram personalizados.
   ITENS ADICIONADOS AO PEDIDO
   order_lines.add = true para itens incluídos depois do pedido feito. Item do
   catálogo (pid) baixa estoque; item avulso (pid = null) não mexe em estoque.
   Se o pedido ainda está em "A separar", o estoque só baixa quando começar a separar.
   Depois disso, o estoque baixa na hora em que o item entra no pedido.
   TOTAL
   total = soma(itens) + preço da personalização + taxa de entrega
   O servidor deve recalcular o total a cada alteração. A comanda sempre lê o total atual.
   Pedido "Entregue" não pode mais ser alterado.
   ===================================================================== */
/* ---------- galpões ---------- */
var HUBS = {};
var FIN = {};
var HUB_ID = {};
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
var CATMAP = { "kit-f": "Kits", "kit-m": "Kits", "material": "Papelaria", "papelaria": "Papelaria", "mochilas": "Mochilas", "fem": "Moda", "masc": "Moda" };
function catLabel(id) { return CATMAP[id] || id; }
function catKey(label) { for (var k in CATMAP) if (CATMAP[k] === label) return k; return "material"; }
function hubNameById(id) { for (var n in HUB_ID) if (String(HUB_ID[n]) === String(id)) return n; return ""; }
function pair(lines) { return lines.map(function (l) { return { pid: l.pid || null, nome: l.nome, qtd: l.q, preco: l.preco }; }); }
function padj(orderId, items, perso, msgId) {
  return apiJSON("/api/operacao/orders/" + orderId, { method: "PUT", body: { items: items, perso: perso } })
    .then(function () { return loadOrdersOnly(); })
    .then(function () {
      flash = { id: msgId || "ai-msg", text: "Pedido atualizado.", cls: "good" };
      render();
    })
    .catch(function (err) { flash = { id: msgId || "ai-msg", text: err && err.message ? err.message : "Não foi possível atualizar.", cls: "bad" }; render(); });
}
function mapOrders(rows) {
  var costByPid = {};
  PRODUCTS.forEach(function (pp) { costByPid[String(pp.id)] = pp.custo || 0; });
  return rows.map(function (o) {
    var lines = (o.items || []).map(function (it) {
      return { pid: it.pid || null, nome: it.nome, q: it.qtd || 1, preco: it.preco, custo: costByPid[String(it.pid)] || 0, add: false };
    });
    var t = "";
    if (o.criado_em) t = String(o.criado_em).slice(11, 16);
    return {
      id: o.id, hub: hubNameById(o.hub_id) || "Sem galpão", name: o.name || "Cliente",
      area: o.cidade || "", lines: lines, val: o.subtotal, taxa: o.frete || 0,
      desc: o.desconto || 0, total: o.total, out: "--", pay: "Pix", addr: "",
      mins: 0, st: o.op_status || "novo", t: t, criado_em: o.criado_em || "",
      perso: o.perso ? { i: -1, nivel: o.perso.nivel, desc: o.perso.desc, preco: o.perso.preco, nota: o.perso.nota || "" } : null,
    };
  });
}
function loadOrdersOnly() {
  return apiJSON("/api/operacao/orders").then(function (rows) {
    ORDERS = mapOrders(rows);
    return ORDERS;
  });
}
function loadStockOnly() {
  return apiJSON("/api/operacao/stock").then(function (rows) {
    var byId = {};
    PRODUCTS.forEach(function (pp) { byId[String(pp.id)] = pp; });
    rows.forEach(function (r) {
      var pr = byId[String(r.id)];
      if (!pr) return;
      pr.custo = r.custo == null ? 0 : r.custo;
      pr.min = r.min || 0;
      pr.preco = r.preco;
      pr.est = pr.est || {};
      var hn = hubNameById(r.hub_id);
      if (hn && r.qtd != null) pr.est[hn] = r.qtd;
    });
    return PRODUCTS;
  });
}
function loadAll() {
  return apiJSON("/api/operacao/hubs")
    .then(function (hubs) {
      HUBS = {}; FIN = {}; HUB_ID = {};
      hubs.forEach(function (h) {
        var serve = [], taxas = {};
        (h.cidades || []).forEach(function (c) { serve.push(c.cidade); taxas[c.cidade] = c.taxa; });
        HUBS[h.nome] = { serve: serve, taxas: taxas, cmv: h.cmv, ent: h.ent, imp: h.imp, fixo: h.fixo, fat: 0, w: [100] };
        HUB_ID[h.nome] = h.id;
      });
      var chain = Promise.resolve();
      Object.keys(HUBS).forEach(function (name) {
        chain = chain.then(function () {
          return apiJSON("/api/operacao/financeiro?hub_id=" + HUB_ID[name]).then(function (f) {
            var pagar = (f.cmv || 0) + (f.ent || 0) + (f.imp || 0) + (f.fixo || 0);
            FIN[name] = { fat: f.fat || 0, prod: f.cmv || 0, ent: f.ent || 0, imp: f.imp || 0, fixo: f.fixo || 0, pagar: pagar, lucro: f.lucro || 0, margem: f.fat ? (f.lucro || 0) / f.fat * 100 : 0, entregas: f.pedidos || 0 };
          });
        });
      });
      return chain;
    })
    .then(function () { return apiJSON("/api/operacao/products"); })
    .then(function (prods) {
      PRODUCTS = prods.map(function (pp) {
        return { id: pp.id, nome: pp.nome, catId: pp.cat, cat: catLabel(pp.cat), custo: 0, preco: pp.preco, min: 0, est: {}, estGlobal: pp.estoque || 0, foto: pp.foto || null };
      });
      return apiJSON("/api/operacao/perso");
    })
    .then(function (perso) {
      PERSO = (perso || []).map(function (x) { return { nome: x.nome, desc: x.desc, preco: x.preco }; });
      return loadStockOnly();
    })
    .then(function () { return loadOrdersOnly(); })
    .catch(function () {});
}
var DIAS = 28, TICKET = 165;
var STEPS = [
  { key: "novo", label: "A separar", next: "Começar a separar" },
  { key: "sep",  label: "Separando", next: "Marcar saiu para entrega" },
  { key: "rota", label: "Em rota",   next: "Marcar como entregue" },
  { key: "ok",   label: "Entregue",  next: null }
];
var PILL = { novo: "s-novo", sep: "s-sep", rota: "s-rota", ok: "s-ok" };
var CATS = ["Kits", "Mochilas", "Papelaria", "Moda"];

/* Níveis de personalização. O dono edita nome, descrição e preço na aba Ajustes.
   O preço fica gravado no pedido na hora em que o nível é escolhido. */
var PERSO = [];
var PERSO_NOTAS = ["Nome do aluno (Pedro Henrique) nos cadernos e na mochila", "Nome Ana Clara em todos os itens", "Nome e turma (3º B) nas etiquetas"];

/* ---------- estoque (exemplo) ---------- */
var PRODUCTS = [];
var nextPid = 15;

var ORDERS = [];

/* ---------- helpers ---------- */
function brl(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }); }
function brl2(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function pct(v) { return v.toFixed(1).replace(".", ",") + "%"; }
function num(v) { return v.toLocaleString("pt-BR"); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
function div(a, b) { return b ? a / b : 0; }
function stepIndex(k) { for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === k) return i; return 0; }
function parseMoney(s) { var v = parseFloat(String(s).replace(/\./g, "").replace(",", ".")); return isNaN(v) ? NaN : v; }
function parseMoneySimple(s) { s = String(s).trim(); if (s.indexOf(",") === -1) { var v = parseFloat(s); return isNaN(v) ? NaN : v; } return parseMoney(s); }
function stockOf(p, city) {
  if (city === "Todas") return Object.keys(p.est).reduce(function (a, h) { return a + (p.est[h] || 0); }, 0);
  return p.est[city] || 0;
}
function hubList() { return Object.keys(HUBS); }
function orderProfit(o) { return o.lines.reduce(function (a, l) { return a + l.q * (l.preco - l.custo); }, 0); }
function persoVal(o) { return o.perso ? o.perso.preco : 0; }
function recalc(o) {
  o.val = o.lines.reduce(function (a, l) { return a + l.q * l.preco; }, 0);
  o.total = o.val - (o.desc || 0) + persoVal(o) + (o.taxa || 0);
}
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function orderCost(o) { return o.lines.reduce(function (a, l) { return a + l.q * l.custo; }, 0); }

function fin(h) {
  return FIN[h] || { fat: 0, prod: 0, ent: 0, imp: 0, fixo: 0, pagar: 0, lucro: 0, margem: 0, entregas: 0 };
}
function finAll() {
  var t = { fat: 0, prod: 0, ent: 0, imp: 0, fixo: 0, pagar: 0, lucro: 0, entregas: 0 };
  hubList().forEach(function (h) { var f = fin(h); for (var k in t) t[k] += f[k]; });
  t.margem = div(t.lucro, t.fat) * 100;
  return t;
}

/* ---------- estado ---------- */
var cityNow = "Todas", viewNow = "op", statusNow = "todos", openId = null, shown = 12;
var selDay = new Date().getDate(), allDays = false;
var openP = null, formOpen = false, query = "", pendingMsg = "", addSel = "", flash = null;
var pending = [], newRows = [{ nome: "", taxa: "" }], newName = "";
function inCity(o) { return cityNow === "Todas" || o.hub === cityNow; }

/* ---------- cabeçalho e abas ---------- */
function renderTabs() {
  var pend = function (h) { return ORDERS.filter(function (o) { return (h === "Todas" || o.hub === h) && o.st === "novo"; }).length; };
  var html = "";
  ["Todas"].concat(hubList()).forEach(function (c) {
    var n = pend(c);
    html += '<button class="tab" role="tab" data-city="' + esc(c) + '" aria-selected="' + (c === cityNow) + '">' + (c === "Todas" ? "Todas as cidades" : esc(c)) + (n ? '<span class="n">' + n + "</span>" : "") + "</button>";
  });
  html += '<button class="tab dash" role="tab" data-city="+" aria-selected="' + (cityNow === "+") + '">+ Nova cidade</button>';
  document.getElementById("tabs").innerHTML = html;
}
function renderHead() {
  var t = document.getElementById("title"), s = document.getElementById("sub"), seg = document.getElementById("seg");
  if (cityNow === "+") { t.textContent = "Nova cidade"; s.textContent = "Cadastre um galpão, as cidades que ele atende e a taxa de entrega de cada uma."; seg.hidden = true; return; }
  seg.hidden = false;
  if (cityNow === "Todas") { t.textContent = "Todas as cidades"; s.textContent = "Faturamento e lucro de todos os galpões juntos. Esta visão é só do dono."; }
  else { t.textContent = "Galpão " + cityNow; s.textContent = "Atende " + HUBS[cityNow].serve.join(" e "); }
  var names = { op: "Pedidos", est: "Estoque", dia: "Calendário", fin: "Financeiro", aj: "Ajustes" };
  seg.innerHTML = ["op", "est", "dia", "fin", "aj"].map(function (k) { return '<button data-view="' + k + '" aria-pressed="' + (viewNow === k) + '">' + names[k] + "</button>"; }).join("");
}

/* ---------- pedidos ---------- */
function opView() {
  var mine = ORDERS.filter(inCity);
  var cnt = function (k) { return mine.filter(function (o) { return o.st === k; }).length; };
  var sold = mine.reduce(function (a, o) { return a + o.total; }, 0);
  var lucro = mine.reduce(function (a, o) { return a + orderProfit(o); }, 0);
  var html = '<div class="hero"><span class="lb">Vendido hoje · ' + (cityNow === "Todas" ? "todas as cidades" : "galpão " + esc(cityNow)) + "</span>" +
    '<span class="money">' + brl(sold) + "</span>" +
    '<span class="ord">em <b>' + num(mine.length) + "</b> pedidos até agora</span>" +
    '<span class="lucro">Lucro nos produtos: <b>' + brl(lucro) + "</b></span></div>" +
    '<div class="stats" style="margin-top:12px">' +
    '<div class="stat hot"><b>' + num(cnt("novo")) + "</b><span>a separar</span></div>" +
    '<div class="stat"><b>' + num(cnt("sep") + cnt("rota")) + "</b><span>em andamento</span></div>" +
    '<div class="stat"><b>' + num(cnt("ok")) + "</b><span>entregues</span></div></div>";
  if (!mine.length) {
    var sv = cityNow === "Todas" ? "" : HUBS[cityNow].serve.join(" e ");
    return html + '<div class="empty" style="margin-top:20px">Ainda sem pedidos neste galpão.' + (sv ? " Quando o site receber um pedido de " + esc(sv) + ", ele aparece aqui." : "") + "</div>";
  }
  var opts = [{ k: "todos", l: "Todos" }].concat(STEPS.map(function (s) { return { k: s.key, l: s.label }; }));
  html += '<div class="filters" style="margin-top:20px">' + opts.map(function (o) {
    return '<button class="chip" data-st="' + o.k + '" aria-pressed="' + (o.k === statusNow) + '">' + o.l + "</button>";
  }).join("") + "</div>";
  var rows = mine.filter(function (o) { return statusNow === "todos" || o.st === statusNow; });
  html += '<div class="list" style="margin-top:12px">';
  if (!rows.length) html += '<div class="empty">Nenhum pedido nesta situação.</div>';
  rows.slice(0, shown).forEach(function (o) {
    var step = STEPS[stepIndex(o.st)], open = o.id === openId, detail = "";
    if (open) detail = orderDetail(o, step);
    html += '<article class="order"><button class="row" data-open="' + o.id + '" aria-expanded="' + open + '">' +
      '<span class="who">' + esc(o.name) + '<span class="id">#' + o.id + "</span>" + (cityNow === "Todas" ? '<span class="tag">' + esc(o.hub) + "</span>" : "") + (o.perso ? '<span class="tag pers">Personalizado</span>' : "") + "</span>" +
      '<span class="val">' + brl2(o.total) + "</span>" +
      '<span class="meta">' + esc(o.area) + " · saída " + o.out + " · " + o.t + "</span>" +
      '<span class="pill ' + PILL[o.st] + '">' + step.label + "</span></button>" + detail + "</article>";
  });
  if (rows.length > shown) html += '<button class="more" data-more="1">Ver mais pedidos (' + num(rows.length - shown) + ")</button>";
  return html + "</div>";
}


/* ---------- detalhe do pedido, alteração e personalização ---------- */
function orderDetail(o, step) {
  var lucroP = orderProfit(o), editable = o.st !== "ok";
  var lines = o.lines.map(function (l, i) {
    return '<div class="ln"><span>' + l.q + "× " + esc(l.nome) + (l.add ? '<span class="tag add">adicionado</span>' : "") +
      (l.add && editable ? '<button class="rm" data-rmline="' + o.id + ":" + i + '" aria-label="Remover ' + esc(l.nome) + '">remover</button>' : "") +
      "</span><span>" + brl2(l.q * l.preco) + "</span></div>";
  }).join("");
  var perso = o.perso ? '<div class="ln"><span>Personalização · ' + esc(o.perso.nivel) + "</span><span>" + brl2(o.perso.preco) + "</span></div>" +
    '<div class="pnote">' + esc(o.perso.desc) + (o.perso.nota ? " · " + esc(o.perso.nota) : "") + "</div>" : "";
  var html = '<div class="detail"><dl><dt>Entrega em</dt><dd>' + esc(o.area) + "</dd><dt>Endereço</dt><dd>" + esc(o.addr) +
    "</dd><dt>Saída</dt><dd>Motoboy das " + o.out + "</dd><dt>Pagamento</dt><dd>" + o.pay + " confirmado</dd></dl>" +
    '<div class="lines">' + lines +
    '<div class="ln"><span>Produtos</span><span>' + brl2(o.val) + "</span></div>" +
    (o.desc ? '<div class="ln"><span>Desconto de cupom</span><span>-' + brl2(o.desc) + "</span></div>" : "") +
    perso +
    '<div class="ln"><span>Entrega · ' + esc(o.area) + "</span><span>" + (o.taxa ? brl2(o.taxa) : "Grátis") + "</span></div>" +
    '<div class="ln sum"><span>Total</span><span>' + brl2(o.total) + "</span></div>" +
    '<div class="ln profit"><span>Lucro nos produtos (' + pct(div(lucroP, o.val) * 100) + ")</span><span>" + brl2(lucroP) + "</span></div></div>";
  html += editable ? editPanel(o) : '<div class="locked">Pedido entregue. Não dá mais para alterar.</div>';
  html += '<div class="btns">' + (step.next ? '<button class="go" data-adv="' + o.id + '">' + step.next + "</button>" : '<div class="done">Pedido entregue</div>') +
    '<button class="ghost" data-print="' + o.id + '">Imprimir pedido</button></div></div>';
  return html;
}
function editPanel(o) {
  var chips = '<button class="pchip" data-perso="' + o.id + ':none" aria-pressed="' + (!o.perso) + '">Sem personalização<small>R$ 0</small></button>' +
    PERSO.map(function (p, i) {
      return '<button class="pchip" data-perso="' + o.id + ":" + i + '" aria-pressed="' + (!!o.perso && o.perso.i === i) + '">' + esc(p.nome) + "<small>" + brl2(p.preco) + "</small></button>";
    }).join("");
  var opts = PRODUCTS.map(function (p) { return '<option value="' + p.id + '"' + (String(p.id) === String(addSel) ? " selected" : "") + ">" + esc(p.nome) + " · " + brl2(p.preco) + "</option>"; }).join("") +
    '<option value="novo"' + (addSel === "novo" ? " selected" : "") + ">Outro item (digitar nome e preço)</option>";
  var custom = addSel === "novo" ?
    '<div class="field full"><label for="ai-nome">Nome do item</label><input id="ai-nome" type="text" autocomplete="off" placeholder="Ex.: Pasta catálogo"></div>' +
    '<div class="field"><label for="ai-preco">Preço de venda</label><input id="ai-preco" type="text" inputmode="decimal" placeholder="0,00"></div>' +
    '<div class="field"><label for="ai-custo">Custo (opcional)</label><input id="ai-custo" type="text" inputmode="decimal" placeholder="0,00"></div>' : "";
  return '<div class="edit"><h4>Alterar pedido</h4>' +
    '<div class="elabel">Personalização</div><div class="pchips">' + chips + "</div>" +
    (o.perso ? '<div class="stock-by">' + esc(o.perso.desc) + '</div><div class="field"><label for="pn-note">O que personalizar</label><input id="pn-note" type="text" autocomplete="off" value="' + esc(o.perso.nota || "") + '" placeholder="Ex.: nome Pedro nos cadernos e na mochila"><small>Sai na comanda, em destaque.</small></div>' : "") +
    '<div class="elabel">Adicionar item</div><div class="form">' +
    '<div class="field full"><label for="ai-prod">Produto</label><select id="ai-prod">' + opts + "</select></div>" + custom +
    '<div class="field"><label for="ai-qtd">Quantidade</label><input id="ai-qtd" type="text" inputmode="numeric" value="1"></div>' +
    '<div class="field"><label>&nbsp;</label><button class="go" data-addline="' + o.id + '">Adicionar ao pedido</button></div>' +
    '<div class="msg" id="ai-msg" style="grid-column:1/-1"></div></div></div>';
}
function findOrder(id) { var r = null; ORDERS.forEach(function (x) { if (x.id === id) r = x; }); return r; }
function stockAdjust(o, pid, delta) { PRODUCTS.forEach(function (p) { if (p.id === pid) p.est[o.hub] = Math.max(0, (p.est[o.hub] || 0) + delta); }); }

/* ---------- ajustes: valores de personalização ---------- */
function ajView() {
  var pers = ORDERS.filter(function (o) { return o.perso; });
  var receita = pers.reduce(function (a, o) { return a + o.perso.preco; }, 0);
  var rows = PERSO.map(function (p, i) {
    return '<div class="lvl"><h3>Nível ' + (i + 1) + '</h3><div class="form">' +
      '<div class="field"><label for="lv-nome-' + i + '">Nome</label><input id="lv-nome-' + i + '" type="text" autocomplete="off" value="' + esc(p.nome) + '"></div>' +
      '<div class="field"><label for="lv-preco-' + i + '">Preço (R$)</label><input id="lv-preco-' + i + '" type="text" inputmode="decimal" value="' + p.preco.toFixed(2).replace(".", ",") + '"></div>' +
      '<div class="field full"><label for="lv-desc-' + i + '">Quantidade de itens</label><input id="lv-desc-' + i + '" type="text" autocomplete="off" value="' + esc(p.desc) + '"><small>Aparece para você ao escolher o nível no pedido e na comanda.</small></div></div></div>';
  }).join("");
  return '<div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><b>' + num(pers.length) + "</b><span>pedidos personalizados hoje</span></div>" +
    '<div class="stat grn"><b class="sm">' + brl2(receita) + "</b><span>cobrado em personalização</span></div></div>" +
    '<div class="card" style="margin-top:16px"><h2>Valores de personalização</h2>' +
    '<div class="stock-by">O nível diz quantos itens do pedido serão personalizados. Mude o preço quando precisar.</div>' + rows +
    '<div class="msg" id="lv-msg"></div><button class="go" data-lvsave="1">Salvar valores</button>' +
    '<div class="stock-by">Pedidos novos usam os valores salvos. Pedidos que já foram personalizados mantêm o preço combinado.</div></div>';
}

/* ---------- estoque ---------- */
function estView() {
  var all = cityNow === "Todas";
  var low = 0, parado = 0;
  PRODUCTS.forEach(function (p) { var s = stockOf(p, cityNow); if (s <= p.min) low++; parado += s * p.custo; });
  var hubOptions = hubList().map(function (h) { return '<option value="' + esc(h) + '"' + (h === cityNow ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("");
  var form = "";
  if (formOpen) {
    form = '<div class="card"><h2>Cadastrar produto</h2><div class="form">' +
      '<div class="field full"><label for="pf-nome">Nome do produto</label><input id="pf-nome" type="text" autocomplete="off" placeholder="Ex.: Régua 30 cm"></div>' +
      '<div class="field"><label for="pf-cat">Categoria</label><select id="pf-cat">' + CATS.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="pf-hub">Galpão</label><select id="pf-hub">' + hubOptions + "</select></div>" +
      '<div class="field"><label for="pf-custo">Custo (quanto paguei)</label><input id="pf-custo" type="text" inputmode="decimal" placeholder="0,00"></div>' +
      '<div class="field"><label for="pf-preco">Preço de venda</label><input id="pf-preco" type="text" inputmode="decimal" placeholder="0,00"></div>' +
      '<div class="field"><label for="pf-qtd">Quantidade em estoque</label><input id="pf-qtd" type="text" inputmode="numeric" placeholder="0"></div>' +
      '<div class="field"><label for="pf-min">Avisar quando restar até</label><input id="pf-min" type="text" inputmode="numeric" value="10"></div>' +
      '<div class="field full"><label for="pf-media">Fotos e vídeos do produto</label><input id="pf-media" type="file" accept="image/*,video/*" multiple><small>Até 8 fotos e 2 vídeos. A primeira foto vira a capa.</small></div><div class="media" id="pf-previews"></div>' +
      '<div class="prev" id="pf-prev">Preencha custo e preço para ver o lucro de cada venda.</div>' +
      '<div class="msg bad full field" id="pf-msg"></div>' +
      '<button class="go" style="grid-column:1/-1" data-pnew="1">Cadastrar produto</button></div></div>';
  }
  return '<div class="stats">' +
    '<div class="stat"><b>' + PRODUCTS.length + "</b><span>produtos</span></div>" +
    '<div class="stat' + (low ? " hot" : "") + '"><b>' + low + "</b><span>com estoque baixo</span></div>" +
    '<div class="stat"><b class="sm">' + brl(parado) + "</b><span>parado em estoque (custo)</span></div></div>" +
    '<div class="toolbar" style="margin-top:20px"><input class="search" id="q" type="search" placeholder="Buscar produto" value="' + esc(query) + '" aria-label="Buscar produto">' +
    '<button class="go" data-padd="1">' + (formOpen ? "Fechar" : "+ Novo produto") + "</button></div>" +
    (form ? '<div style="margin-top:12px">' + form + "</div>" : "") +
    '<div class="list" id="plist" style="margin-top:12px"></div>';
}
function renderPlist() {
  var el = document.getElementById("plist");
  if (!el) return;
  var all = cityNow === "Todas";
  var q = query.trim().toLowerCase();
  var rows = PRODUCTS.filter(function (p) { return !q || (p.nome + " " + p.cat).toLowerCase().indexOf(q) !== -1; });
  if (!rows.length) { el.innerHTML = '<div class="empty">Nenhum produto encontrado.</div>'; return; }
  el.innerHTML = rows.map(function (p) {
    var s = stockOf(p, cityNow), lucro = p.preco - p.custo, m = div(lucro, p.preco) * 100;
    var pill = s === 0 ? '<span class="pill s-bad">Sem estoque</span>' : s <= p.min ? '<span class="pill s-novo">Estoque baixo</span>' : '<span class="pill s-ok">Em estoque</span>';
    var open = p.id === openP, detail = "";
    if (open) {
      var by = Object.keys(HUBS).map(function (h) { return esc(h) + ": " + num(p.est[h] || 0); }).join(" · ");
      detail = '<div class="detail">' +
        '<div class="stock-now"><span>Quantidade em ' + (all ? "todos os galpões" : esc(cityNow)) + "</span><b>" + num(s) + " un</b></div>" +
        (all ? '<div class="stock-by">' + by + '</div><div class="stock-by">Escolha um galpão para ajustar a quantidade.</div>' :
          '<div class="stepper"><button data-stk="-10:' + p.id + '">−10</button><button data-stk="-1:' + p.id + '">−1</button><button data-stk="1:' + p.id + '">+1</button><button data-stk="10:' + p.id + '">+10</button></div>') +
        galleryHtml(p) + '<div class="form"><div class="field"><label for="ed-custo">Custo</label><input id="ed-custo" type="text" inputmode="decimal" value="' + p.custo.toFixed(2).replace(".", ",") + '"></div>' +
        '<div class="field"><label for="ed-preco">Preço de venda</label><input id="ed-preco" type="text" inputmode="decimal" value="' + p.preco.toFixed(2).replace(".", ",") + '"></div>' +
        '<div class="prev" id="ed-prev">' + profitText(p.custo, p.preco) + "</div>" +
        '<div class="field full"><label for="ed-media">Adicionar fotos ou vídeos</label><input id="ed-media" type="file" accept="image/*,video/*" multiple></div><div class="msg bad full field" id="ed-msg"></div></div>' +
        '<button class="go" data-psave="' + p.id + '">Salvar valores</button></div>';
    }
    return '<article class="order"><button class="row" data-popen="' + p.id + '" aria-expanded="' + open + '">' +
      '<span class="who pw">' + thumb(p) + "<span>" + esc(p.nome) + '<span class="tag">' + p.cat + "</span></span></span>" +
      '<span class="val">' + num(s) + " un</span>" +
      '<span class="meta">Custo ' + brl2(p.custo) + " · Venda " + brl2(p.preco) + " · Lucro <b class=\"" + (lucro < 0 ? "bad" : "good") + '">' + brl2(lucro) + " (" + pct(m) + ")</b></span>" +
      pill + "</button>" + detail + "</article>";
  }).join("");
}
function profitText(custo, preco) {
  if (isNaN(custo) || isNaN(preco) || preco <= 0) return "Preencha custo e preço para ver o lucro de cada venda.";
  var l = preco - custo, m = div(l, preco) * 100;
  if (l < 0) return '<span class="bad">Você perde ' + brl2(-l) + " em cada venda.</span><small>O preço está abaixo do custo.</small>";
  return '<span class="good">Lucro de ' + brl2(l) + " por venda (" + pct(m) + ")</span><small>Em 10 vendas: " + brl2(l * 10) + "</small>";
}

/* ---------- financeiro ---------- */
function costRow(name, v, fat, green) {
  var p = div(v, fat) * 100;
  return '<div class="cost"><span class="nm">' + name + '</span><span class="vl">' + brl(v) + '<span class="pc">' + pct(p) + '</span></span><div class="bar"><i class="' + (green ? "g" : "") + '" style="width:' + Math.max(0, Math.min(100, p)) + '%"></i></div></div>';
}
function finView() {
  var f = cityNow === "Todas" ? finAll() : fin(cityNow), all = finAll();
  var html = '<div class="fin"><div class="card"><div><div class="big-label">' + (cityNow === "Todas" ? "Faturamento de todas as cidades" : "Faturamento do galpão") + '</div><div class="big">' + brl(f.fat) + "</div></div>" +
    '<div class="duo"><div><small>Lucro</small><b class="good">' + brl(f.lucro) + '</b><em class="good">' + pct(f.margem) + ' de margem</em></div>' +
    '<div><small>A pagar</small><b>' + brl(f.pagar) + '</b><em class="warn">' + pct(div(f.pagar, f.fat) * 100) + " do faturamento</em></div></div></div>";
  html += '<div class="card"><h2>Para onde vai o dinheiro</h2>' +
    costRow("Produtos (fornecedor)", f.prod, f.fat) + costRow("Entrega (motoboys)", f.ent, f.fat) +
    costRow("Impostos", f.imp, f.fat) + costRow(cityNow === "Todas" ? "Galpões e equipe" : "Galpão e equipe", f.fixo, f.fat) +
    '<div class="total"><span>Total a pagar</span><span>' + brl(f.pagar) + "</span></div>" +
    costRow("Lucro que sobra", f.lucro, f.fat, true) + "</div>";
  html += '<div class="kv"><div><small>Entregas no mês</small><b>' + num(f.entregas) + "</b></div><div><small>Ticket médio</small><b>" + brl(TICKET) + "</b></div>";
  if (cityNow !== "Todas") html += "<div><small>Parte do total</small><b>" + pct(div(f.fat, all.fat) * 100) + "</b></div><div><small>Lucro por entrega</small><b>" + brl(div(f.lucro, f.entregas)) + "</b></div>";
  else html += "<div><small>Entregas por dia</small><b>" + num(Math.round(f.entregas / DIAS)) + "</b></div><div><small>Galpões ativos</small><b>" + hubList().length + "</b></div>";
  html += "</div>";
  if (cityNow !== "Todas" && !f.fat) html += '<div class="empty">Este galpão ainda não faturou. Os números aparecem aqui depois das primeiras vendas.</div>';
  if (cityNow === "Todas") {
    html += '<div class="card" style="gap:12px"><h2>Cada galpão</h2><div class="rank">';
    hubList().sort(function (a, b) { return fin(b).fat - fin(a).fat; }).forEach(function (h) {
      var x = fin(h);
      html += '<button class="rk" data-go="' + esc(h) + '"><span class="nm">' + esc(h) + '</span><span class="vl">' + brl(x.fat) + "</span>" +
        '<span class="sb">Lucro <b>' + brl(x.lucro) + "</b> · margem " + pct(x.margem) + '</span><span class="sh">' + pct(div(x.fat, all.fat) * 100) + " do total</span>" +
        '<div class="bar"><i style="width:' + div(x.fat, all.fat) * 100 + '%"></i></div></button>';
    });
    html += "</div></div>";
  }
  return html + "</div>";
}

/* ---------- calendário e vendas por dia ---------- */
var WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
var WDS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
var MES_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var MES_DIAS = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
function scopeHubs() { return cityNow === "Todas" ? hubList() : [cityNow]; }
var HOJE = new Date().getDate();
var MES_ATUAL = String(new Date().getFullYear()) + "-" + String(new Date().getMonth() + 1).padStart(2, "0");
function dayOf(h, d) {
  var f = fin(h);
  var os = ORDERS.filter(function (o) {
    return o.hub === h && o.criado_em && String(o.criado_em).slice(0, 7) === MES_ATUAL && Number(String(o.criado_em).slice(8, 10)) === d;
  });
  var rev = os.reduce(function (a, o) { return a + o.total; }, 0);
  var ped = os.length;
  return { rev: rev, ped: ped, lucro: rev * f.margem / 100 };
}
function dayScope(d, onlyHub) {
  var t = { rev: 0, ped: 0, lucro: 0 };
  (onlyHub ? [onlyHub] : scopeHubs()).forEach(function (h) { var x = dayOf(h, d); t.rev += x.rev; t.ped += x.ped; t.lucro += x.lucro; });
  return t;
}
function kfmt(v) { return v <= 0 ? "–" : v >= 1000 ? (v / 1000).toFixed(1).replace(".", ",") + "k" : String(Math.round(v)); }
function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

function diaView() {
  var days = [], d;
  for (d = 1; d <= MES_DIAS; d++) days.push(dayScope(d));
  var tot = days.reduce(function (a, x) { return { rev: a.rev + x.rev, ped: a.ped + x.ped, lucro: a.lucro + x.lucro }; }, { rev: 0, ped: 0, lucro: 0 });
  var max = Math.max.apply(null, days.map(function (x) { return x.rev; }));
  if (!tot.rev) return '<div class="empty">Ainda sem vendas neste galpão. Quando os pedidos começarem a entrar, o calendário mostra o faturamento de cada dia.</div>';
  var best = 0; days.forEach(function (x, i) { if (x.rev > days[best].rev) best = i; });
  var mesNome = MES_NAMES[new Date().getMonth()].toLowerCase();
  var html = '<div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat grn"><b style="font-size:26px">' + brl(tot.rev) + "</b><span>faturado em " + mesNome + "</span></div>" +
    '<div class="stat grn"><b style="font-size:26px">' + brl(tot.lucro) + "</b><span>lucro do mês</span></div></div>" +
    '<p class="legend" style="margin:8px 0 0"><b>' + num(tot.ped) + "</b> pedidos no mês · melhor dia: <b>dia " + (best + 1) + "</b> com " + brl(days[best].rev) + ".</p>";

  var offset = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay(), cells = "";
  WDS.forEach(function (w) { cells += '<div class="dow">' + w.charAt(0).toUpperCase() + "</div>"; });
  for (d = 0; d < offset; d++) cells += "<div></div>";
  for (d = 1; d <= MES_DIAS; d++) {
    var x = days[d - 1], inten = max ? x.rev / max : 0;
    cells += '<button class="day' + (d === HOJE ? " today" : "") + '" data-day="' + d + '" aria-pressed="' + (d === selDay) + '" aria-label="Dia ' + d + ': ' + brl(x.rev) + '"' +
      (x.rev ? ' style="background:color-mix(in srgb, var(--accent) ' + Math.round(inten * 34) + '%, var(--surface))"' : "") +
      '><span class="dn">' + d + '</span><span class="dv">' + kfmt(x.rev) + "</span></button>";
  }
  html += '<div class="card" style="margin-top:16px"><h2>' + MES_NAMES[new Date().getMonth()] + ' de ' + new Date().getFullYear() + '</h2><div class="cal">' + cells + '</div><div class="legend">Toque em um dia para ver como foi. Valores em milhares de reais (k).</div></div>';

  var s = days[selDay - 1], prev = selDay > 1 ? days[selDay - 2] : null;
  var title = cap(WD[new Date(new Date().getFullYear(), new Date().getMonth(), selDay).getDay()]) + ", " + selDay + " de " + mesNome + (selDay === HOJE ? " · hoje" : "");
  var cmp = "";
  if (prev && prev.rev > 0) {
    var ch = (s.rev - prev.rev) / prev.rev * 100;
    cmp = '<em class="' + (ch >= 0 ? "good" : "bad") + '">' + (ch >= 0 ? "▲ " : "▼ ") + pct(Math.abs(ch)) + " em relação ao dia anterior</em>";
  }
  html += '<div class="card" style="margin-top:12px"><div><div class="dayhead">' + title + '</div><div class="big good">' + brl(s.rev) + "</div>" + cmp + "</div>" +
    '<div class="duo"><div><small>Lucro do dia</small><b class="good">' + brl(s.lucro) + "</b></div><div><small>Pedidos</small><b>" + num(s.ped) + "</b></div></div>" +
    '<div class="duo" style="border-top:0;padding-top:0"><div><small>Ticket médio</small><b>' + brl(div(s.rev, s.ped)) + "</b></div><div><small>Margem</small><b>" + pct(div(s.lucro, s.rev) * 100) + "</b></div></div>";
  if (cityNow === "Todas" && hubList().length > 1) {
    html += '<div class="cities">' + hubList().map(function (h) { var y = dayScope(selDay, h); return "<div><span>" + esc(h) + "</span><span>" + brl(y.rev) + " · " + num(y.ped) + " pedidos</span></div>"; }).join("") + "</div>";
  }
  html += "</div>";

  var from = allDays ? 1 : Math.max(1, HOJE - 6), rows = "";
  for (d = HOJE; d >= from; d--) {
    var y2 = days[d - 1], lb = d === HOJE ? "Hoje" : d === HOJE - 1 ? "Ontem" : "Há " + (HOJE - d) + " dias";
    rows += '<div class="drow"><div class="dl"><b>' + lb + "</b><small>" + WDS[new Date(new Date().getFullYear(), new Date().getMonth(), d).getDay()] + ", " + d + "/" + String(new Date().getMonth() + 1).padStart(2, "0") + " · " + num(y2.ped) + ' pedidos</small></div>' +
      '<div class="dr"><b>' + brl(y2.rev) + '</b><small class="good">lucro ' + brl(y2.lucro) + '</small></div><div class="bar"><i class="g" style="width:' + (max ? y2.rev / max * 100 : 0) + '%"></i></div></div>';
  }
  html += '<div class="card" style="margin-top:12px"><h2>' + (allDays ? "Mês inteiro, dia a dia" : "Últimos 7 dias") + "</h2>" + rows +
    '<button class="ghost" data-alldays="1">' + (allDays ? "Mostrar só os últimos 7 dias" : "Ver o mês inteiro") + "</button></div>";
  return html;
}

/* ---------- nova cidade e taxas ---------- */
function allCities() {
  var out = [];
  hubList().forEach(function (h) { HUBS[h].serve.forEach(function (c) { out.push({ hub: h, nome: c, taxa: HUBS[h].taxas[c] || 0 }); }); });
  return out;
}
function simHtml(idx) {
  var cs = allCities(), c = cs[idx] || cs[0];
  if (!c) return "";
  var sub = 159.9;
  return '<div class="ln"><span>Kit médio ensino fundamental</span><span>' + brl2(sub) + "</span></div>" +
    '<div class="ln"><span>Entrega para ' + esc(c.nome) + "</span><span>" + (c.taxa ? brl2(c.taxa) : "Grátis") + "</span></div>" +
    '<div class="ln sum"><span>Total do cliente</span><span>' + brl2(sub + c.taxa) + "</span></div>";
}
function syncRows() {
  var n = document.getElementById("nc-nome");
  if (n) newName = n.value;
  newRows = newRows.map(function (r, i) {
    var a = document.getElementById("nc-c-" + i), b = document.getElementById("nc-t-" + i);
    return { nome: a ? a.value : r.nome, taxa: b ? b.value : r.taxa };
  });
}
function novaView() {
  var rows = newRows.map(function (r, i) {
    return '<div class="crow"><div class="field"><label for="nc-c-' + i + '">Cidade atendida</label><input id="nc-c-' + i + '" type="text" autocomplete="off" value="' + esc(r.nome) + '" placeholder="Ex.: Campinas"></div>' +
      '<div class="field"><label for="nc-t-' + i + '">Entrega (R$)</label><input id="nc-t-' + i + '" type="text" inputmode="decimal" value="' + esc(r.taxa) + '" placeholder="15,00"></div>' +
      (newRows.length > 1 ? '<button class="x" data-crem="' + i + '" aria-label="Remover cidade">×</button>' : "<span></span>") + "</div>";
  }).join("");
  var fees = hubList().map(function (h, hi) {
    return '<div><div class="hubname">Galpão ' + esc(h) + "</div>" + HUBS[h].serve.map(function (c, ci) {
      var fee = HUBS[h].taxas[c] || 0;
      return '<div class="fee"><span>' + esc(c) + '</span><input id="tx-' + hi + "-" + ci + '" type="text" inputmode="decimal" value="' + fee.toFixed(2).replace(".", ",") + '" aria-label="Taxa de entrega de ' + esc(c) + '"><button class="ghost" data-txsave="' + hi + ":" + ci + '">Salvar</button></div>';
    }).join("") + "</div>";
  }).join("");
  var opts = allCities().map(function (c, i) { return '<option value="' + i + '">' + esc(c.nome) + "</option>"; }).join("");
  return '<div class="card"><h2>Cadastrar galpão e cidades</h2><div class="form">' +
    '<div class="field full"><label for="nc-nome">Nome do galpão</label><input id="nc-nome" type="text" autocomplete="off" value="' + esc(newName) + '" placeholder="Ex.: Campinas"><small>Esse nome vira a aba do galpão.</small></div>' +
    rows + '<button class="addrow" data-cadd="1">+ Atender mais uma cidade</button>' +
    '<div class="field full"><small>A taxa é o valor que o cliente paga de entrega nessa cidade. Use 0 para frete grátis.</small></div>' +
    '<div class="msg bad full field" id="nc-msg"></div>' +
    '<button class="go" style="grid-column:1/-1" data-cnew="1">Cadastrar galpão</button></div></div>' +
    '<div class="card"><h2>Taxa de entrega por cidade</h2><div class="fees">' + fees + '</div><div class="msg" id="tx-msg"></div></div>' +
    '<div class="card"><h2>Como o cliente vê no site</h2><div class="field"><label for="sim-city">Cliente escolhe a cidade</label><select id="sim-city">' + opts + "</select></div>" +
    '<div class="lines" id="sim-out">' + simHtml(0) + '</div><div class="stock-by">O total já sai com a taxa da cidade escolhida.</div></div>';
}

/* ---------- mídia dos produtos ---------- */
function thumb(p) {
  if (p.fotos && p.fotos.length) return '<img class="thumb" src="' + p.fotos[0] + '" alt="">';
  return '<span class="thumb ph" aria-hidden="true">' + esc(p.nome.charAt(0).toUpperCase()) + "</span>";
}
function galleryHtml(p) {
  var f = p.fotos || [], v = p.videos || [];
  if (!f.length && !v.length) return '<div class="stock-by">Sem fotos nem vídeos ainda.</div>';
  return '<div class="gal">' + f.map(function (u) { return '<img src="' + u + '" alt="Foto de ' + esc(p.nome) + '">'; }).join("") +
    v.map(function (u) { return '<video src="' + u + '" controls preload="metadata" playsinline></video>'; }).join("") + "</div>";
}
function renderPending() {
  var el = document.getElementById("pf-previews");
  if (!el) return;
  el.innerHTML = pending.map(function (m, i) {
    return '<div class="pm">' + (m.kind === "image" ? '<img src="' + m.url + '" alt="">' : '<video src="' + m.url + '" muted preload="metadata"></video><span class="vtag">vídeo</span>') +
      '<button data-prm="' + i + '" aria-label="Remover">×</button></div>';
  }).join("");
}
function kindOf(f) { return f.type.indexOf("image/") === 0 ? "image" : f.type.indexOf("video/") === 0 ? "video" : ""; }

/* ---------- comanda ---------- */
function comandaText(o) {
  var L = ["VOTO · Galpão " + o.hub, "Pedido #" + o.id + " · " + dateStr() + " " + o.t, "",
    "Cliente: " + o.name, "Entrega: " + o.addr + " · " + o.area, "Saída: motoboy das " + o.out, "Pagamento: " + o.pay + " confirmado", "", "Itens:"];
  o.lines.forEach(function (l) { L.push(l.q + "x " + l.nome + (l.add ? " (adicionado)" : "") + " — " + brl2(l.q * l.preco)); });
  if (o.perso) L.push("", "PERSONALIZAR: " + o.perso.nivel + " (" + o.perso.desc + ")" + (o.perso.nota ? " — " + o.perso.nota : ""));
  L.push("", "Produtos: " + brl2(o.val), (o.perso ? "Personalização (" + o.perso.nivel + "): " + brl2(o.perso.preco) : null), "Entrega (" + o.area + "): " + (o.taxa ? brl2(o.taxa) : "grátis"), "TOTAL: " + brl2(o.total));
  return L.filter(function (x) { return x !== null; }).join("\n");
}
function dateStr() { var d = new Date(); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }
var sheetOrder = null;
function openSheet(id) {
  var o = null; ORDERS.forEach(function (x) { if (x.id === id) o = x; });
  if (!o) return;
  sheetOrder = o;
  var s = document.getElementById("sheet");
  s.innerHTML = '<div class="paper"><h3>Voto</h3><div class="sub">Galpão ' + esc(o.hub) + " · " + dateStr() + " " + o.t + "</div><hr>" +
    '<div class="big-id">Pedido #' + o.id + "</div><hr><dl><dt>Cliente</dt><dd>" + esc(o.name) + "</dd><dt>Endereço</dt><dd>" + esc(o.addr) +
    "</dd><dt>Cidade</dt><dd>" + esc(o.area) + "</dd><dt>Saída</dt><dd>Motoboy das " + o.out + "</dd><dt>Pagamento</dt><dd>" + o.pay + " confirmado</dd></dl><hr>" +
    '<div class="lines" style="border:0;padding:0">' + o.lines.map(function (l) { return '<div class="ln"><span>' + l.q + "× " + esc(l.nome) + (l.add ? '<span class="addtag">novo</span>' : "") + "</span><span>" + brl2(l.q * l.preco) + "</span></div>"; }).join("") + "</div><hr>" +
    (o.perso ? '<div class="perso-box">PERSONALIZAR · ' + esc(o.perso.nivel) + "<small>" + esc(o.perso.desc) + "</small>" + (o.perso.nota ? "<small>" + esc(o.perso.nota) + "</small>" : "") + "</div><hr>" : "") +
    '<div class="lines" style="border:0;padding:0"><div class="ln"><span>Produtos</span><span>' + brl2(o.val) + '</span></div>' + (o.perso ? '<div class="ln"><span>Personalização · ' + esc(o.perso.nivel) + "</span><span>" + brl2(o.perso.preco) + "</span></div>" : "") + '<div class="ln"><span>Entrega · ' + esc(o.area) + '</span><span>' + (o.taxa ? brl2(o.taxa) : "Grátis") + '</span></div></div><hr><div class="total2"><span>Total</span><span>' + brl2(o.total) + "</span></div></div>" +
    '<div class="sheet-actions"><button class="go full" data-doprint="1">Imprimir</button><button class="ghost" data-copy="1">Copiar pedido</button><button class="ghost" data-close="1">Fechar</button></div>' +
    '<div class="sheet-note" id="sheet-note"></div>';
  s.hidden = false;
  s.scrollTop = 0;
}
function closeSheet() { document.getElementById("sheet").hidden = true; sheetOrder = null; }
function sheetNote(t) { var n = document.getElementById("sheet-note"); if (n) n.textContent = t; }

/* ---------- render principal ---------- */
function render() {
  renderTabs(); renderHead();
  var v = document.getElementById("view");
  if (cityNow === "+") v.innerHTML = novaView();
  else if (viewNow === "op") v.innerHTML = opView();
  else if (viewNow === "est") { v.innerHTML = estView(); renderPlist(); renderPending(); }
  else if (viewNow === "dia") { v.innerHTML = diaView(); }
  else if (viewNow === "aj") v.innerHTML = ajView();
  else v.innerHTML = finView();
  if (flash) { setMsg(flash.id, flash.text, flash.cls); flash = null; }
}
function setMsg(id, text, cls) { var e = document.getElementById(id); if (e) { e.textContent = text; if (cls) e.className = "msg " + cls; } }

/* ---------- eventos ---------- */
document.addEventListener("click", function (e) {
  var t = e.target.closest("button");
  if (!t) return;
  var d = t.dataset;

  if (d.close) { closeSheet(); return; }
  if (d.copy) {
    var txt = sheetOrder ? comandaText(sheetOrder) : "";
    try { navigator.clipboard.writeText(txt).then(function () { sheetNote("Pedido copiado."); }, function () { sheetNote("Não consegui copiar daqui. Selecione o texto da folha e copie."); }); }
    catch (err) { sheetNote("Não consegui copiar daqui. Selecione o texto da folha e copie."); }
    return;
  }
  if (d.doprint) {
    try { window.print(); } catch (err2) {}
    sheetNote("Se a janela de impressão não abriu, é limitação desta prévia. No sistema final ela abre direto.");
    return;
  }
  if (d.print) { openSheet(+d.print); return; }


  if (d.perso) {
    var pp = d.perso.split(":"), po = findOrder(+pp[0]);
    if (po && po.st !== "ok") {
      var newPerso;
      if (pp[1] === "none") newPerso = null;
      else { var pi = +pp[1], lv2 = PERSO[pi]; newPerso = { nivel: lv2.nome, desc: lv2.desc, preco: lv2.preco, nota: po.perso ? po.perso.nota : "" }; }
      apiJSON("/api/operacao/orders/" + po.id, { method: "PUT", body: { perso: newPerso } })
        .then(function () { return loadOrdersOnly(); })
        .then(function () { render(); })
        .catch(function () { render(); });
    }
    return;
  }
  if (d.rmline) {
    var rp = d.rmline.split(":"), ro = findOrder(+rp[0]);
    if (ro && ro.st !== "ok") {
      var rl = ro.lines[+rp[1]];
      if (rl && rl.add) {
        var nextLines = ro.lines.filter(function (x, i) { return i !== +rp[1]; });
        apiJSON("/api/operacao/orders/" + ro.id, { method: "PUT", body: { items: pair(nextLines) } })
          .then(function () { return loadOrdersOnly(); })
          .then(function () { render(); })
          .catch(function () { render(); });
        return;
      }
    }
    render(); return;
  }
  if (d.addline) {
    var ao = findOrder(+d.addline);
    if (!ao || ao.st === "ok") return;
    var sel = document.getElementById("ai-prod").value, q = parseInt(document.getElementById("ai-qtd").value, 10);
    function fail(msg) { setMsg("ai-msg", msg, "bad"); }
    if (isNaN(q) || q < 1 || q > 99) { fail("Informe a quantidade, de 1 a 99."); return; }
    var nl;
    if (sel === "novo") {
      var nn = document.getElementById("ai-nome").value.trim(), pv = parseMoneySimple(document.getElementById("ai-preco").value), cv = parseMoneySimple(document.getElementById("ai-custo").value);
      if (!nn) { fail("Escreva o nome do item."); return; }
      if (isNaN(pv) || pv <= 0) { fail("Informe o preço de venda do item."); return; }
      nl = { pid: null, nome: nn, q: q, preco: pv, custo: isNaN(cv) || cv < 0 ? 0 : cv, add: true };
    } else {
      var pr = null; PRODUCTS.forEach(function (p) { if (String(p.id) === sel) pr = p; });
      if (!pr) { fail("Escolha um produto."); return; }
      nl = { pid: pr.id, nome: pr.nome, q: q, preco: pr.preco, custo: pr.custo, add: true };
    }
    var merged = ao.lines.slice();
    var sameIdx = -1;
    merged.forEach(function (l, i) { if (l.add && nl.pid && String(l.pid) === String(nl.pid)) sameIdx = i; });
    if (sameIdx >= 0) merged[sameIdx] = Object.assign({}, merged[sameIdx], { q: merged[sameIdx].q + nl.q });
    else merged.push(nl);
    padj(ao.id, pair(merged), ao.perso, "ai-msg");
    return;
  }
  if (d.lvsave) {
    var next = [], err = "";
    PERSO.forEach(function (p, i) {
      if (err) return;
      var nm2 = document.getElementById("lv-nome-" + i).value.trim(), ds = document.getElementById("lv-desc-" + i).value.trim(), pc = parseMoneySimple(document.getElementById("lv-preco-" + i).value);
      if (!nm2) { err = "Escreva o nome do nível " + (i + 1) + "."; return; }
      if (isNaN(pc) || pc < 0) { err = "Preço inválido no nível " + (i + 1) + ". Use 0 para não cobrar."; return; }
      next.push({ nome: nm2, desc: ds || nm2, preco: pc });
    });
    if (err) { setMsg("lv-msg", err, "bad"); return; }
    apiJSON("/api/operacao/perso", { method: "PUT", body: { items: next } })
      .then(function () { return apiJSON("/api/operacao/perso"); })
      .then(function (perso) {
        PERSO = (perso || []).map(function (x) { return { nome: x.nome, desc: x.desc, preco: x.preco }; });
        flash = { id: "lv-msg", text: "Valores salvos. Pedidos novos já usam esses preços.", cls: "good" };
        render();
      })
      .catch(function (err2) { setMsg("lv-msg", err2.message || "Não foi possível salvar.", "bad"); });
    return;
  }

  if (d.stk) {
    var parts = d.stk.split(":"), delta = +parts[0], pid = parts[1];
    var prod = null;
    PRODUCTS.forEach(function (p) { if (String(p.id) === pid) prod = p; });
    if (!prod) return;
    var cur = stockOf(prod, cityNow);
    var newQtd = Math.max(0, cur + delta);
    apiJSON("/api/operacao/stock", {
      method: "PUT",
      body: { items: [{ id: prod.id, hub_id: HUB_ID[cityNow], qtd: newQtd, custo: prod.custo, min: prod.min }] },
    })
      .then(function () { return loadStockOnly(); })
      .then(function () { delete HUBS[cityNow].daily; renderPlist(); })
      .catch(function () { renderPlist(); });
    return;
  }
  if (d.popen) { var pid2 = d.popen; openP = openP === pid2 ? null : pid2; renderPlist(); return; }
  if (d.psave) {
    var c = parseMoneySimple(document.getElementById("ed-custo").value), pr = parseMoneySimple(document.getElementById("ed-preco").value);
    if (isNaN(c) || c < 0 || isNaN(pr) || pr <= 0) { setMsg("ed-msg", "Confira os valores: custo e preço precisam ser números."); return; }
    var sp = null;
    PRODUCTS.forEach(function (p) { if (String(p.id) === String(d.psave)) sp = p; });
    if (!sp) return;
    var stockItem = { id: sp.id, hub_id: HUB_ID[cityNow], qtd: stockOf(sp, cityNow), custo: c, min: sp.min };
    apiJSON("/api/operacao/products/" + encodeURIComponent(sp.id), {
      method: "PUT",
      body: { nome: sp.nome, cat: sp.catId || catKey(sp.cat), preco: pr, estoque: sp.estGlobal != null ? sp.estGlobal : 0, ativo: true },
    })
      .then(function () { return apiJSON("/api/operacao/stock", { method: "PUT", body: { items: stockItem ? [stockItem] : [] } }); })
      .then(function () { return loadStockOnly(); })
      .then(function () { delete HUBS[cityNow].daily; renderPlist(); })
      .catch(function (err3) { setMsg("ed-msg", err3.message || "Não foi possível salvar.", "bad"); });
    return;
  }
  if (d.padd) { formOpen = !formOpen; render(); return; }
  if (d.pnew) {
    var nome = document.getElementById("pf-nome").value.trim();
    var custo = parseMoneySimple(document.getElementById("pf-custo").value), preco = parseMoneySimple(document.getElementById("pf-preco").value);
    var qtd = parseInt(document.getElementById("pf-qtd").value, 10) || 0, mn = parseInt(document.getElementById("pf-min").value, 10);
    if (!nome) { setMsg("pf-msg", "Escreva o nome do produto."); return; }
    if (isNaN(custo) || custo < 0) { setMsg("pf-msg", "Informe quanto você pagou pelo produto (custo)."); return; }
    if (isNaN(preco) || preco <= 0) { setMsg("pf-msg", "Informe o preço de venda."); return; }
    var hubName = document.getElementById("pf-hub").value;
    var newCat = catKey(document.getElementById("pf-cat").value);
    var firstImg = pending.filter(function (m) { return m.kind === "image" && m.data; })[0];
    var fotoPromise = firstImg
      ? apiJSON("/api/operacao/upload", { method: "POST", body: { dataUrl: firstImg.data } })
          .then(function (up) { return up.url; })
          .catch(function () { return ""; })
      : Promise.resolve("");
    fotoPromise.then(function (fotoUrl) {
    apiJSON("/api/operacao/products", {
      method: "POST",
      body: { nome: nome, cat: newCat, preco: preco, estoque: Math.max(0, qtd), ativo: true, foto: fotoUrl || null },
    })
      .then(function (data) {
        var created = data.produto;
        return apiJSON("/api/operacao/stock", {
          method: "PUT",
          body: { items: [{ id: created.id, hub_id: HUB_ID[hubName], qtd: Math.max(0, qtd), custo: custo, min: isNaN(mn) ? 10 : mn }] },
        });
      })
      .then(function () { return loadAll(); })
      .then(function () {
        pending = []; formOpen = false; query = "";
        if (PRODUCTS[0]) openP = PRODUCTS[0].id;
        render();
      })
      .catch(function (err4) { setMsg("pf-msg", err4.message || "Não foi possível cadastrar.", "bad"); });
    });
    return;
  }
  if (d.cadd) { syncRows(); newRows.push({ nome: "", taxa: "" }); render(); return; }
  if (d.crem) { syncRows(); newRows.splice(+d.crem, 1); render(); return; }
  if (d.prm) { pending.splice(+d.prm, 1); renderPending(); return; }
  if (d.txsave) {
    var tp = d.txsave.split(":"), hh = hubList()[+tp[0]], cc = HUBS[hh].serve[+tp[1]];
    var tv = parseMoneySimple(document.getElementById("tx-" + tp[0] + "-" + tp[1]).value);
    if (isNaN(tv) || tv < 0) { setMsg("tx-msg", "Taxa inválida. Use 0 para frete grátis.", "bad"); return; }
    var cidades = HUBS[hh].serve.map(function (c) { return { cidade: c, taxa: c === cc ? tv : HUBS[hh].taxas[c] || 0 }; });
    apiJSON("/api/operacao/hubs/" + HUB_ID[hh], { method: "PUT", body: { nome: hh, cidades: cidades } })
      .then(function () { return loadAll(); })
      .then(function () { render(); setMsg("tx-msg", "Taxa de " + cc + " salva: " + (tv ? brl2(tv) : "frete grátis") + ".", "good"); })
      .catch(function (err5) { setMsg("tx-msg", err5.message || "Não foi possível salvar.", "bad"); });
    return;
  }
  if (d.cnew) {
    syncRows();
    var nm = newName.trim();
    if (!nm) { setMsg("nc-msg", "Escreva o nome do galpão."); return; }
    if (hubList().some(function (h) { return h.toLowerCase() === nm.toLowerCase(); })) { setMsg("nc-msg", "Já existe um galpão com esse nome."); return; }
    var serve = [], taxas = {}, bad = "";
    newRows.forEach(function (r) {
      if (bad) return;
      var c = r.nome.trim(), tx = String(r.taxa).trim();
      if (!c && !tx) return;
      if (!c) { bad = "Escreva o nome da cidade."; return; }
      var t = parseMoneySimple(tx);
      if (isNaN(t) || t < 0) { bad = "Informe a taxa de entrega de " + c + " (use 0 para frete grátis)."; return; }
      var owner = null;
      allCities().forEach(function (x) { if (x.nome.toLowerCase() === c.toLowerCase()) owner = x.hub; });
      if (owner || serve.some(function (z) { return z.toLowerCase() === c.toLowerCase(); })) { bad = c + " já está cadastrada" + (owner ? " no galpão " + owner : "") + "."; return; }
      serve.push(c); taxas[c] = t;
    });
    if (bad) { setMsg("nc-msg", bad); return; }
    if (!serve.length) { setMsg("nc-msg", "Cadastre pelo menos uma cidade com a taxa de entrega."); return; }
    apiJSON("/api/operacao/hubs", { method: "POST", body: { nome: nm, cmv: 50, ent: 10, imp: 6, fixo: 0 } })
      .then(function (data) {
        return apiJSON("/api/operacao/hubs/" + data.galpao.id, {
          method: "PUT",
          body: { nome: nm, cidades: serve.map(function (c) { return { cidade: c, taxa: taxas[c] }; }) },
        });
      })
      .then(function () { return loadAll(); })
      .then(function () {
        newRows = [{ nome: "", taxa: "" }]; newName = ""; cityNow = nm; viewNow = "est"; openP = null; render();
      })
      .catch(function (err6) { setMsg("nc-msg", err6.message || "Não foi possível cadastrar.", "bad"); });
    return;
  }

  if (d.city) { cityNow = d.city; if (cityNow !== "+" && viewNow !== "est" && viewNow !== "fin" && viewNow !== "dia" && viewNow !== "aj") viewNow = "op"; statusNow = "todos"; openId = null; openP = null; shown = 12; formOpen = false; }
  else if (d.go) { cityNow = d.go; }
  else if (d.view) { viewNow = d.view; openId = null; openP = null; formOpen = false; }
  else if (d.st) { statusNow = d.st; openId = null; shown = 12; }
  else if (d.open) { var id = +d.open; openId = openId === id ? null : id; }
  else if (d.more) { shown += 12; }
  else if (d.day) { selDay = +d.day; }
  else if (d.alldays) { allDays = !allDays; }
  else if (d.adv) {
    var id2 = +d.adv;
    var target = findOrder(id2);
    if (!target) { render(); return; }
    var i = stepIndex(target.st);
    if (i >= STEPS.length - 1) { render(); return; }
    apiJSON("/api/operacao/orders/" + id2, { method: "PATCH", body: { op_status: STEPS[i + 1].key } })
      .then(function () { return loadOrdersOnly(); })
      .then(function () { render(); })
      .catch(function () { render(); });
    return;
  } else return;
  render();
});

document.addEventListener("input", function (e) {
  var id = e.target.id;
  if (id === "q") { query = e.target.value; renderPlist(); }
  else if (id === "pf-custo" || id === "pf-preco") {
    setMsg("pf-msg", "");
    var el = document.getElementById("pf-prev");
    if (el) el.innerHTML = profitText(parseMoneySimple(document.getElementById("pf-custo").value), parseMoneySimple(document.getElementById("pf-preco").value));
  } else if (id === "ed-custo" || id === "ed-preco") {
    setMsg("ed-msg", "");
    var el2 = document.getElementById("ed-prev");
    if (el2) el2.innerHTML = profitText(parseMoneySimple(document.getElementById("ed-custo").value), parseMoneySimple(document.getElementById("ed-preco").value));
  } else if (id === "pf-nome" || id === "pf-qtd") { setMsg("pf-msg", ""); }
  else if (id.indexOf("nc-") === 0) { setMsg("nc-msg", ""); }
  else if (id.indexOf("ai-") === 0) { setMsg("ai-msg", ""); }
  else if (id.indexOf("lv-") === 0) { setMsg("lv-msg", ""); }
});
document.addEventListener("change", function (e) {
  var id = e.target.id;
  if (id === "ai-prod") { addSel = e.target.value; render(); return; }
  if (id === "pn-note") {
    var no = findOrder(openId);
    if (no && no.perso) {
      var newNote = e.target.value.trim();
      apiJSON("/api/operacao/orders/" + no.id, {
        method: "PUT",
        body: { perso: { nivel: no.perso.nivel, desc: no.perso.desc, preco: no.perso.preco, nota: newNote } },
      }).catch(function () {});
    }
    return;
  }
  if (id === "sim-city") { var out = document.getElementById("sim-out"); if (out) out.innerHTML = simHtml(+e.target.value); return; }
  if (id !== "pf-media" && id !== "ed-media") return;
  var files = Array.prototype.slice.call(e.target.files || []), skipped = 0, prod = null;
  if (id === "ed-media") PRODUCTS.forEach(function (p) { if (p.id === openP) prod = p; });
  if (id === "ed-media" && !prod) return;
  files.forEach(function (f) {
    var kind = kindOf(f);
    if (!kind) return;
    if (kind === "image") {
      var n = pending.filter(function (m) { return m.kind === "image"; }).length;
      if (id === "pf-media" && n >= 8) { skipped++; return; }
      var reader = new FileReader();
      reader.onload = function () {
        if (id === "pf-media") {
          pending.push({ kind: "image", url: String(reader.result), data: String(reader.result), name: f.name });
          renderPending();
        } else {
          prod.fotos = prod.fotos || [];
          if (prod.fotos.length < 8) prod.fotos.push(String(reader.result));
          apiJSON("/api/operacao/upload", { method: "POST", body: { dataUrl: String(reader.result) } })
            .then(function (up) {
              return apiJSON("/api/operacao/products/" + encodeURIComponent(prod.id), {
                method: "PUT",
                body: { nome: prod.nome, cat: prod.catId || "material", preco: prod.preco, estoque: prod.estGlobal != null ? prod.estGlobal : 0, ativo: true, foto: up.url },
              });
            })
            .then(function () { flash = { id: "ed-msg", text: "Foto da capa atualizada.", cls: "good" }; renderPlist(); })
            .catch(function (err) { flash = { id: "ed-msg", text: err && err.message ? err.message : "Não foi possível salvar a foto.", cls: "bad" }; renderPlist(); });
        }
      };
      reader.readAsDataURL(f);
      return;
    }
    var url = URL.createObjectURL(f);
    if (id === "pf-media") {
      var nv = pending.filter(function (m) { return m.kind === "video"; }).length;
      if (nv >= 2) { skipped++; return; }
      pending.push({ kind: "video", url: url, name: f.name });
    }
  });
  e.target.value = "";
  if (id === "pf-media") { renderPending(); setMsg("pf-msg", skipped ? "Limite: 8 fotos e 2 vídeos por produto." : ""); }
  else { renderPlist(); setMsg("ed-msg", skipped ? "Limite: 8 fotos e 2 vídeos por produto." : ""); }
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !document.getElementById("sheet").hidden) closeSheet(); });

var dt = new Date(), dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
document.getElementById("today").textContent = dias[dt.getDay()] + ", " + String(dt.getDate()).padStart(2, "0") + "/" + String(dt.getMonth() + 1).padStart(2, "0");
document.getElementById("today-month").textContent = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][dt.getMonth()] + " de " + dt.getFullYear();
loadAll().then(function () { render(); });
