'use strict';

  var $ = function (s) {
    return document.querySelector(s);
  };

  var CATS = {
    'kit-f': 'Kit Ensino Fundamental',
    'kit-m': 'Kit Ensino Médio',
    material: 'Materiais escolares',
    papelaria: 'Papelaria',
    mochilas: 'Mochilas',
    fem: 'Moda feminina',
    masc: 'Moda masculina',
  };

  var ARTS = ['kit', 'mochila', 'lapis', 'caderno', 'estojo', 'camiseta', 'vestido'];

  var STATUS = ['novo', 'confirmado', 'enviado', 'entregue', 'cancelado'];
  var STATUS_LABEL = {
    novo: 'Novo',
    confirmado: 'Confirmado',
    enviado: 'Enviado',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  };

  var state = {
    view: 'resumo',
    produtos: [],
    clientes: [],
    pedidos: [],
    avaliacoes: [],
    influenciadores: [],
    config: null,
    stats: null,
    buscaProduto: '',
    buscaCliente: '',
    buscaPedido: '',
    buscaAvaliacao: '',
    buscaInfluenciador: '',
    filtroPedido: 'todos',
    filtroInfluenciador: 'todos',
    editing: null,
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function cpfFmt(value) {
    var d = String(value || '').replace(/\D/g, '');
    if (d.length !== 11) return value || '—';
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  function fmtDate(value) {
    if (!value) return '—';
    var d = new Date(String(value).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function api(url, options) {
    var opts = Object.assign({ headers: {} }, options || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
    if (opts.body && !opts.headers['Content-Type']) {
      opts.headers['Content-Type'] = 'application/json';
    }
    var res = await fetch(url, opts);
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error(data.erro || 'Não foi possível concluir a ação.');
    return data;
  }

  var toastTimer;
  function toast(message) {
    var el = $('#toast');
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('on');
    }, 2200);
  }

  /* ---------- boot / sessão ---------- */

  function showLogin() {
    $('#login').hidden = false;
    $('#app').hidden = true;
    setTimeout(function () {
      $('#usuario').focus();
    }, 50);
  }

  function showApp(admin) {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#who').textContent = admin.nome ? admin.nome + ' · ' + admin.usuario : admin.usuario;
    loadView('resumo');
  }

  async function boot() {
    try {
      var me = await api('/api/admin/me');
      if (me.admin && me.admin.papel === 'operacao') {
        location.href = '/operacao';
        return;
      }
      if (me.admin) showApp(me.admin);
      else showLogin();
    } catch (err) {
      showLogin();
    }
  }

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var button = e.target.querySelector('button[type="submit"]');
    var erro = $('#loginErro');
    erro.textContent = '';
    button.disabled = true;
    button.textContent = 'Entrando...';
    try {
      var data = await api('/api/admin/login', {
        method: 'POST',
        body: { usuario: $('#usuario').value, senha: $('#senha').value },
      });
      $('#senha').value = '';
      if (data.admin.papel === 'operacao') {
        location.href = '/operacao';
        return;
      }
      showApp(data.admin);
    } catch (err) {
      erro.textContent = err.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar no painel';
    }
  });

  $('#logout').addEventListener('click', async function () {
    try {
      await api('/api/admin/logout', { method: 'POST' });
    } catch (err) {}
    showLogin();
  });

  /* ---------- navegação ---------- */

  var VIEW_META = {
    resumo: ['Resumo', 'Visão geral da loja'],
    produtos: ['Produtos', 'Cadastre, edite e controle o que aparece no site'],
    clientes: ['Clientes', 'Quem se cadastrou na Voto'],
    pedidos: ['Pedidos', 'Acompanhe os pedidos feitos pelo site'],
    avaliacoes: ['Avaliações', 'Modere as avaliações enviadas pelos clientes'],
    influenciadores: ['Influenciadores', 'Aprove cadastros, veja detalhes e desempenho'],
    config: ['Configurações', 'WhatsApp, entrega e senha do painel'],
  };

  document.querySelectorAll('.side nav button').forEach(function (b) {
    b.addEventListener('click', function () {
      loadView(b.dataset.view);
      $('.side').classList.remove('open');
    });
  });

  $('#menuBtn').addEventListener('click', function () {
    $('.side').classList.toggle('open');
  });

  async function loadView(view) {
    state.view = view;
    var meta = VIEW_META[view];
    $('#title').textContent = meta[0];
    $('#subtitle').textContent = meta[1];
    document.querySelectorAll('.side nav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === view);
    });

    $('#view').innerHTML = '<div class="empty-state"><b>Carregando…</b>Aguarde um instante.</div>';
    try {
      if (view === 'resumo') {
        state.stats = await api('/api/admin/stats');
        renderResumo();
      } else if (view === 'produtos') {
        var p = await api('/api/admin/products');
        state.produtos = p;
        renderProdutos();
      } else if (view === 'clientes') {
        state.clientes = await api('/api/admin/customers');
        renderClientes();
      } else if (view === 'pedidos') {
        state.pedidos = await api('/api/admin/orders');
        renderPedidos();
      } else if (view === 'avaliacoes') {
        state.avaliacoes = await api('/api/admin/reviews');
        renderAvaliacoes();
      } else if (view === 'influenciadores') {
        state.influenciadores = await api('/api/admin/influenciadores');
        renderInfluenciadores();
      } else if (view === 'config') {
        state.config = await api('/api/admin/settings');
        renderConfig();
      }
    } catch (err) {
      if (err.message && err.message.indexOf('administrador') > -1) {
        showLogin();
        return;
      }
      $('#view').innerHTML =
        '<div class="panel"><div class="empty-state"><b>Não foi possível carregar</b>' +
        esc(err.message) +
        '</div></div>';
    }
  }
