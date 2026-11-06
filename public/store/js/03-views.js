'use strict';

        function vHome() {
          var list = filtered(),
            q = S.q.trim();
          var h = '<div class="in"><div class="stack">';
          if (q) {
            h +=
              '<h2 class="sec">' +
              (list.length
                ? list.length +
                  (list.length === 1 ? ' resultado' : ' resultados') +
                  ' para “' +
                  q.replace(/[<>&"]/g, '') +
                  '”'
                : 'Nada encontrado') +
              '</h2>';
            if (!list.length)
              h +=
                '<div class="empty"><h2>Não achamos esse produto</h2><p>Tente outra palavra ou peça direto pelo WhatsApp.</p><a class="btn1 wa" style="max-width:280px" href="https://wa.me/' +
                WA +
                '" target="_blank" rel="noopener">' +
                ic('chat', 20) +
                ' Falar no WhatsApp</a></div>';
            else h += '<div class="grid">' + list.map(card).join('') + '</div>';
            return h + '</div></div>';
          }
          if (S.cat === 'tudo') {
            h += heroHTML();
            h +=
              '<a class="pillbar" href="#montar"><b>Voto Kit</b><span>Monte o kit do jeito que você quer</span>' +
              '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></a>';
            h +=
              '<a class="pillbar" href="/influenciador"><b>Seja Influenciador</b><span>Indique a Voto e ganhe por cada compra com o seu cupom</span>' +
              '<svg class="ic" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></a>';
            h +=
              '<div class="shorts">' +
              short(
                'box',
                'Kits prontos',
                'href="#" data-a="cat" data-v="kit-f"'
              ) +
              short('build', 'Montar kit', 'href="#montar"') +
              short(
                'star',
                'Mais vendidos',
                'href="#" data-a="cat" data-v="top"'
              ) +
              short(
                'bag',
                'Mochilas',
                'href="#" data-a="cat" data-v="mochilas"'
              ) +
              short(
                'pencil',
                'Papelaria',
                'href="#" data-a="cat" data-v="papelaria"'
              ) +
              short('shirt', 'Moda', 'href="#" data-a="cat" data-v="moda"') +
              short('chat', 'WhatsApp', 'href="https://wa.me/' + WA + '" target="_blank" rel="noopener"') +
              short('users', 'Influenciador', 'href="/influenciador"') +
              short('ticket', 'Cupons', 'href="/cupons"') +
              '</div>';
              h += adsHTML();
            var ofs = [
              'mochila-infantil',
              'vestido-infantil',
              'lapis-de-cor-24',
            ]
              .map(function (i) {
                return byId[i];
              })
              .filter(Boolean);
            h +=
              '<div class="grid">' +
              (ofs.length
                ? '<section class="offers" aria-label="Ofertas da semana"><h2>OFERTAS DA SEMANA</h2><div class="list">' +
                  ofs
                    .map(function (p) {
                      return (
                        '<a class="mini" href="#produto-' +
                        p.id +
                        '"><div class="tile">' +
                        pic(p) +
                        '</div><span class="off">' +
                        off(p) +
                        '% OFF</span><s>' +
                        fmt(p.de) +
                        '</s><span class="p">' +
                        priceHTML(p.preco) +
                        '</span></a>'
                      );
                    })
                    .join('') +
                  '</div></section>'
                : '') +
              list.map(card).join('') +
              '</div>';
            h +=
              '<p class="note">Preços de exemplo. Os valores finais são confirmados no WhatsApp.</p>';
          } else {
            var nm =
              S.cat === 'top'
                ? 'Mais vendidos'
                : S.cat === 'moda'
                  ? 'Moda'
                  : TABLBL[S.cat];
            h +=
              '<h2 class="sec">' +
              nm +
              '</h2><div class="grid">' +
              list.map(card).join('') +
              '</div>';
          }
          return h + '</div></div>';
        }
            /* faixa de anúncios em movimento */
function adsHTML() {
  var l = P.slice()
    .sort(function (a, b) {
      return b.v - a.v;
    })
    .slice(0, 10);
  function item(p, dup) {
    return (
      '<a class="ad" href="#produto-' +
      p.id +
      '"' +
      (dup ? ' aria-hidden="true" tabindex="-1"' : '') +
      '><div class="tile">' +
      pic(p) +
      (p.de ? '<span class="tag">' + off(p) + '% OFF</span>' : '') +
      '</div><h3>' +
      p.nome +
      '</h3>' +
      (p.de ? '<s>' + fmt(p.de) + '</s>' : '') +
      '<div class="p">' +
      priceHTML(p.preco) +
      '</div><div class="fr">Entrega em até 3 dias úteis</div></a>'
    );
  }
  return (
    '<section class="ads" aria-label="Produtos em destaque"><div class="ads-h"><h2>Produtos em destaque</h2><a href="#" data-a="cat" data-v="top">Ver todos</a></div><div class="ads-view"><div class="ads-track" style="--dur:' +
    l.length * 4 +
    's">' +
    l.map(function (p) { return item(p, false); }).join('') +
    l.map(function (p) { return item(p, true); }).join('') +
    '</div></div></section>'
  );
}

    /* slider do banner (estilo Shopee) */
function heroHTML() {
  var slides = [
    { t: 'Volta às aulas', h: 'Kit escolar completo', p: 'Escolha pronto ou monte do seu jeito. Entrega em até 3 dias úteis.', b: 'Montar meu kit', a: 'href="#montar"', art: 'kit', cor: '#e08a2e', bg: '#ff8a1f' },
    { t: 'Uniformes', h: 'Uniformes e moda escolar', p: 'Camisetas e vestidos para o ano todo. Entrega em até 3 dias úteis.', b: 'Ver uniformes', a: 'href="#" data-a="cat" data-v="moda"', art: 'camiseta', cor: '#2f78c4', bg: '#2f78c4' },
    { t: 'Mochilas', h: 'Mochilas para toda a turma', p: 'Modelos resistentes e cheios de estilo para todas as idades.', b: 'Ver mochilas', a: 'href="#" data-a="cat" data-v="mochilas"', art: 'mochila', cor: '#e2561c', bg: '#2a9d6f' },
    { t: 'Papelaria', h: 'Papelaria e materiais', p: 'Cadernos, lápis e tudo da lista escolar em um só lugar.', b: 'Ver papelaria', a: 'href="#" data-a="cat" data-v="papelaria"', art: 'lapis', cor: '#2f78c4', bg: '#f2b705' },
    { t: 'Materiais', h: 'Materiais escolares', p: 'Tudo para a lista do ano, separado por segmento.', b: 'Ver materiais', a: 'href="#" data-a="cat" data-v="material"', art: 'caderno', cor: '#e2561c', bg: '#7a5cc9' },
    { t: 'Ensino Médio', h: 'Kit Ensino Médio', p: 'Kits prontos com o que o aluno precisa do 1º ao 3º ano.', b: 'Ver kits', a: 'href="#" data-a="cat" data-v="kit-m"', art: 'estojo', cor: '#2f78c4', bg: '#e2561c' },
  ];
  return (
    '<div class="hero-wrap"><section class="hero-main" aria-label="Destaques"><div class="hero-track" id="hero">' +
    slides
      .map(function (s) {
        return (
          '<div class="banner" style="--c:' + s.bg + '"><div class="txt"><small>' + s.t + '</small><h2>' + s.h + '</h2><p>' + s.p + '</p><a class="btn" ' + s.a + '>' + s.b + '</a></div>' + art(s.art, s.cor) + '</div>'
        );
      })
      .join('') +
    '</div><button class="hero-nav prev" type="button" data-hero="-1" aria-label="Slide anterior">&#8249;</button>' +
    '<button class="hero-nav next" type="button" data-hero="1" aria-label="Próximo slide">&#8250;</button>' +
    '<div class="hero-dots">' +
    slides
      .map(function (s, i) {
        return '<button type="button" data-hi="' + i + '" aria-label="Ir para o slide ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>';
      })
      .join('') +
    '</div></section><div class="hero-side">' +
    '<a class="hside" style="--c:#ff8a1f" href="#" data-a="cat" data-v="top"><small>Em destaque</small><b>Mais vendidos</b><span>Os queridinhos da lista escolar</span></a>' +
    '<a class="hside" style="--c:#2a9d6f" href="https://wa.me/' + WA + '" target="_blank" rel="noopener"><small>Atendimento</small><b>Peça pelo WhatsApp</b><span>Entrega em até 3 dias úteis</span></a>' +
    '</div></div>'
  );
}

        function vCats() {
          return (
            '<div class="in"><div class="stack"><h2 class="sec">Categorias</h2><div class="cats">' +
            CATS.filter(function (c) {
              return c.id !== 'tudo';
            })
              .map(function (c) {
                return (
                  '<button class="cat" data-a="cat" data-v="' +
                  c.id +
                  '"><i>' +
                  ic(c.ic, 24) +
                  '</i>' +
                  c.nome +
                  '</button>'
                );
              })
              .join('') +
            '</div></div></div>'
          );
        }

        function vProduct(p) {
          var opts = '';
          for (var i = 1; i <= 10; i++) opts += '<option>' + i + '</option>';
          return (
            '<div class="pbody"><div class="pimg">' +
            pic(p) +
            '<a class="fab l" href="#" data-a="back" aria-label="Voltar">' +
            ic('back', 22) +
            '</a>' +
            '<a class="fab r" href="#carrinho" aria-label="Ir para o carrinho">' +
            ic('cart', 22) +
            '</a>' +
            '<button type="button" class="fav pimgfav' +
            (isFav(p.id) ? ' on' : '') +
            '" data-a="fav" data-id="' +
            p.id +
            '" aria-label="Favoritar ' +
            p.nome +
            '">' +
            ic('heart', 22) +
            '</button></div>' +
            '<div class="in"><div class="stack" style="gap:14px;padding-top:16px">' +
            (p.badge ? '<span class="tag">' + p.badge + '</span>' : '') +
            '<h1 class="ptitle">' +
            p.nome +
            '</h1>' +
            (p.total_avaliacoes
              ? '<div class="ratingline">' +
                starsHTML(p.nota_media) +
                ' <b>' +
                p.nota_media +
                '</b> <span>(' +
                p.total_avaliacoes +
                ' avaliações)</span></div>'
              : '<div class="ratingline muted">Ainda sem avaliações</div>') +
            (p.descricao
              ? '<p class="pdesc">' +
                h(p.descricao).replace(/\n/g, '<br>') +
                '</p>'
              : '') +
            '<div style="color:var(--muted);font-weight:600;font-size:14px">' +
            p.v +
            ' vendidos</div>' +
            (p.de
              ? '<s style="color:var(--muted)">' + fmt(p.de) + '</s>'
              : '') +
            '<div class="big">' +
            priceHTML(p.preco) +
            (p.de ? '<em>' + off(p) + '% OFF</em>' : '') +
            '</div>' +
            '<div style="color:var(--muted);font-size:14px">Pague pelo WhatsApp, com Pix.</div>' +
            '<span class="freeb">ENTREGA EM ATÉ 3 DIAS ÚTEIS</span>' +
            '<div>Entrega em ' +
            S.cidade +
            ' a partir de <b>' +
            fmt(FRETE[S.cidade]) +
            '</b>, depois da confirmação do pagamento.</div>' +
            '<a class="link" href="#mais">Mais detalhes e formas de entrega</a>' +
            '<div class="qtyrow"><label for="qtySel">Quantidade:</label><select id="qtySel">' +
            opts +
            '</select></div>' +
            '<a class="btn2 wa" id="waProd" href="' +
            waProduct(p, 1) +
            '" target="_blank" rel="noopener" style="color:#fff">' +
            ic('chat', 20) +
            ' Pedir direto pelo WhatsApp</a>' +
            '</div></div>' +
            '<div class="in"><div class="stack" id="reviewsSection" style="padding-top:6px">' +
            '<h2 class="sec">Avaliações de clientes</h2>' +
            '<div class="panel" id="reviewsBox"><p class="oempty" style="margin:0">Carregando avaliações...</p></div>' +
            '</div></div></div>' +
            '<div class="actbar"><div class="in"><button class="btn2" data-a="addq" data-id="' +
            p.id +
            '">Adicionar ao carrinho</button><button class="btn1" data-a="buy" data-id="' +
            p.id +
            '">Comprar agora</button></div></div>'
          );
        }

        function reviewsHTML(p, data) {
          var list = data.avaliacoes || [];
          var html =
            '<div class="revsum">' +
            (data.media
              ? '<div class="revbig">' +
                data.media +
                '</div><div>' +
                starsHTML(data.media) +
                '<div class="revcount">' +
                data.total +
                ' avaliação(ões)</div></div>'
              : '<div class="revcount">Ainda não há avaliações para este produto.</div>') +
            '</div>';
          if (S.user) {
            html +=
              '<form id="reviewForm" class="reviewform" data-pid="' +
              p.id +
              '"><div class="revstars"><label for="revNota">Sua nota</label>' +
              '<select name="nota" id="revNota">' +
              '<option value="5">★★★★★ Excelente</option>' +
              '<option value="4">★★★★ Muito bom</option>' +
              '<option value="3">★★★ Bom</option>' +
              '<option value="2">★★ Regular</option>' +
              '<option value="1">★ Ruim</option></select></div>' +
              '<textarea name="comentario" maxlength="600" placeholder="Conte como foi sua experiência com o produto..."></textarea>' +
              '<p class="authmsg" id="revMsg" role="alert"></p>' +
              '<button class="btn1" type="submit">Publicar avaliação</button></form>';
          } else {
            html +=
              '<p class="oempty">Faça <a class="link" href="#conta">login ou crie sua conta</a> para avaliar este produto.</p>';
          }
          html += list.length
            ? '<div class="revlist">' +
              list
                .map(function (r) {
                  return (
                    '<div class="review"><div class="reviewhead"><b>' +
                    h(r.customer_nome || 'Cliente') +
                    '</b>' +
                    starsHTML(r.nota) +
                    '</div><div class="revdate">' +
                    h(String(r.criado_em || '').slice(0, 10)) +
                    '</div>' +
                    (r.comentario
                      ? '<p>' + h(r.comentario).replace(/\n/g, '<br>') + '</p>'
                      : '') +
                    '</div>'
                  );
                })
                .join('') +
              '</div>'
            : '';
          return html;
        }

        function loadReviews(pid) {
          var p = byId[pid];
          if (!p) return;
          apiJSON('/api/products/' + encodeURIComponent(pid) + '/reviews')
            .then(function (data) {
              var box = document.getElementById('reviewsBox');
              if (box) box.innerHTML = reviewsHTML(p, data);
            })
            .catch(function () {
              var box = document.getElementById('reviewsBox');
              if (box)
                box.innerHTML =
                  '<p class="oempty" style="margin:0">Não foi possível carregar as avaliações.</p>';
            });
        }

        function stepper(id, qtd, a) {
          return (
            '<div class="step"><button data-a="' +
            a +
            'd" data-id="' +
            id +
            '" aria-label="Diminuir">' +
            ic('minus', 18) +
            '</button><output id="o-' +
            id +
            '">' +
            qtd +
            '</output><button data-a="' +
            a +
            'i" data-id="' +
            id +
            '" aria-label="Aumentar">' +
            ic('plus', 18) +
            '</button></div>'
          );
        }

        function vCart() {
          if (!S.cart.length)
            return (
              '<div class="in"><div class="stack"><h2 class="sec">Carrinho</h2><div class="empty">' +
              ic('cart', 40) +
              '<h2>Seu carrinho está vazio</h2><p>Escolha um kit pronto ou monte o seu.</p><a class="btn1" style="max-width:260px" href="#">Ver produtos</a><a class="btn2" style="max-width:260px" href="#montar">Montar meu kit</a></div></div></div>'
            );
          var rows = S.cart
            .map(function (i) {
              var p = i.pid && byId[i.pid];
              return (
                '<div class="line"><div class="tile">' +
                (p ? pic(p) : art('kit', '#e08a2e')) +
                '</div><div class="info"><div class="name">' +
                i.nome +
                '</div>' +
                (i.det
                  ? '<div class="det">' + i.det.join(' · ') + '</div>'
                  : '') +
                '<div class="pr">' +
                fmt(i.preco * i.qtd) +
                '</div></div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">' +
                stepper(i.key, i.qtd, 'c') +
                '<button class="link" style="font-size:13px" data-a="rm" data-id="' +
                i.key +
                '">Remover</button></div></div>'
              );
            })
            .join('');
          return (
            '<div class="in"><div class="stack"><h2 class="sec">Carrinho</h2><div class="panel">' +
            rows +
            '</div>' +
            '<div class="panel"><label for="cidade2" style="font-weight:700">Cidade da entrega</label><select class="sel" id="cidade2"><option' +
            (S.cidade === 'Jundiaí' ? ' selected' : '') +
            '>Jundiaí</option><option' +
            (S.cidade === 'Várzea Paulista' ? ' selected' : '') +
            '>Várzea Paulista</option></select>' +
            (S.cupom
              ? '<div class="sum"><div><span>Cupom ' +
                h(S.cupom) +
                '</span><span><button class="link" data-a="rm-cupom">remover</button></span></div></div>'
              : '<div style="display:flex;gap:8px;margin:10px 0 4px"><input id="cupomInput" style="flex:1;padding:10px;border:1px solid var(--line);border-radius:10px;text-transform:uppercase" placeholder="Cupom de desconto" autocomplete="off"><button class="btn2" data-a="apply-cupom">Aplicar</button></div><p style="margin:0 0 8px"><a href="/cupons">Ver cupons</a></p>') +
            '<div class="sum"><div><span>Produtos</span><span id="s-sub">' +
            fmt(sub()) +
            '</span></div>' +
            (descontoCupom()
              ? '<div><span>Desconto do cupom</span><span id="s-desc">-' +
                fmt(descontoCupom()) +
                '</span></div>'
              : '') +
            '<div><span>Entrega</span><span id="s-fr">' +
            fmt(frete()) +
            '</span></div><div class="tot"><span>Total</span><span id="s-tot">' +
            fmt(sub() - descontoCupom() + frete()) +
            '</span></div></div>' +
            (S.user
              ? ''
              : '<a class="btn2" href="#conta" style="margin-bottom:8px">Entrar / criar conta</a>' +
                '<p style="margin:0 0 10px;color:var(--muted);font-size:13px">Entre na sua conta para acompanhar seus pedidos.</p>') +
            '<a class="btn1 wa" id="waCart" data-a="checkout" href="' +
            waCart() +
            '" target="_blank" rel="noopener">' +
            ic('chat', 20) +
            ' Finalizar pelo WhatsApp</a>' +
            '<p style="margin:0;color:var(--muted);font-size:13px">Seu pedido abre pronto no WhatsApp. Lá você confirma, paga por Pix e informa o endereço e os melhores horários de entrega. Personalização de itens tem valor adicional, combinado na conversa.</p></div></div></div>'
          );
        }

        function bTotal() {
          return BI.reduce(function (a, i) {
            return a + (S.bq[i.id] || 0) * i.preco;
          }, 0);
        }
        function bCount() {
          return BI.reduce(function (a, i) {
            return a + (S.bq[i.id] || 0);
          }, 0);
        }
        function vBuild() {
          var items = BI.filter(function (i) {
            return i.seg === 'b' || i.seg === S.seg;
          });
          return (
            '<div class="in"><div class="stack"><h2 class="sec">Monte seu kit</h2>' +
            '<div class="chips" role="group" aria-label="Nível de ensino"><button class="chip" data-a="seg" data-v="f" aria-pressed="' +
            (S.seg === 'f') +
            '">Ensino Fundamental</button><button class="chip" data-a="seg" data-v="m" aria-pressed="' +
            (S.seg === 'm') +
            '">Ensino Médio</button></div>' +
            '<div class="panel">' +
            items
              .map(function (i) {
                return (
                  '<div class="line"><div class="info"><div class="name">' +
                  i.nome +
                  '</div><div class="pr">' +
                  fmt(i.preco) +
                  '</div></div>' +
                  stepper(i.id, S.bq[i.id] || 0, 'b') +
                  '</div>'
                );
              })
              .join('') +
            '</div>' +
            '<div class="stickybar"><div class="tt"><small id="b-n">' +
            bCount() +
            ' itens</small><b id="b-t">' +
            fmt(bTotal()) +
            '</b></div><button class="btn1" data-a="badd">Adicionar ao carrinho</button></div>' +
            '<p class="note" style="padding-top:4px">Já deixamos uma sugestão de itens marcada. Ajuste do seu jeito.</p></div></div>'
          );
        }

        function vMore() {
          return (
            '<div class="in"><div class="stack"><h2 class="sec">Entrega e contato</h2>' +
            '<div class="panel"><ul class="facts">' +
            '<li>' +
            ic('truck', 22) +
            '<span><b>Entrega em até 3 dias úteis</b> depois do pagamento. Avisamos o prazo no WhatsApp e anotamos o melhor horário para você.</span></li>' +
            '<li>' +
            ic('pin', 22) +
            '<span>Entregamos em <b>Jundiaí</b> (a partir de ' +
            fmt(10) +
            ') e <b>Várzea Paulista</b> (a partir de ' +
            fmt(15) +
            ').</span></li>' +
            '<li>' +
            ic('check', 22) +
            '<span>O pagamento é feito pelo WhatsApp, com Pix. Nada é cobrado no site.</span></li></ul></div>' +
            '<div class="panel"><div style="font-weight:700">Minha conta</div>' +
            (S.user
              ? '<div class="accountbox-more"><div class="avatar">' +
                (S.user.foto
                  ? '<img src="' +
                    h(S.user.foto) +
                    '" alt="' +
                    h(S.user.nome) +
                    '">'
                  : h((S.user.nome || '?').charAt(0).toUpperCase())) +
                '</div><div><div style="font-weight:700">' +
                h(S.user.nome) +
                '</div><div style="color:var(--muted);font-size:13px">' +
                h(S.user.email) +
                '</div>' +
                (S.user.telefone
                  ? '<div style="color:var(--muted);font-size:13px">' +
                    h(fmtPhone(S.user.telefone)) +
                    '</div>'
                  : '') +
                '</div></div>'
              : '<p style="margin:6px 0 12px;color:var(--muted);font-size:14px">Crie sua conta para acompanhar seus pedidos.</p>') +
            '<a class="btn2" href="#conta">' +
            (S.user ? 'Gerenciar minha conta' : 'Entrar ou criar conta') +
            '</a></div>' +
            '<div class="panel"><div style="font-weight:700">WhatsApp da Voto</div><div class="copyrow"><span id="wanum">' +
            WA_TXT +
            '</span><button data-a="copy">Copiar</button></div>' +
            '<a class="btn1 wa" href="https://wa.me/' +
            WA +
            '" target="_blank" rel="noopener">' +
            ic('chat', 20) +
            ' Chamar no WhatsApp</a></div></div></div>'
          );
        }

        // SOBRE A LOJA
        function vAbout() {
          return (
            '<div class="in"><div class="stack"><h2 class="sec">Sobre a Voto</h2>' +
            '<div class="panel">' +
            '<p class="aboutlead">A VOTO é uma loja de variedades que reúne tudo o que você precisa em um só lugar. Trabalhamos com produtos de papelaria, materiais escolares, itens para casa, eletrônicos, mochilas e muito mais.</p>' +
            '<p class="abouttext">Nosso objetivo é proporcionar uma experiência de compra simples, rápida e acessível, sempre priorizando qualidade, praticidade e satisfação.</p>' +
            '</div>' +
            '<div class="panel">' +
            '<div class="abouttitle">O que você encontra aqui?</div>' +
            '<ul class="facts">' +
            '<li>' +
            ic('grid', 22) +
            '<span><b>Variedade de produtos:</b> papelaria, eletrônicos, produtos para casa, mochilas e diversas outras categorias.</span></li>' +
            '<li>' +
            ic('build', 22) +
            '<span><b>Kits escolares personalizados:</b> escolha entre nossos kits prontos ou monte seu próprio kit de materiais escolares de maneira rápida, fácil e prática.</span></li>' +
            '<li>' +
            ic('truck', 22) +
            '<span><b>Entrega expressa:</b> compras realizadas até as 16h contam com entrega no mesmo dia, nas regiões atendidas.</span></li>' +
            '<li>' +
            ic('check', 22) +
            '<span><b>Qualidade e confiança:</b> selecionamos nossos produtos pensando na melhor experiência para nossos clientes.</span></li>' +
            '</ul>' +
            '</div>' +
            '<div class="panel">' +
            '<div class="abouttitle">Atendimento inteligente, 24 horas por dia!</div>' +
            '<p class="abouttext">Na VOTO, você não precisa esperar pelo horário comercial para ser atendido.</p>' +
            '<p class="abouttext">Contamos com a <b>Luna</b>, nossa inteligência artificial, preparada para atender nossos clientes 24 horas por dia, todos os dias da semana.</p>' +
            '<p class="abouttext">Ela está sempre disponível para esclarecer dúvidas, auxiliar nas compras e acompanhar nossos clientes.</p>' +
            '<p class="abouttext">E tem mais: quando surge uma dúvida que a Luna ainda não consegue responder, ela solicita automaticamente nosso suporte humano, recebe a orientação necessária e retorna ao cliente. Assim, nossa inteligência artificial também aprende e evolui constantemente para oferecer um atendimento cada vez melhor.</p>' +
            '<a class="btn1 wa" href="https://wa.me/' +
            WA +
            '" target="_blank" rel="noopener">' +
            ic('chat', 20) +
            ' Falar com a Luna no WhatsApp</a>' +
            '</div>' +
            '<div class="panel">' +
            '<div class="abouttitle">Muito mais que uma loja</div>' +
            '<div class="aboutvalues">' +
            '<div class="valcard"><b>V</b><span>Valorização</span></div>' +
            '<div class="valcard"><b>O</b><span>Oportunidade</span></div>' +
            '<div class="valcard"><b>T</b><span>Transformação</span></div>' +
            '<div class="valcard"><b>O</b><span>Objetivo</span></div>' +
            '</div>' +
            '<p class="abouttext">Esses são os princípios que representam nossa marca e orientam cada decisão que tomamos.</p>' +
            '<p class="abouttext">Não queremos apenas vender produtos. Queremos transformar a maneira como as pessoas compram, oferecendo variedade, qualidade, agilidade e uma experiência que faça a diferença.</p>' +
            '<div class="aboutslogan">VOTO. Tudo o que você precisa, em um só lugar.</div>' +
            '<a class="btn2" href="#">Voltar ao início</a>' +
            '</div>' +
            '</div></div>'
          );
        }

        function footHTML() {
          return (
            '<div class="in footin">' +
            '<div class="footcol brand"><b>Voto</b><p>Loja de variedades com tudo o que você precisa em um só lugar. Atendimento 24h e entrega expressa.</p>' +
            '<a class="btn2" href="https://wa.me/' +
            WA +
            '" target="_blank" rel="noopener">' +
            ic('chat', 18) +
            ' Falar com a Luna</a></div>' +
            '<div class="footcol"><b>Ajuda</b>' +
            '<a href="#sobre">Sobre a Voto</a>' +
            '<a href="#mais">Entrega e contato</a>' +
            '<a href="#montar">Montar meu kit</a>' +
            '<a href="#carrinho">Meu carrinho</a>' +
            '<a href="#conta">Minha conta</a>' +
            '<a href="/influenciador">Programa de influenciadores</a>' +
            '<a href="/cupons">Cupons</a></div>' +
            '<div class="footcol"><b>Atendimento</b>' +
            '<a href="https://wa.me/' +
            WA +
            '" target="_blank" rel="noopener">' +
            WA_TXT +
            '</a>' +
            '<span>Atendimento 24h com a Luna</span>' +
            '<span>Entrega expressa nas regiões atendidas</span></div>' +
            '</div>' +
            '<div class="footbar"><div class="in">© ' +
            new Date().getFullYear() +
            ' Voto · Todos os direitos reservados</div></div>'
          );
        }

        function orderPayload() {
          return {
            itens: S.cart.map(function (i) {
              return {
                key: i.key,
                pid: i.pid || null,
                nome: i.nome,
                preco: i.preco,
                qtd: i.qtd,
                det: i.det,
              };
            }),
            cidade: S.cidade,
            cupom: S.cupom || null,
            subtotal: sub(),
            frete: frete(),
            total: sub() - descontoCupom() + frete(),
          };
        }

        var OST = {
          novo: 'Novo',
          confirmado: 'Confirmado',
          enviado: 'Enviado',
          entregue: 'Entregue',
          cancelado: 'Cancelado',
        };

        function ordersHTML(list) {
          if (!list || !list.length)
            return '<p class="oempty">Você ainda não fez pedidos pelo site. Os pedidos finalizados pela sua conta aparecem aqui.</p>';
          return (
            '<div class="orderlist">' +
            list
              .map(function (o) {
                var itens = Array.isArray(o.itens) ? o.itens : [];
                var stClass = 'status-' + (o.status || 'novo');
                var waMsg =
                  'Olá! Gostaria de informações sobre meu Pedido #' +
                  o.id +
                  ' (' +
                  fmt(o.total) +
                  ').';
                return (
                  '<div class="orderitem">' +
                  '<div class="ohead">' +
                  '<span class="onum">Pedido #' +
                  o.id +
                  '</span>' +
                  '<span class="ostatus ' +
                  stClass +
                  '">' +
                  h(OST[o.status] || o.status) +
                  '</span>' +
                  '</div>' +
                  '<div class="ometa">' +
                  (o.criado_em ? fmtDate(o.criado_em) + ' · ' : '') +
                  h(o.cidade || '') +
                  '</div>' +
                  '<ul class="oitems">' +
                  itens
                    .map(function (i) {
                      var qtd = i.qtd || 1;
                      return (
                        '<li>' +
                        h(qtd + 'x ' + (i.nome || 'Item')) +
                        ' — <b>' +
                        fmt((i.preco || 0) * qtd) +
                        '</b></li>'
                      );
                    })
                    .join('') +
                  '</ul>' +
                  '<div class="ofoot">' +
                  '<div class="ototal"><small>Total</small><b>' +
                  fmt(o.total) +
                  '</b></div>' +
                  '<a class="obtn" href="https://wa.me/' +
                  WA +
                  '?text=' +
                  encodeURIComponent(waMsg) +
                  '" target="_blank" rel="noopener">' +
                  ic('chat', 15) +
                  ' Falar sobre este pedido</a>' +
                  '</div>' +
                  '</div>'
                );
              })
              .join('') +
            '</div>'
          );
        }

        function loadOrders() {
          if (!S.user) return;
          apiJSON('/api/auth/orders')
            .then(function (list) {
              S.orders = list;
              var app = document.getElementById('app');
              if (VIEW === 'conta' && app) {
                app.innerHTML = vAccount();
                return;
              }
              var box = document.getElementById('ordersBox');
              if (box) box.innerHTML = ordersHTML(list);
            })
            .catch(function () {
              var box = document.getElementById('ordersBox');
              if (box)
                box.innerHTML =
                  '<p class="oempty">Não foi possível carregar seus pedidos agora.</p>';
            });
        }

        function vAccount() {
          var head = '<div class="in"><div class="stack"><h2 class="sec">Minha conta</h2>';
          if (!S.user) {
            var reg = S.authTab === 'register';
            return (
              head +
              '<div class="panel"><div class="authswitch">' +
              '<button type="button" data-a="authtab" data-v="login" aria-pressed="' +
              (!reg) +
              '">Entrar</button>' +
              '<button type="button" data-a="authtab" data-v="register" aria-pressed="' +
              reg +
              '">Criar conta</button></div>' +
              '<form id="authForm" class="authform" novalidate>' +
              (reg
                ? '<label>Nome<input name="nome" autocomplete="name" required></label>'
                : '') +
              '<label>E-mail<input name="email" type="email" autocomplete="email" required></label>' +
              (reg
                ? '<label>Telefone / WhatsApp<input name="telefone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(11) 90000-0000"></label>'
                : '') +
              '<label>Senha<input name="senha" type="password" autocomplete="' +
              (reg ? 'new-password' : 'current-password') +
              '" minlength="6" required></label>' +
              '<p class="authmsg" id="authMsg" role="alert"></p>' +
              '<button class="btn1" type="submit">' +
              (reg ? 'Criar minha conta' : 'Entrar') +
              '</button></form>' +
              '<p class="note">Com sua conta você acompanha os pedidos e agiliza o atendimento. O pagamento continua pelo WhatsApp.</p>' +
              '</div></div></div>'
            );
          }
          var initial = (S.user.nome || '?').charAt(0).toUpperCase();
          var avatar = S.user.foto
            ? '<img src="' + h(S.user.foto) + '" alt="Foto de ' + h(S.user.nome) + '">'
            : h(initial);
          var formattedCPF = S.user.cpf ? fmtCPF(S.user.cpf) : '';
          var formattedPhone = S.user.telefone ? fmtPhone(S.user.telefone) : '';
          var memberSince = S.user.criado_em ? fmtDate(S.user.criado_em) : '';
          var orderCount = S.orders ? S.orders.length : 0;
          var favCount = S.favs ? S.favs.length : 0;

          var ordersList = S.orders || [];
          var stCounts = { novo: 0, confirmado: 0, enviado: 0, entregue: 0, cancelado: 0 };
          ordersList.forEach(function (o) {
            if (stCounts[o.status] !== undefined) stCounts[o.status]++;
          });

          return (
            head +
            // 1. Hero Card do Perfil (Estilo Shopee / Mercado Livre)
            '<div class="shopee-hero-card">' +
            '<div class="shopee-hero-avatar">' +
            avatar +
            '<label class="shopee-avatar-btn" title="Alterar foto" aria-label="Alterar foto de perfil">' +
            ic('pencil', 13) +
            '<input type="file" id="profFile" accept="image/*" aria-label="Alterar foto de perfil">' +
            '</label>' +
            '</div>' +
            '<div class="shopee-hero-info">' +
            '<div class="shopee-user-name">' +
            h(S.user.nome) +
            '</div>' +
            '<div class="shopee-user-badge">' +
            ic('star', 13) +
            '<span>Cliente VOTO · ' +
            h(memberSince || 'Conta ativa') +
            '</span></div>' +
            '<div class="shopee-user-contacts">' +
            '<span title="' +
            h(S.user.email) +
            '">' +
            ic('mail', 13) +
            ' ' +
            h(S.user.email) +
            '</span>' +
            (formattedPhone
              ? '<a href="https://wa.me/' +
                waNumber(S.user.telefone) +
                '" target="_blank" rel="noopener" title="Falar no WhatsApp">' +
                ic('phone', 13) +
                ' ' +
                h(formattedPhone) +
                '</a>'
              : '') +
            '</div>' +
            '</div>' +
            '<button type="button" class="shopee-edit-btn" data-a="toggle-edit" title="Editar dados cadastrais" aria-label="Editar dados cadastrais" aria-expanded="' +
            (S.editOpen ? 'true' : 'false') +
            '">' +
            ic('pencil', 16) +
            '</button>' +
            '</div>' +

            // 2. Barra de Rastreamento de Pedidos (Estilo Shopee "Minhas Compras")
            '<div class="panel shopee-tracker-card">' +
            '<div class="shopee-tracker-head">' +
            '<div><b>Minhas Compras</b><span>Acompanhe seus pedidos em tempo real</span></div>' +
            '<a href="#ordersBox" data-a="scroll-orders" class="shopee-tracker-link">Ver histórico ' +
            ic('chevron', 14) +
            '</a>' +
            '</div>' +
            '<div class="shopee-tracker-grid">' +
            '<a class="tracker-step" href="#ordersBox" data-a="scroll-orders">' +
            '<div class="tracker-icon">' +
            ic('clock', 22) +
            (stCounts.novo
              ? '<span class="tbadge">' + stCounts.novo + '</span>'
              : '') +
            '</div>' +
            '<span>Pendente</span>' +
            '</a>' +
            '<a class="tracker-step" href="#ordersBox" data-a="scroll-orders">' +
            '<div class="tracker-icon">' +
            ic('box', 22) +
            (stCounts.confirmado
              ? '<span class="tbadge">' + stCounts.confirmado + '</span>'
              : '') +
            '</div>' +
            '<span>Preparando</span>' +
            '</a>' +
            '<a class="tracker-step" href="#ordersBox" data-a="scroll-orders">' +
            '<div class="tracker-icon">' +
            ic('truck', 22) +
            (stCounts.enviado
              ? '<span class="tbadge">' + stCounts.enviado + '</span>'
              : '') +
            '</div>' +
            '<span>A Caminho</span>' +
            '</a>' +
            '<a class="tracker-step" href="#ordersBox" data-a="scroll-orders">' +
            '<div class="tracker-icon">' +
            ic('check', 22) +
            (stCounts.entregue
              ? '<span class="tbadge">' + stCounts.entregue + '</span>'
              : '') +
            '</div>' +
            '<span>Entregues</span>' +
            '</a>' +
            '</div>' +
            '</div>' +

            // 3. Hub de Atalhos Rápidos (Shopee / Amazon style)
            '<div class="shopee-hub-grid">' +
            '<a class="hub-card" href="#favBox" data-a="scroll-favs">' +
            '<div class="hub-icon heart">' +
            ic('heart', 20) +
            '</div>' +
            '<b>Favoritos</b><small>' +
            favCount +
            ' salvos</small>' +
            '</a>' +
            '<a class="hub-card" href="#ordersBox" data-a="scroll-orders">' +
            '<div class="hub-icon bag">' +
            ic('bag', 20) +
            '</div>' +
            '<b>Pedidos</b><small>' +
            orderCount +
            ' feitos</small>' +
            '</a>' +
            '<a class="hub-card" href="https://wa.me/' +
            WA +
            '" target="_blank" rel="noopener">' +
            '<div class="hub-icon chat">' +
            ic('chat', 20) +
            '</div>' +
            '<b>Luna 24h</b><small>WhatsApp</small>' +
            '</a>' +
            '<a class="hub-card" href="#" data-a="cat" data-v="top">' +
            '<div class="hub-icon star">' +
            ic('star', 20) +
            '</div>' +
            '<b>Destaques</b><small>Ofertas</small>' +
            '</a>' +
            '</div>' +

            // 4. Central de Serviços & Configurações da Conta (Estilo Amazon "Sua Conta")
            '<div class="panel amazon-menu-card">' +
            '<button type="button" class="amazon-menu-item" data-a="toggle-edit" aria-expanded="' +
            (S.editOpen ? 'true' : 'false') +
            '">' +
            '<div class="amz-icon">' +
            ic('pencil', 18) +
            '</div>' +
            '<div class="amz-text"><b>Meus Dados Cadastrais</b><small id="editHint">' +
            (S.editOpen ? 'Ocultar formulário de dados' : 'Nome, CPF, Telefone e Foto de perfil') +
            '</small></div>' +
            '<div class="amz-arrow">' +
            ic('chevron', 16) +
            '</div>' +
            '</button>' +
            '<button type="button" class="amazon-menu-item" data-a="theme" aria-label="Alternar modo escuro e claro">' +
            '<div class="amz-icon">' +
            ic('moon', 18) +
            '</div>' +
            '<div class="amz-text"><b>Aparência do App</b><small>Alternar Modo Escuro / Claro</small></div>' +
            '<div class="amz-arrow">' +
            ic('chevron', 16) +
            '</div>' +
            '</button>' +
            '<a class="amazon-menu-item" href="#sobre">' +
            '<div class="amz-icon">' +
            ic('star', 18) +
            '</div>' +
            '<div class="amz-text"><b>Sobre a VOTO</b><small>Conheça nossa empresa e valores</small></div>' +
            '<div class="amz-arrow">' +
            ic('chevron', 16) +
            '</div>' +
            '</a>' +
            '<button type="button" class="amazon-menu-item logout" data-a="logout">' +
            '<div class="amz-icon">' +
            ic('logout', 18) +
            '</div>' +
            '<div class="amz-text"><b>Sair da Conta</b><small>Encerrar sessão com segurança</small></div>' +
            '<div class="amz-arrow">' +
            ic('chevron', 16) +
            '</div>' +
            '</button>' +
            '</div>' +

            // 5. Formulário "Meus dados" (Expansível)
            '<div class="panel edit-panel" id="editPanel" aria-hidden="' +
            (S.editOpen ? 'false' : 'true') +
            '" style="' +
            (S.editOpen ? '' : 'display:none') +
            '">' +
            '<div class="phead"><b>Meus dados cadastrais</b><span>Mantenha seu cadastro atualizado</span></div>' +
            '<form id="profileForm" class="authform" novalidate>' +
            '<div class="fotorow"><div class="avatar big" id="profPrev">' +
            avatar +
            '</div><div class="fotobuttons">' +
            '<label class="btn2 filebtn">' +
            ic('pencil', 16) +
            ' Trocar foto<input type="file" id="profFile2" accept="image/*"></label>' +
            (S.user.foto
              ? '<button type="button" class="btn2 delbtn" data-a="rmfoto">' +
                ic('trash', 16) +
                ' Remover foto</button>'
              : '') +
            '</div></div>' +
            '<label>Nome completo<input name="nome" value="' +
            h(S.user.nome) +
            '" autocomplete="name" required></label>' +
            '<label>CPF<input name="cpf" inputmode="numeric" value="' +
            h(formattedCPF) +
            '" placeholder="000.000.000-00" maxlength="14"></label>' +
            '<label>Telefone / WhatsApp<input name="telefone" value="' +
            h(formattedPhone || S.user.telefone || '') +
            '" autocomplete="tel" inputmode="tel" maxlength="15" placeholder="(11) 90000-0000"></label>' +
            '<label>E-mail<input value="' +
            h(S.user.email) +
            '" disabled></label>' +
            '<p class="authmsg" id="profMsg" role="alert"></p>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<button class="btn1" type="submit" style="flex:1">Salvar dados</button>' +
            '<button type="button" class="btn2" data-a="toggle-edit" style="max-width:140px">Fechar</button>' +
            '</div></form></div>' +

            // 6. Minhas compras (Estilo Shopee/Amazon)
            '<div class="panel"><div class="phead"><b>Minhas compras</b><span>' +
            (S.orders
              ? S.orders.length +
                (S.orders.length === 1 ? ' pedido' : ' pedidos')
              : 'Carregando...') +
            '</span></div><div id="ordersBox">' +
            (S.orders
              ? ordersHTML(S.orders)
              : '<p class="oempty">Carregando pedidos...</p>') +
            '</div></div>' +

            // 7. Meus favoritos
            '<div class="panel"><div class="phead"><b>Meus favoritos</b><span id="favCount">' +
            S.favs.length +
            '</span></div><div id="favBox">' +
            favoritesHTML() +
            '</div></div></div></div>'
          );
        }

        function favoritesHTML() {
          if (!S.favProducts.length)
            return '<p class="oempty">Você ainda não tem favoritos. Toque no coração dos produtos para salvar.</p>';
          return (
            '<div class="grid favgrid">' +
            S.favProducts
              .map(function (p) {
                return card(p);
              })
              .join('') +
            '</div>'
          );
        }

        /* menu inferior */
        function navHTML() {
          var it = [
            ['', 'home', 'Início'],
            ['categorias', 'grid', 'Categorias'],
            ['carrinho', 'cart', 'Carrinho'],
            ['montar', 'build', 'Montar kit'],
            ['mais', 'menu', 'Mais'],
          ];
          return it
            .map(function (x) {
              var on = (x[0] === '' && VIEW === 'home') || x[0] === VIEW;
              return (
                '<a href="#' +
                x[0] +
                '"' +
                (on ? ' aria-current="page"' : '') +
                '>' +
                ic(x[1], 26) +
                '<span>' +
                x[2] +
                '</span>' +
                (x[0] === 'carrinho'
                  ? '<b class="badge navbadge">' + (count() || '') + '</b>'
                  : '') +
                '</a>'
              );
            })
            .join('');
        }
