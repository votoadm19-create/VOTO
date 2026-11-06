'use strict';

  /* ---------- resumo ---------- */

  function renderResumo() {
    var s = state.stats;
    var recentes = s.recentes || [];
    var baixo = s.baixoEstoque || [];
    $('#view').innerHTML =
      '<div class="cards">' +
      statCard('Produtos ativos', s.produtosAtivos + ' / ' + s.produtos, '') +
      statCard('Clientes cadastrados', s.clientes, '') +
      statCard('Pedidos', s.pedidos, s.pedidosNovos + ' novo(s)') +
      statCard('Avaliações', s.avaliacoes, '') +
      statCard('Receita registrada', money(s.receita), '', true) +
      '</div>' +
      '<div class="grid-2">' +
      '<div class="panel"><div class="panel-head"><h2>Pedidos recentes</h2>' +
      '<button class="btn ghost small" data-goto="pedidos">Ver todos</button></div>' +
      (recentes.length
        ? '<div class="list">' +
          recentes
            .map(function (o) {
              return (
                '<div class="list-row"><div><b>#' +
                o.id +
                ' · ' +
                esc(o.cliente_nome || 'Cliente') +
                '</b><div class="meta">' +
                esc(o.cidade || '—') +
                ' · ' +
                fmtDate(o.criado_em) +
                '</div></div><div style="text-align:right"><b>' +
                money(o.total) +
                '</b><br><span class="pill ' +
                esc(o.status) +
                '">' +
                esc(STATUS_LABEL[o.status] || o.status) +
                '</span></div></div>'
              );
            })
            .join('') +
          '</div>'
        : '<div class="empty-state"><b>Nenhum pedido ainda</b>Os pedidos feitos por clientes logados aparecem aqui.</div>') +
      '</div>' +
      '<div class="panel"><div class="panel-head"><h2>Estoque baixo</h2>' +
      '<button class="btn ghost small" data-goto="produtos">Gerenciar</button></div>' +
      (baixo.length
        ? '<div class="list">' +
          baixo
            .map(function (p) {
              return (
                '<div class="list-row"><div><b>' +
                esc(p.nome) +
                '</b><div class="meta">' +
                esc(CATS[p.cat] || p.cat) +
                '</div></div><span class="pill low">' +
                p.estoque +
                ' un.</span></div>'
              );
            })
            .join('') +
          '</div>'
        : '<div class="empty-state"><b>Estoque em dia</b>Nenhum produto ativo com 5 unidades ou menos.</div>') +
      '</div></div>';
  }

  function statCard(label, value, hint, accent) {
    return (
      '<div class="stat' +
      (accent ? ' accent' : '') +
      '"><small>' +
      esc(label) +
      '</small><b>' +
      esc(value) +
      '</b>' +
      (hint ? '<div class="meta" style="margin-top:6px;font-size:12px;opacity:.8">' + esc(hint) + '</div>' : '') +
      '</div>'
    );
  }

  /* ---------- produtos ---------- */

  function produtoImagem(p) {
    var src = p.foto;
    if (src && (src.indexOf('/') === 0 || src.indexOf('http') === 0 || src.indexOf('data:') === 0)) {
      return '<img class="thumb" src="' + esc(src) + '" alt="">';
    }
    return '<div class="thumb placeholder">' + esc((p.nome || '?').charAt(0).toUpperCase()) + '</div>';
  }

  function produtosFiltrados() {
    var q = state.buscaProduto.trim().toLowerCase();
    if (!q) return state.produtos;
    return state.produtos.filter(function (p) {
      return (p.nome + ' ' + p.id + ' ' + (p.descricao || '') + ' ' + (CATS[p.cat] || ''))
        .toLowerCase()
        .indexOf(q) > -1;
    });
  }

  function produtoRows() {
    var list = produtosFiltrados();
    if (!list.length) {
      return '<tr><td colspan="7"><div class="empty-state"><b>Nenhum produto encontrado</b>Cadastre um produto novo ou ajuste a busca.</div></td></tr>';
    }
    return list
      .map(function (p) {
        return (
          '<tr>' +
          '<td>' +
          produtoImagem(p) +
          '</td>' +
          '<td class="name-cell"><strong>' +
          esc(p.nome) +
          '</strong><small>#' +
          esc(p.id) +
          '</small></td>' +
          '<td>' +
          esc(CATS[p.cat] || p.cat) +
          '</td>' +
          '<td class="price">' +
          money(p.preco) +
          (p.de ? '<s>' + money(p.de) + '</s>' : '') +
          '</td>' +
          '<td>' +
          (p.estoque <= 5
            ? '<span class="pill low">' + p.estoque + ' un.</span>'
            : p.estoque + ' un.') +
          '</td>' +
          '<td>' +
          (p.ativo ? '<span class="pill on">Ativo</span>' : '<span class="pill off">Oculto</span>') +
          '</td>' +
          '<td class="actions">' +
          '<button class="btn ghost small" data-action="edit-produto" data-id="' +
          esc(p.id) +
          '">Editar</button> ' +
          '<button class="btn ghost small" data-action="dup-produto" data-id="' +
          esc(p.id) +
          '">Duplicar</button> ' +
          '<button class="btn ghost small" data-action="toggle-produto" data-id="' +
          esc(p.id) +
          '">' +
          (p.ativo ? 'Ocultar' : 'Ativar') +
          '</button> ' +
          '<button class="btn danger small" data-action="del-produto" data-id="' +
          esc(p.id) +
          '">Excluir</button>' +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderProdutos() {
    $('#view').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Produtos <span class="pill off" id="produtoCount">' +
      state.produtos.length +
      '</span></h2><div class="toolbar"><input type="search" id="buscaProduto" placeholder="Buscar por nome, ID ou categoria" value="' +
      esc(state.buscaProduto) +
      '"><button class="btn primary" data-action="novo-produto">+ Novo produto</button></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th></th><th>Produto</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Situação</th><th></th></tr></thead><tbody id="produtoRows">' +
      produtoRows() +
      '</tbody></table></div></div>';
    atualizaContagemProdutos();
  }

  function atualizaContagemProdutos() {
    var el = $('#produtoCount');
    if (el) el.textContent = produtosFiltrados().length;
  }

  function produtosSelect(selected) {
    return Object.keys(CATS)
      .map(function (id) {
        return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' + esc(CATS[id]) + '</option>';
      })
      .join('');
  }

  function artsSelect(selected) {
    return ARTS.map(function (a) {
      return '<option value="' + a + '"' + (a === selected ? ' selected' : '') + '>' + a + '</option>';
    }).join('');
  }

  function imagemPreviewHtml(foto, nome) {
    if (foto && (foto.indexOf('/') === 0 || foto.indexOf('http') === 0 || foto.indexOf('data:') === 0)) {
      return '<img class="image-preview" id="imgPreview" src="' + esc(foto) + '" alt="">';
    }
    return '<div class="image-preview placeholder" id="imgPreview">' + esc((nome || '?').charAt(0).toUpperCase()) + '</div>';
  }

  function openProdutoModal(produto, prefill) {
    state.editing = produto || null;
    var p = produto ||
      prefill || {
        nome: '',
        cat: 'kit-f',
        preco: '',
        de: '',
        estoque: 0,
        v: 0,
        badge: '',
        art: 'kit',
        cor: '#e2561c',
        foto: '',
        descricao: '',
        ativo: true,
      };
    var foto = p.foto || '';
    var urlValue = foto.indexOf('http') === 0 || foto.indexOf('/') === 0 ? foto : '';
    $('#modalTitle').textContent = produto
      ? 'Editar produto'
      : prefill
        ? 'Duplicar produto'
        : 'Novo produto';
    $('#modalBody').innerHTML =
      '<form id="produtoForm">' +
      '<div class="form-grid">' +
      label('Nome do produto', '<input name="nome" required maxlength="120" value="' + esc(p.nome) + '">', 'full') +
      '<label>Categoria<select name="cat">' + produtosSelect(p.cat) + '</select></label>' +
      '<label>Preço (R$)<input name="preco" type="number" step="0.01" min="0" required value="' +
      esc(p.preco) +
      '"></label>' +
      label('Preço antigo (opcional)', '<input name="de" type="number" step="0.01" min="0" value="' + esc(p.de || '') + '">') +
      label('Estoque', '<input name="estoque" type="number" min="0" value="' + esc(p.estoque) + '">') +
      label('Vendidos', '<input name="v" type="number" min="0" value="' + esc(p.v) + '">') +
      label('Selo (opcional)', '<input name="badge" maxlength="24" value="' + esc(p.badge || '') + '" placeholder="NOVIDADE">') +
      label(
        'Descrição',
        '<textarea name="descricao" rows="4" maxlength="2000" placeholder="Detalhes do produto, material, medidas...">' +
          esc(p.descricao || '') +
          '</textarea>',
        'full'
      ) +
      '<label>Ilustração<select name="art">' + artsSelect(p.art) + '</select></label>' +
      '<label>Cor<select name="cor">' + corSelect(p.cor) + '</select></label>' +
      '<div class="full"><label>Imagem</label><div class="image-field">' +
      imagemPreviewHtml(foto, p.nome) +
      '<input type="hidden" name="foto" id="fotoInput" value="' + esc(foto) + '">' +
      '<label class="btn ghost small file-label">Enviar imagem<input type="file" id="imgFile" accept="image/*"></label>' +
      '<input type="text" id="imgUrl" placeholder="ou cole uma URL https://..." value="' + esc(urlValue) + '">' +
      '</div></div>' +
      '<label class="check-row full" style="grid-column:1/-1"><input type="checkbox" name="ativo"' +
      (p.ativo ? ' checked' : '') +
      '> Produto visível no site</label>' +
      '</div>' +
      '<div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancelar</button>' +
      '<button type="submit" class="btn primary">' +
      (produto ? 'Salvar alterações' : 'Criar produto') +
      '</button></div></form>';
    openModal();
    setTimeout(function () {
      var input = $('#produtoForm input[name="nome"]');
      if (input) input.focus();
    }, 50);
  }

  function label(text, input, cls) {
    return '<label' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(text) + input + '</label>';
  }

  function corSelect(selected) {
    var cores = ['#e2561c', '#e08a2e', '#f2b705', '#2a9d6f', '#2f78c4', '#e0457b', '#7a5cc9'];
    var list = cores.slice();
    if (selected && list.indexOf(selected) < 0) list.unshift(selected);
    return list
      .map(function (c) {
        return '<option value="' + c + '"' + (c === selected ? ' selected' : '') + '>' + c + '</option>';
      })
      .join('');
  }

  async function salvarProduto(form) {
    var fd = new FormData(form);
    var body = {
      nome: fd.get('nome'),
      cat: fd.get('cat'),
      preco: fd.get('preco'),
      de: fd.get('de') === '' ? null : fd.get('de'),
      estoque: fd.get('estoque'),
      v: fd.get('v'),
      badge: fd.get('badge'),
      art: fd.get('art'),
      cor: fd.get('cor'),
      foto: fd.get('foto') || null,
      descricao: fd.get('descricao') || null,
      ativo: form.querySelector('input[name="ativo"]').checked,
    };
    if (state.editing) {
      await api('/api/admin/products/' + encodeURIComponent(state.editing.id), {
        method: 'PUT',
        body: body,
      });
      toast('Produto atualizado');
    } else {
      await api('/api/admin/products', { method: 'POST', body: body });
      toast('Produto criado');
    }
    closeModal();
    var p = await api('/api/admin/products');
    state.produtos = p;
    if (state.view === 'produtos') renderProdutos();
  }

  async function enviarImagem(file) {
    var dataUrl = await new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    var data = await api('/api/admin/upload', { method: 'POST', body: { dataUrl: dataUrl } });
    var hidden = $('#fotoInput');
    if (hidden) hidden.value = data.url;
    var url = $('#imgUrl');
    if (url) url.value = '';
    var preview = $('#imgPreview');
    if (preview) {
      var img = new Image();
      img.src = data.url;
      img.className = 'image-preview';
      img.id = 'imgPreview';
      img.alt = '';
      preview.replaceWith(img);
    }
    toast('Imagem enviada');
  }

  /* ---------- clientes ---------- */

  function clientesFiltrados() {
    var q = state.buscaCliente.trim().toLowerCase();
    if (!q) return state.clientes;
    return state.clientes.filter(function (c) {
      return (c.nome + ' ' + c.email + ' ' + (c.telefone || '') + ' ' + (c.cpf || ''))
        .toLowerCase()
        .indexOf(q) > -1;
    });
  }

  function clienteRows() {
    var list = clientesFiltrados();
    if (!list.length) {
      return '<tr><td colspan="7"><div class="empty-state"><b>Nenhum cliente encontrado</b>Quando alguém criar conta no site, aparece aqui.</div></td></tr>';
    }
    return list
      .map(function (c) {
        return (
          '<tr><td class="name-cell"><strong>' +
          esc(c.nome) +
          '</strong><small>' +
          esc(c.email) +
          '</small></td>' +
          '<td>' +
          esc(c.telefone || '—') +
          '</td>' +
          '<td>' +
          esc(cpfFmt(c.cpf)) +
          '</td>' +
          '<td>' +
          fmtDate(c.criado_em) +
          '</td>' +
          '<td>' +
          c.pedidos +
          '</td>' +
          '<td class="price">' +
          money(c.total_gasto) +
          '</td>' +
          '<td class="actions"><button class="btn ghost small" data-action="view-cliente" data-id="' +
          c.id +
          '">Ver detalhes</button> ' +
          '<button class="btn danger small" data-action="del-cliente" data-id="' +
          c.id +
          '">Excluir</button></td></tr>'
        );
      })
      .join('');
  }

  function renderClientes() {
    $('#view').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Clientes <span class="pill off" id="clienteCount">' +
      state.clientes.length +
      '</span></h2><div class="toolbar"><input type="search" id="buscaCliente" placeholder="Buscar por nome, e-mail, telefone ou CPF" value="' +
      esc(state.buscaCliente) +
      '"><button class="btn ghost small" data-action="export-clientes">Exportar CSV</button></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>CPF</th><th>Cadastro</th><th>Pedidos</th><th>Total gasto</th><th></th></tr></thead><tbody id="clienteRows">' +
      clienteRows() +
      '</tbody></table></div></div>';
    atualizaContagemClientes();
  }

  function atualizaContagemClientes() {
    var el = $('#clienteCount');
    if (el) el.textContent = clientesFiltrados().length;
  }

  async function openClienteModal(id) {
    $('#modalTitle').textContent = 'Detalhes do cliente';
    $('#modalBody').innerHTML = '<div class="empty-state"><b>Carregando…</b></div>';
    openModal();
    try {
      var data = await api('/api/admin/customers/' + encodeURIComponent(id));
      var c = data.cliente;
      var pedidos = data.pedidos || [];
      $('#modalBody').innerHTML =
        (c.foto
          ? '<div class="client-photo">' +
            '<img class="thumb" src="' +
            esc(c.foto) +
            '" alt=""><div><b>' +
            esc(c.nome) +
            '</b><div class="meta">' +
            esc(c.email) +
            '</div></div></div>'
          : '') +
        '<div class="detail-grid">' +
        detail('Nome', c.nome) +
        detail('E-mail', c.email) +
        detail('Telefone', c.telefone || '—') +
        detail('CPF', cpfFmt(c.cpf)) +
        detail('Cadastrado em', fmtDate(c.criado_em)) +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px"><button class="btn ghost small" data-action="reset-cliente" data-id="' +
        c.id +
        '">Redefinir senha</button></div>' +
        '<h3 style="font-size:15px;margin:14px 0 8px">Pedidos (' +
        pedidos.length +
        ')</h3>' +
        (pedidos.length
          ? pedidos
              .map(function (o) {
                return (
                  '<div class="panel" style="margin-bottom:12px"><div class="panel-head"><h2>#' +
                  o.id +
                  ' · ' +
                  money(o.total) +
                  '</h2><span class="pill ' +
                  esc(o.status) +
                  '">' +
                  esc(STATUS_LABEL[o.status] || o.status) +
                  '</span></div><div class="panel-body"><div class="meta" style="color:var(--muted);font-size:12px;margin-bottom:8px">' +
                  fmtDate(o.criado_em) +
                  ' · ' +
                  esc(o.cidade || '—') +
                  '</div>' +
                  itensHtml(o.itens) +
                  '</div></div>'
                );
              })
              .join('')
          : '<div class="empty-state"><b>Nenhum pedido</b>Este cliente ainda não finalizou pedidos pelo site.</div>');
    } catch (err) {
      $('#modalBody').innerHTML = '<div class="empty-state"><b>Erro</b>' + esc(err.message) + '</div>';
    }
  }

  function detail(label, value) {
    return '<div><small>' + esc(label) + '</small><b>' + esc(value) + '</b></div>';
  }

  /* ---------- pedidos ---------- */

  function pedidosFiltrados() {
    var q = state.buscaPedido.trim().toLowerCase();
    var list = state.pedidos;
    if (state.filtroPedido !== 'todos') {
      list = list.filter(function (o) {
        return o.status === state.filtroPedido;
      });
    }
    if (!q) return list;
    return list.filter(function (o) {
      return (
        String(o.id) +
        ' ' +
        (o.cliente_nome || '') +
        ' ' +
        (o.cliente_email || '') +
        ' ' +
        (o.cidade || '') +
        ' ' +
        (o.status || '')
      )
        .toLowerCase()
        .indexOf(q) > -1;
    });
  }

  function filtroChips() {
    var counts = { todos: state.pedidos.length };
    STATUS.forEach(function (s) {
      counts[s] = 0;
    });
    state.pedidos.forEach(function (o) {
      if (counts[o.status] != null) counts[o.status]++;
    });
    return (
      '<div class="chips">' +
      ['todos'].concat(STATUS)
        .map(function (s) {
          var label = s === 'todos' ? 'Todos' : STATUS_LABEL[s];
          return (
            '<button type="button" class="chip' +
            (state.filtroPedido === s ? ' on' : '') +
            '" data-action="filtro-pedido" data-status="' +
            s +
            '">' +
            esc(label) +
            ' <b>' +
            (counts[s] || 0) +
            '</b></button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function pedidoRows() {
    var list = pedidosFiltrados();
    if (!list.length) {
      return '<tr><td colspan="7"><div class="empty-state"><b>Nenhum pedido</b>Os pedidos registrados no site aparecem aqui.</div></td></tr>';
    }
    return list
      .map(function (o) {
        var itens = Array.isArray(o.itens) ? o.itens : [];
        return (
          '<tr><td><b>#' +
          o.id +
          '</b></td>' +
          '<td class="name-cell"><strong>' +
          esc(o.cliente_nome || 'Cliente') +
          '</strong><small>' +
          esc(o.cliente_email || o.cliente_telefone || '') +
          '</small></td>' +
          '<td>' +
          esc(o.cidade || '—') +
          '</td>' +
          '<td>' +
          itens.reduce(function (a, i) {
            return a + (Number(i.qtd) || 1);
          }, 0) +
          ' item(ns)</td>' +
          '<td class="price">' +
          money(o.total) +
          '</td>' +
          '<td><select class="status-select" data-id="' +
          o.id +
          '">' +
          STATUS.map(function (s) {
            return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
          }).join('') +
          '</select></td>' +
          '<td class="actions"><button class="btn ghost small" data-action="view-pedido" data-id="' +
          o.id +
          '">Detalhes</button></td></tr>'
        );
      })
      .join('');
  }

  function renderPedidos() {
    $('#view').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Pedidos <span class="pill off" id="pedidoCount">' +
      state.pedidos.length +
      '</span></h2><div class="toolbar"><input type="search" id="buscaPedido" placeholder="Buscar por cliente, cidade, status ou #" value="' +
      esc(state.buscaPedido) +
      '"></div></div>' +
      filtroChips() +
      '<div class="table-wrap"><table><thead><tr><th>#</th><th>Cliente</th><th>Cidade</th><th>Itens</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody id="pedidoRows">' +
      pedidoRows() +
      '</tbody></table></div></div>';
    atualizaContagemPedidos();
  }

  function atualizaContagemPedidos() {
    var el = $('#pedidoCount');
    if (el) el.textContent = pedidosFiltrados().length;
  }

  function itensHtml(itens) {
    if (!Array.isArray(itens) || !itens.length) return '<p class="hint">Sem itens registrados.</p>';
    return (
      '<ul class="order-items">' +
      itens
        .map(function (i) {
          var qtd = Number(i.qtd) || 1;
          var preco = Number(i.preco) || 0;
          return (
            '<li><b>' +
            qtd +
            'x</b> ' +
            esc(i.nome || 'Item') +
            ' — ' +
            money(preco * qtd) +
            (Array.isArray(i.det) && i.det.length
              ? '<br><small style="color:var(--muted)">' + i.det.map(esc).join(' · ') + '</small>'
              : '') +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  var modalPedidoLinhas = null;

  function openPedidoModal(id, keepLines) {
    var o = state.pedidos.filter(function (x) {
      return String(x.id) === String(id);
    })[0];
    if (!o) return;
    if (!keepLines) {
      modalPedidoLinhas = (o.itens || []).map(function (it) {
        return { key: it.key || null, pid: it.pid || null, nome: it.nome, preco: it.preco, qtd: it.qtd || 1, det: it.det || null };
      });
    }
    $('#modalTitle').textContent = 'Pedido #' + o.id;
    var fone = String(o.cliente_telefone || '').replace(/\D/g, '');
    var waMsg = 'Olá! Sobre o seu pedido #' + o.id + ' na Voto. ' + money(o.total);
    var wa = fone ? '<a class="btn primary" target="_blank" rel="noopener" href="https://wa.me/55' + fone + '?text=' + encodeURIComponent(waMsg) + '">WhatsApp do cliente</a>' : '';
    var editavel = o.status !== 'entregue' && o.status !== 'cancelado';
    $('#modalBody').innerHTML =
      '<div class="detail-grid">' +
      detail('Cliente', o.cliente_nome || 'Cliente') +
      detail('E-mail', o.cliente_email || '—') +
      detail('Telefone', o.cliente_telefone || '—') +
      detail('Cidade', o.cidade || '—') +
      detail('Status', STATUS_LABEL[o.status] || o.status) +
      detail('Data', fmtDate(o.criado_em)) +
      '</div>' +
      (wa ? '<div style="margin:12px 0">' + wa + '</div>' : '') +
      '<h3 style="font-size:15px;margin:0 0 8px">Itens</h3>' +
      (editavel ? pedalinhas(modalPedidoLinhas) : itensHtml(o.itens)) +
      (editavel ? '<div style="margin:12px 0 8px"><button class="btn primary" data-action="ped-save" data-id="' + o.id + '">Salvar alterações nos itens</button></div>' : '') +
      '<div class="detail-grid" style="margin-top:16px">' +
      detail('Subtotal', money(o.subtotal)) +
      detail('Entrega', money(o.frete)) +
      detail('Total', money(o.total)) +
      '</div>';
    openModal();
  }

  function pedalinhas(linhas) {
    var editable = true;
    if (!Array.isArray(linhas) || !linhas.length) return '<p class="hint">Sem itens registrados.</p>';
    return (
      '<ul class="order-items">' +
      linhas
        .map(function (it, idx) {
          return '<li>' +
            esc(it.nome || 'Item') +
            ' — ' +
            money((Number(it.preco) || 0) * (Number(it.qtd) || 1)) +
            ' <span style="display:inline-flex;gap:6px;align-items:center;margin-left:8px">' +
            '<button class="btn ghost small" data-action="ped-qty" data-line="' + idx + '" data-delta="-1">−</button>' +
            '<b>' + (Number(it.qtd) || 1) + '</b>' +
            '<button class="btn ghost small" data-action="ped-qty" data-line="' + idx + '" data-delta="1">+</button>' +
            (editable && linhas.length > 1 ? '<button class="btn danger small" data-action="ped-rm" data-line="' + idx + '">Remover</button>' : '') +
            '</span></li>';
        })
        .join('') +
      '</ul>'
    );
  }

  /* ---------- avaliações ---------- */

  function estrelas(nota) {
    var n = Math.round(Number(nota) || 0),
      s = '';
    for (var i = 1; i <= 5; i++) s += '<span class="' + (i <= n ? 'on' : '') + '">★</span>';
    return '<span class="stars-inline">' + s + '</span>';
  }

  function avaliacoesFiltradas() {
    var q = state.buscaAvaliacao.trim().toLowerCase();
    if (!q) return state.avaliacoes;
    return state.avaliacoes.filter(function (r) {
      return (
        (r.produto_nome || '') +
        ' ' +
        (r.customer_nome || '') +
        ' ' +
        (r.comentario || '')
      )
        .toLowerCase()
        .indexOf(q) > -1;
    });
  }

  function avaliacaoRows() {
    var list = avaliacoesFiltradas();
    if (!list.length) {
      return '<tr><td colspan="6"><div class="empty-state"><b>Nenhuma avaliação</b>As avaliações enviadas pelos clientes aparecem aqui.</div></td></tr>';
    }
    return list
      .map(function (r) {
        return (
          '<tr><td class="name-cell"><strong>' +
          esc(r.produto_nome || 'Produto removido') +
          '</strong><small>#' +
          esc(r.product_id) +
          '</small></td>' +
          '<td>' +
          esc(r.customer_nome || 'Cliente') +
          '</td>' +
          '<td>' +
          estrelas(r.nota) +
          ' <b>' +
          esc(r.nota) +
          '</b></td>' +
          '<td class="review-comment">' +
          esc(r.comentario || '—') +
          '</td>' +
          '<td>' +
          fmtDate(r.criado_em) +
          '</td>' +
          '<td class="actions"><button class="btn danger small" data-action="del-avaliacao" data-id="' +
          r.id +
          '">Excluir</button></td></tr>'
        );
      })
      .join('');
  }

  function renderAvaliacoes() {
    $('#view').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Avaliações <span class="pill off" id="avaliacaoCount">' +
      state.avaliacoes.length +
      '</span></h2><div class="toolbar"><input type="search" id="buscaAvaliacao" placeholder="Buscar por produto, cliente ou comentário" value="' +
      esc(state.buscaAvaliacao) +
      '"></div></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Produto</th><th>Cliente</th><th>Nota</th><th>Comentário</th><th>Data</th><th></th></tr></thead><tbody id="avaliacaoRows">' +
      avaliacaoRows() +
      '</tbody></table></div></div>';
    atualizaContagemAvaliacoes();
  }

  function atualizaContagemAvaliacoes() {
    var el = $('#avaliacaoCount');
    if (el) el.textContent = avaliacoesFiltradas().length;
  }

  /* ---------- influenciadores ---------- */

  var INF_STATUS_LABEL = {
    pendente: 'Pendente',
    ativo: 'Ativo',
    pausado: 'Pausado',
    rejeitado: 'Rejeitado',
  };
  var INF_STATUS_CLASS = {
    pendente: 'warn',
    ativo: 'on',
    pausado: 'off',
    rejeitado: 'bad',
  };

  function influenciadoresFiltrados() {
    var q = state.buscaInfluenciador.trim().toLowerCase();
    return state.influenciadores.filter(function (i) {
      if (state.filtroInfluenciador !== 'todos' && (i.status || 'pendente') !== state.filtroInfluenciador) return false;
      if (!q) return true;
      return (i.nome + ' ' + i.email + ' ' + (i.cidade || '') + ' ' + (i.cupom || ''))
        .toLowerCase()
        .indexOf(q) > -1;
    });
  }

  function infAcoes(i) {
    var st = i.status || 'pendente';
    var btns = '';
    if (st === 'pendente' || st === 'rejeitado') {
      btns += '<button class="btn primary small" data-action="inf-aprovar" data-id="' + i.id + '">Aprovar</button>';
    }
    if (st === 'pendente') {
      btns += '<button class="btn danger small" data-action="inf-rejeitar" data-id="' + i.id + '">Rejeitar</button>';
    }
    if (st === 'ativo') {
      btns += '<button class="btn ghost small" data-action="inf-pausar" data-id="' + i.id + '">Pausar</button>';
    }
    if (st === 'pausado' || st === 'rejeitado') {
      btns += '<button class="btn primary small" data-action="inf-ativar" data-id="' + i.id + '">Ativar</button>';
    }
    return btns;
  }

  function influenciadorRows() {
    var list = influenciadoresFiltrados();
    if (!list.length) {
      return '<tr><td colspan="7"><div class="empty-state"><b>Nenhum influenciador encontrado</b>Cadastros feitos na página de influenciadores aparecem aqui.</div></td></tr>';
    }
    return list
      .map(function (i) {
        return (
          '<tr><td class="name-cell"><strong>' +
          esc(i.nome) +
          '</strong><small>' +
          esc(i.email) +
          '</small></td>' +
          '<td><span class="pill ' +
          (INF_STATUS_CLASS[i.status] || 'off') +
          '">' +
          esc(INF_STATUS_LABEL[i.status] || i.status || 'Pendente') +
          '</span></td>' +
          '<td>' +
          esc([i.cidade, i.rede].filter(Boolean).join(' · ') || '—') +
          '</td>' +
          '<td>' +
          esc(i.cupom || '—') +
          '</td>' +
          '<td>' +
          i.pedidos +
          '</td>' +
          '<td>' +
          money(i.vendas || 0) +
          '</td>' +
          '<td class="actions"><button class="btn ghost small" data-action="inf-ver" data-id="' +
          i.id +
          '">Ver</button>' +
          infAcoes(i) +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderInfluenciadores() {
    var pendentes = state.influenciadores.filter(function (i) { return (i.status || 'pendente') === 'pendente'; }).length;
    var ativos = state.influenciadores.filter(function (i) { return (i.status || 'pendente') === 'ativo'; }).length;
    var filtros = [
      ['todos', 'Todos (' + state.influenciadores.length + ')'],
      ['pendente', 'Pendentes (' + pendentes + ')'],
      ['ativo', 'Ativos (' + ativos + ')'],
      ['pausado', 'Pausados'],
      ['rejeitado', 'Rejeitados'],
    ];
    $('#view').innerHTML =
      '<div class="panel"><div class="panel-head"><h2>Influenciadores <span class="pill off" id="influenciadorCount">' +
      state.influenciadores.length +
      '</span></h2><div class="toolbar"><input type="search" id="buscaInfluenciador" placeholder="Nome, e-mail, cidade ou cupom" value="' +
      esc(state.buscaInfluenciador) +
      '"></div></div>' +
      '<div class="chips">' +
      filtros
        .map(function (f) {
          return '<button class="chip' + (state.filtroInfluenciador === f[0] ? ' on' : '') + '" data-action="inf-filtro" data-status="' + f[0] + '">' + esc(f[1]) + '</button>';
        })
        .join('') +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Influenciador</th><th>Situação</th><th>Cidade / rede</th><th>Cupom</th><th>Pedidos</th><th>Vendas</th><th></th></tr></thead><tbody id="influenciadorRows">' +
      influenciadorRows() +
      '</tbody></table></div></div>';
  }

  async function openInfluenciadorModal(id) {
    $('#modalTitle').textContent = 'Detalhes do influenciador';
    $('#modalBody').innerHTML = '<div class="empty-state"><b>Carregando…</b></div>';
    openModal();
    try {
      var data = await api('/api/admin/influenciadores/' + encodeURIComponent(id));
      var i = data.influenciador;
      var cupom = data.cupom;
      var pedidos = data.pedidos || [];
      var pags = data.pagamentos || [];
      var botoes =
        i.status === 'pendente' || i.status === 'rejeitado'
          ? '<button class="btn primary" data-action="inf-aprovar" data-id="' + i.id + '">Aprovar e gerar cupom</button>'
          : '';
      botoes +=
        i.status === 'pendente'
          ? '<button class="btn danger" data-action="inf-rejeitar" data-id="' + i.id + '">Rejeitar cadastro</button>'
          : '';
      botoes +=
        i.status === 'ativo'
          ? '<button class="btn ghost" data-action="inf-pausar" data-id="' + i.id + '">Pausar acesso</button>'
          : '';
      botoes +=
        i.status === 'pausado' || i.status === 'rejeitado'
          ? '<button class="btn primary" data-action="inf-ativar" data-id="' + i.id + '">Ativar</button>'
          : '';
      $('#modalBody').innerHTML =
        '<div class="panel" style="margin-bottom:12px"><div class="panel-head"><h2>' +
        esc(i.nome) +
        '</h2><span class="pill ' +
        (INF_STATUS_CLASS[i.status] || 'off') +
        '">' +
        esc(INF_STATUS_LABEL[i.status] || i.status || 'Pendente') +
        '</span></div></div>' +
        '<div class="detail-grid">' +
        detail('E-mail', i.email) +
        detail('Telefone', i.telefone || '—') +
        detail('CPF', cpfFmt(i.cpf)) +
        detail('Cidade', i.cidade || '—') +
        detail('Onde divulga', (i.rede || '—') + (i.usuario ? ' · ' + i.usuario : '')) +
        detail('Alcance', i.seg || '—') +
        detail('Chave Pix', (i.pixTipo ? i.pixTipo + ': ' : '') + (i.pixChave || '—')) +
        detail('Cupom', cupom ? cupom.code + ' · ' + cupom.disc * 100 + '% desc / ' + cupom.credit * 100 + '% crédito · ' + (cupom.on ? 'ativo' : 'pausado') : 'Ainda sem cupom') +
        detail('Cadastrado em', fmtDate(i.criadoEm)) +
        '</div>' +
        '<div class="detail-grid">' +
        detail('Pedidos com o cupom', String(i.pedidos)) +
        detail('Vendas', money(i.vendas || 0)) +
        detail('Crédito liberado', money(i.liberado || 0)) +
        detail('Já recebido (Pix)', money(i.recebido || 0)) +
        '</div>' +
        (pedidos.length
          ? '<h3 style="font-size:15px;margin:14px 0 10px">Pedidos (' +
            pedidos.length +
            ')</h3>' +
            pedidos
              .map(function (o) {
                return (
                  '<div class="panel" style="margin-bottom:12px"><div class="panel-head"><h2>#' +
                  o.id +
                  ' · ' +
                  money(o.sub) +
                  '</h2><span class="pill off">' +
                  esc(o.s) +
                  '</span></div><div class="panel-body"><div class="meta" style="color:var(--muted);font-size:12px;margin-bottom:8px">' +
                  esc(o.d) +
                  ' · ' +
                  esc(o.cu) +
                  ' · crédito ' +
                  money(o.credito || 0) +
                  '</div></div></div>'
                );
              })
              .join('')
          : '<div class="empty-state"><b>Nenhum pedido</b>Este influenciador ainda não gerou vendas com cupom.</div>') +
        (pags.length
          ? '<h3 style="font-size:15px;margin:14px 0 10px">Pagamentos Pix (' +
            pags.length +
            ')</h3>' +
            pags
              .map(function (p) {
                return '<div class="meta">' + esc(p.d) + ' · <b>' + money(p.valor) + '</b></div>';
              })
              .join('')
          : '') +
        (botoes ? '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">' + botoes + '</div>' : '');
    } catch (err) {
      $('#modalBody').innerHTML = '<div class="empty-state"><b>Erro</b>' + esc(err.message) + '</div>';
    }
  }

  /* ---------- configurações ---------- */

  function renderConfig() {
    var c = state.config || {};
    $('#view').innerHTML =
      '<div class="grid-2">' +
      '<div class="panel"><div class="panel-head"><h2>Contato e entrega</h2></div>' +
      '<form id="settingsForm" class="form-grid">' +
      label(
        'WhatsApp (com código do país e DDD)',
        '<input name="whatsapp" value="' +
          esc(c.whatsapp || '') +
          '" placeholder="5511947400141" required>'
      ) +
      label(
        'WhatsApp exibido no site',
        '<input name="whatsapp_texto" value="' +
          esc(c.whatsapp_texto || '') +
          '" placeholder="11 94740-0141">'
      ) +
      label(
        'Entrega em Jundiaí (R$)',
        '<input name="frete_jundiai" type="number" step="0.01" min="0" value="' +
          esc(c.frete_jundiai || 0) +
          '" required>'
      ) +
      label(
        'Entrega em Várzea Paulista (R$)',
        '<input name="frete_varzea" type="number" step="0.01" min="0" value="' +
          esc(c.frete_varzea || 0) +
          '" required>'
      ) +
      '<p class="hint full">Esses dados atualizam o site e as mensagens enviadas pelo WhatsApp.</p>' +
      '<div class="form-actions full"><button type="submit" class="btn primary">Salvar configurações</button></div>' +
      '</form></div>' +
      '<div class="panel"><div class="panel-head"><h2>Senha do painel</h2></div>' +
      '<form id="passwordForm" class="form-grid">' +
      label(
        'Senha atual',
        '<input name="senhaAtual" type="password" autocomplete="current-password" required>'
      ) +
      label(
        'Nova senha',
        '<input name="novaSenha" type="password" autocomplete="new-password" minlength="6" required>'
      ) +
      label(
        'Confirmar nova senha',
        '<input name="confirmar" type="password" autocomplete="new-password" minlength="6" required>'
      ) +
      '<p class="erro full" id="senhaErro" role="alert"></p>' +
      '<div class="form-actions full"><button type="submit" class="btn primary">Alterar senha</button></div>' +
      '</form></div></div>';
  }

  /* ---------- clientes: exportação ---------- */

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportClientes() {
    var rows = [['ID', 'Nome', 'E-mail', 'Telefone', 'CPF', 'Cadastro', 'Pedidos', 'Total gasto']];
    clientesFiltrados().forEach(function (c) {
      rows.push([
        c.id,
        c.nome,
        c.email,
        c.telefone || '',
        cpfFmt(c.cpf),
        c.criado_em || '',
        c.pedidos,
        c.total_gasto,
      ]);
    });
    var csv = rows
      .map(function (r) {
        return r.map(csvCell).join(';');
      })
      .join('\r\n');
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'clientes-voto.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    toast('CSV exportado');
  }

  /* ---------- modal ---------- */

  function openModal() {
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modal').hidden = true;
    document.body.style.overflow = '';
    state.editing = null;
  }

  $('#modalClose').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', function (e) {
    if (e.target === $('#modal')) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });
