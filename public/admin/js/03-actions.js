'use strict';

  /* ---------- eventos ---------- */

  document.addEventListener('click', async function (e) {
    var goto = e.target.closest('[data-goto]');
    if (goto) {
      loadView(goto.dataset.goto);
      return;
    }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    if (action === 'novo-produto') {
      openProdutoModal(null);
    } else if (action === 'edit-produto') {
      var produto = state.produtos.filter(function (p) {
        return String(p.id) === String(id);
      })[0];
      if (produto) openProdutoModal(produto);
    } else if (action === 'dup-produto') {
      var dup = state.produtos.filter(function (p) {
        return String(p.id) === String(id);
      })[0];
      if (dup) {
        openProdutoModal(
          null,
          Object.assign({}, dup, { nome: dup.nome + ' (cópia)' })
        );
      }
    } else if (action === 'toggle-produto') {
      var toggle = state.produtos.filter(function (p) {
        return String(p.id) === String(id);
      })[0];
      if (!toggle) return;
      try {
        await api('/api/admin/products/' + encodeURIComponent(id), {
          method: 'PUT',
          body: {
            nome: toggle.nome,
            cat: toggle.cat,
            preco: toggle.preco,
            de: toggle.de,
            estoque: toggle.estoque,
            v: toggle.v,
            badge: toggle.badge,
            art: toggle.art,
            cor: toggle.cor,
            foto: toggle.foto,
            descricao: toggle.descricao,
            ativo: !toggle.ativo,
          },
        });
        toggle.ativo = !toggle.ativo;
        renderProdutos();
        toast(toggle.ativo ? 'Produto ativado' : 'Produto oculto');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'export-clientes') {
      exportClientes();
    } else if (action === 'filtro-pedido') {
      state.filtroPedido = btn.dataset.status;
      renderPedidos();
    } else if (action === 'del-avaliacao') {
      if (!confirm('Excluir esta avaliação? Essa ação não pode ser desfeita.')) return;
      try {
        await api('/api/admin/reviews/' + encodeURIComponent(id), { method: 'DELETE' });
        state.avaliacoes = state.avaliacoes.filter(function (r) {
          return String(r.id) !== String(id);
        });
        renderAvaliacoes();
        toast('Avaliação excluída');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'del-produto') {
      var prod = state.produtos.filter(function (p) {
        return String(p.id) === String(id);
      })[0];
      if (!prod) return;
      if (!confirm('Excluir o produto "' + prod.nome + '"? Essa ação não pode ser desfeita.')) return;
      try {
        await api('/api/admin/products/' + encodeURIComponent(id), { method: 'DELETE' });
        state.produtos = state.produtos.filter(function (p) {
          return String(p.id) !== String(id);
        });
        renderProdutos();
        toast('Produto excluído');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'inf-ver') {
      openInfluenciadorModal(id);
    } else if (action === 'inf-filtro') {
      state.filtroInfluenciador = btn.dataset.status;
      renderInfluenciadores();
    } else if (action === 'inf-aprovar' || action === 'inf-rejeitar' || action === 'inf-pausar' || action === 'inf-ativar') {
      var acoes = { 'inf-aprovar': 'aprovar', 'inf-rejeitar': 'rejeitar', 'inf-pausar': 'pausar', 'inf-ativar': 'ativar' };
      var msgs = {
        aprovar: 'Aprovar este influenciador e gerar o cupom dele?',
        rejeitar: 'Rejeitar este cadastro?',
        pausar: 'Pausar o acesso dele ao portal?',
        ativar: 'Ativar este influenciador?',
      };
      if (!confirm(msgs[acoes[action]])) return;
      try {
        var res = await api('/api/admin/influenciadores/' + encodeURIComponent(id), {
          method: 'PATCH',
          body: { acao: acoes[action] },
        });
        state.influenciadores = await api('/api/admin/influenciadores');
        renderInfluenciadores();
        var modalAberto = !$('#modal').hidden;
        if (modalAberto) openInfluenciadorModal(id);
        toast(
          acoes[action] === 'aprovar'
            ? 'Influenciador aprovado' + (res.cupom ? ' · cupom ' + res.cupom.code : '')
            : acoes[action] === 'rejeitar'
              ? 'Cadastro rejeitado'
              : acoes[action] === 'pausar'
                ? 'Acesso pausado'
                : 'Influenciador ativado'
        );
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'reset-cliente') {
      var novaSenha = prompt('Nova senha do cliente (mínimo 6 caracteres):');
      if (novaSenha == null) return;
      if (String(novaSenha).length < 6) { toast('A senha precisa ter pelo menos 6 caracteres.'); return; }
      try {
        await api('/api/admin/customers/' + encodeURIComponent(id) + '/reset-senha', {
          method: 'POST',
          body: { senha: String(novaSenha) },
        });
        toast('Senha redefinida. Passe a nova senha ao cliente pelo WhatsApp.');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'view-cliente') {
      openClienteModal(id);
    } else if (action === 'del-cliente') {
      var cliente = state.clientes.filter(function (c) {
        return String(c.id) === String(id);
      })[0];
      if (!cliente) return;
      if (!confirm('Excluir o cliente "' + cliente.nome + '"? Os pedidos dele serão mantidos sem vínculo.')) return;
      try {
        await api('/api/admin/customers/' + encodeURIComponent(id), { method: 'DELETE' });
        state.clientes = state.clientes.filter(function (c) {
          return String(c.id) !== String(id);
        });
        renderClientes();
        toast('Cliente excluído');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'view-pedido') {
      openPedidoModal(id);
    } else if (action === 'ped-qty' || action === 'ped-rm') {
      var idx = Number(btn.dataset.line);
      if (action === 'ped-rm') {
        modalPedidoLinhas.splice(idx, 1);
      } else {
        modalPedidoLinhas[idx].qtd = Math.max(1, (Number(modalPedidoLinhas[idx].qtd) || 1) + Number(btn.dataset.delta));
      }
      openPedidoModal(id, true);
    } else if (action === 'ped-save') {
      try {
        await api('/api/admin/orders/' + encodeURIComponent(id), { method: 'PUT', body: { items: modalPedidoLinhas } });
        state.pedidos = await api('/api/admin/orders');
        renderPedidos();
        openPedidoModal(id);
        toast('Pedido atualizado');
      } catch (err) {
        toast(err.message);
      }
    } else if (action === 'close-modal') {
      closeModal();
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'buscaProduto') {
      state.buscaProduto = e.target.value;
      var rows = $('#produtoRows');
      if (rows) rows.innerHTML = produtoRows();
      atualizaContagemProdutos();
    } else if (e.target.id === 'buscaCliente') {
      state.buscaCliente = e.target.value;
      var crows = $('#clienteRows');
      if (crows) crows.innerHTML = clienteRows();
      atualizaContagemClientes();
    } else if (e.target.id === 'buscaPedido') {
      state.buscaPedido = e.target.value;
      var orows = $('#pedidoRows');
      if (orows) orows.innerHTML = pedidoRows();
      atualizaContagemPedidos();
    } else if (e.target.id === 'buscaAvaliacao') {
      state.buscaAvaliacao = e.target.value;
      var arows = $('#avaliacaoRows');
      if (arows) arows.innerHTML = avaliacaoRows();
      atualizaContagemAvaliacoes();
    } else if (e.target.id === 'buscaInfluenciador') {
      state.buscaInfluenciador = e.target.value;
      var irows = $('#influenciadorRows');
      if (irows) irows.innerHTML = influenciadorRows();
    } else if (e.target.id === 'imgUrl') {
      var hidden = $('#fotoInput');
      if (hidden) hidden.value = e.target.value.trim();
      var preview = $('#imgPreview');
      if (preview) {
        if (e.target.value.trim()) {
          var img = new Image();
          img.src = e.target.value.trim();
          img.className = 'image-preview';
          img.id = 'imgPreview';
          img.alt = '';
          preview.replaceWith(img);
        }
      }
    }
  });

  document.addEventListener('change', async function (e) {
    if (e.target.id === 'imgFile') {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        await enviarImagem(file);
      } catch (err) {
        toast(err.message);
      }
      e.target.value = '';
      return;
    }

    if (e.target.classList && e.target.classList.contains('status-select')) {
      var id = e.target.dataset.id;
      var status = e.target.value;
      try {
        await api('/api/admin/orders/' + encodeURIComponent(id), {
          method: 'PATCH',
          body: { status: status },
        });
        state.pedidos.forEach(function (o) {
          if (String(o.id) === String(id)) o.status = status;
        });
        if (state.view === 'pedidos') renderPedidos();
        toast('Status atualizado');
      } catch (err) {
        toast(err.message);
      }
    }
  });

  document.addEventListener('submit', async function (e) {
    var form = e.target;
    if (
      form.id !== 'produtoForm' &&
      form.id !== 'settingsForm' &&
      form.id !== 'passwordForm'
    )
      return;
    e.preventDefault();
    var button = form.querySelector('button[type="submit"]');
    var original = button.textContent;
    button.disabled = true;
    button.textContent = 'Salvando...';
    try {
      if (form.id === 'produtoForm') {
        await salvarProduto(form);
      } else if (form.id === 'settingsForm') {
        var fd = new FormData(form);
        state.config = await api('/api/admin/settings', {
          method: 'PUT',
          body: {
            whatsapp: fd.get('whatsapp'),
            whatsapp_texto: fd.get('whatsapp_texto'),
            frete_jundiai: fd.get('frete_jundiai'),
            frete_varzea: fd.get('frete_varzea'),
          },
        });
        toast('Configurações salvas');
      } else {
        var pf = new FormData(form);
        var senhaErro = $('#senhaErro');
        if (senhaErro) senhaErro.textContent = '';
        if (pf.get('novaSenha') !== pf.get('confirmar')) {
          throw new Error('A confirmação não confere com a nova senha.');
        }
        await api('/api/admin/password', {
          method: 'POST',
          body: {
            senhaAtual: pf.get('senhaAtual'),
            novaSenha: pf.get('novaSenha'),
          },
        });
        form.reset();
        toast('Senha alterada com sucesso');
      }
    } catch (err) {
      if (form.id === 'passwordForm' && $('#senhaErro')) {
        $('#senhaErro').textContent = err.message;
      } else {
        toast(err.message);
      }
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  boot();
