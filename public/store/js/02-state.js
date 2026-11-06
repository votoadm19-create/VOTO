'use strict';

        /* estado */
        var S = {
          cart: [],
          cidade: 'Jundiaí',
          cat: 'tudo',
          q: '',
          seg: 'f',
          bq: Object.assign({}, PRESET.f),
          user: null,
          orders: null,
          authTab: 'login',
          favs: [],
          favProducts: [],
          editOpen: false,
          cupom: '',
          cupomInfo: null,
        };
        var VIEW = 'home';
        try {
          var c0 = JSON.parse(localStorage.getItem('voto-cart') || '[]');
          if (Array.isArray(c0))
            S.cart = c0.filter(function (i) {
              return i && typeof i.preco === 'number' && i.qtd > 0;
            });
          var ci = localStorage.getItem('voto-cidade');
          if (ci && FRETE[ci]) S.cidade = ci;
          S.cupom = localStorage.getItem('voto-cupom') || '';
        } catch (e) {}
        function save() {
          try {
            localStorage.setItem('voto-cart', JSON.stringify(S.cart));
            localStorage.setItem('voto-cidade', S.cidade);
            if (S.cupom) localStorage.setItem('voto-cupom', S.cupom);
            else localStorage.removeItem('voto-cupom');
          } catch (e) {}
        }
        function descontoCupom() {
          if (!S.cupomInfo) return 0;
          return Math.round(sub() * (S.cupomInfo.disc || 0) * 100) / 100;
        }
        function aplicarCupom(code) {
          code = String(code || '')
            .trim()
            .toUpperCase();
          if (!code) {
            toast('Digite um cupom');
            return Promise.resolve();
          }
          return apiJSON(
            '/api/coupons/preview?code=' +
              encodeURIComponent(code) +
              '&subtotal=' +
              sub()
          )
            .then(function (info) {
              S.cupom = info.code;
              S.cupomInfo = info;
              save();
              toast('Cupom ' + info.code + ' aplicado');
              route();
            })
            .catch(function (err) {
              toast(err.message || 'Cupom inválido');
            });
        }
        function removerCupom() {
          S.cupom = '';
          S.cupomInfo = null;
          save();
          route();
        }

        var THEME_KEY = 'voto-theme';
        function applyTheme(t, persist) {
          document.documentElement.dataset.theme = t;
          var b = $('#themebtn');
          if (b) {
            b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon', 22);
            b.setAttribute(
              'aria-label',
              t === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'
            );
            b.title = t === 'dark' ? 'Modo claro' : 'Modo escuro';
          }
          if (persist) {
            try {
              localStorage.setItem(THEME_KEY, t);
            } catch (e) {}
          }
        }
        function initTheme() {
          var saved = null;
          try {
            saved = localStorage.getItem(THEME_KEY);
          } catch (e) {}
          var t =
            saved === 'dark' || saved === 'light'
              ? saved
              : window.matchMedia &&
                  window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light';
          applyTheme(t, false);
        }
        initTheme();

        var toastT;
        function toast(m) {
          var t = $('#toast');
          t.textContent = m;
          t.classList.add('on');
          clearTimeout(toastT);
          toastT = setTimeout(function () {
            t.classList.remove('on');
          }, 1800);
        }

        function starsHTML(nota) {
          var n = Math.round(Number(nota) || 0),
            s = '';
          for (var i = 1; i <= 5; i++)
            s += '<span class="' + (i <= n ? 'on' : '') + '">★</span>';
          return '<span class="stars" aria-hidden="true">' + s + '</span>';
        }
        function isFav(id) {
          return S.favs.indexOf(id) > -1;
        }
        function favBtn(p) {
          return (
            '<button type="button" class="fav' +
            (isFav(p.id) ? ' on' : '') +
            '" data-a="fav" data-id="' +
            p.id +
            '" aria-label="Favoritar ' +
            p.nome +
            '">' +
            ic('heart', 20) +
            '</button>'
          );
        }
        function refreshFavs() {
          if (!S.user) {
            S.favs = [];
            S.favProducts = [];
            return Promise.resolve();
          }
          return apiJSON('/api/auth/favorites')
            .then(function (list) {
              S.favProducts = list;
              S.favs = list.map(function (p) {
                return p.id;
              });
            })
            .catch(function () {});
        }
        function fmtCPF(v) {
          var d = String(v || '').replace(/\D/g, '');
          if (d.length !== 11) return v || '';
          return (
            d.slice(0, 3) +
            '.' +
            d.slice(3, 6) +
            '.' +
            d.slice(6, 9) +
            '-' +
            d.slice(9)
          );
        }
        function fmtPhone(v) {
          var d = String(v || '').replace(/\D/g, '');
          if (d.length === 11) {
            return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
          }
          if (d.length === 10) {
            return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
          }
          return v || '';
        }
        function maskCPF(v) {
          var d = String(v || '').replace(/\D/g, '').slice(0, 11);
          return d
            .replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
            .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
        }
        function maskPhone(v) {
          var d = String(v || '').replace(/\D/g, '').slice(0, 11);
          if (d.length <= 2) return d;
          if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
          if (d.length <= 10)
            return (
              '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
            );
          return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        }
        function waNumber(v) {
          var d = String(v || '').replace(/\D/g, '');
          if (!d) return '';
          if (d.indexOf('55') === 0 && d.length > 11) return d;
          return '55' + d;
        }
        function fmtDate(iso) {
          if (!iso) return '';
          try {
            var dt = new Date(iso);
            if (isNaN(dt.getTime())) return '';
            var months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
            return months[dt.getMonth()] + ' de ' + dt.getFullYear();
          } catch (e) {
            return '';
          }
        }

        function cartAdd(key, nome, preco, qtd, det, pid) {
          var f = S.cart.find(function (i) {
            return i.key === key;
          });
          if (f) f.qtd += qtd;
          else
            S.cart.push({
              key: key,
              nome: nome,
              preco: preco,
              qtd: qtd,
              det: det || null,
              pid: pid || null,
            });
          save();
          updateBadge();
        }
        function count() {
          return S.cart.reduce(function (a, i) {
            return a + i.qtd;
          }, 0);
        }
        function sub() {
          return S.cart.reduce(function (a, i) {
            return a + i.preco * i.qtd;
          }, 0);
        }
        function frete() {
          return S.cart.length ? FRETE[S.cidade] : 0;
        }
        function updateBadge() {
          var n = count();
          $('#badge').textContent = n ? String(n) : '';
          var nbs = document.querySelectorAll('.navbadge');
          for (var i = 0; i < nbs.length; i++)
            nbs[i].textContent = n ? String(n) : '';
        }
        function updateAccountBtn() {
          var btn = document.getElementById('accountbtn');
          if (!btn) return;
          if (S.user) {
            var initial = (S.user.nome || '?').charAt(0).toUpperCase();
            if (S.user.foto) {
              btn.innerHTML =
                '<img class="nav-avatar" src="' +
                h(S.user.foto) +
                '" alt="' +
                h(S.user.nome) +
                '">';
            } else {
              btn.innerHTML =
                '<span class="nav-initial">' + h(initial) + '</span>';
            }
            btn.setAttribute('aria-label', 'Minha conta (' + S.user.nome + ')');
            btn.classList.add('logged');
          } else {
            btn.innerHTML =
              '<svg class="ic" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<circle cx="12" cy="8" r="3.6" />' +
              '<path d="M4.5 20a7.5 7.5 0 0115 0" />' +
              '</svg>';
            btn.setAttribute('aria-label', 'Minha conta');
            btn.classList.remove('logged');
          }
        }

        function customerLines() {
          var L = [];
          if (S.user) {
            L.push('Nome: ' + S.user.nome);
            if (S.user.cpf) L.push('CPF: ' + fmtCPF(S.user.cpf));
            if (S.user.email) L.push('E-mail: ' + S.user.email);
            if (S.user.telefone) L.push('WhatsApp: ' + fmtPhone(S.user.telefone));
            L.push('');
          }
          return L;
        }
        function waCart() {
          var L = ['Olá! Quero fazer um pedido na Voto:', ''].concat(
            customerLines()
          );
          S.cart.forEach(function (i) {
            L.push(
              '• ' +
                i.qtd +
                'x ' +
                i.nome +
                ' — ' +
                fmt(i.preco) +
                ' cada = ' +
                fmt(i.preco * i.qtd)
            );
            (i.det || []).forEach(function (d) {
              L.push('   - ' + d);
            });
          });
          L.push(
            '',
            'Subtotal: ' + fmt(sub())
          );
          if (S.cupom)
            L.push(
              'Cupom: ' +
                S.cupom +
                ' (-' +
                fmt(descontoCupom()) +
                ')'
            );
          L.push(
            'Entrega (' + S.cidade + '): ' + fmt(frete()),
            'Total: ' + fmt(sub() - descontoCupom() + frete()),
            '',
            'Pagamento: Pix',
            'Endereço de entrega: informo aqui no WhatsApp'
          );
          return (
            'https://wa.me/' + WA + '?text=' + encodeURIComponent(L.join('\n'))
          );
        }
        function waProduct(p, q) {
          var L = ['Olá! Quero pedir na Voto:', ''].concat(customerLines());
          L.push(
            'Produto: ' + p.nome,
            'Quantidade: ' + q,
            'Valor unitário: ' + fmt(p.preco),
            'Total dos produtos: ' + fmt(p.preco * q),
            '',
            'Cidade de entrega: ' + S.cidade,
            'Total com entrega: ' + fmt(p.preco * q + FRETE[S.cidade]),
            '',
            'Pagamento: Pix'
          );
          return (
            'https://wa.me/' + WA + '?text=' + encodeURIComponent(L.join('\n'))
          );
        }

        /* peças de tela */
        function card(p) {
          return (
            '<article class="card"><div class="imgw"><a class="tile" href="#produto-' +
            p.id +
            '" aria-label="' +
            p.nome +
            '">' +
            pic(p) +
            '</a>' +
            '<button class="add" data-a="add" data-id="' +
            p.id +
            '" aria-label="Adicionar ' +
            p.nome +
            ' ao carrinho">' +
            ic('cartplus', 20) +
            '</button>' +
            favBtn(p) +
            '</div>' +
            '<a class="cbody" href="#produto-' +
            p.id +
            '"><h3>' +
            p.nome +
            '</h3>' +
            (p.total_avaliacoes
              ? '<div class="rating">' +
                starsHTML(p.nota_media) +
                ' <b>' +
                p.nota_media +
                '</b> (' +
                p.total_avaliacoes +
                ')</div>'
              : '') +
            (p.de ? '<s>' + fmt(p.de) + '</s>' : '') +
            '<div class="price">' +
            priceHTML(p.preco) +
            (p.de ? '<em>' + off(p) + '% OFF</em>' : '') +
            '</div>' +
            '<div class="good">Entrega em até 3 dias úteis</div></a></article>'
          );
        }
        function filtered() {
          var l = P.slice(),
            q = S.q.trim().toLowerCase();
          if (q)
            return l.filter(function (p) {
              return (
                (p.nome +
                  ' ' +
                  (p.descricao || '') +
                  ' ' +
                  TABLBL[p.cat])
                  .toLowerCase()
                  .indexOf(q) > -1
              );
            });
          if (S.cat === 'top')
            return l
              .sort(function (a, b) {
                return b.v - a.v;
              })
              .slice(0, 8);
          if (S.cat === 'moda')
            return l.filter(function (p) {
              return p.cat === 'fem' || p.cat === 'masc';
            });
          if (S.cat !== 'tudo')
            return l.filter(function (p) {
              return p.cat === S.cat;
            });
          return l;
        }
        function tabsHTML() {
          return CATS.map(function (c) {
            return (
              '<button class="tab" role="tab" data-a="tab" data-v="' +
              c.id +
              '" aria-selected="' +
              (S.cat === c.id) +
              '">' +
              TABLBL[c.id] +
              '</button>'
            );
          }).join('');
        }
        function short(ic_, lbl, attrs) {
          return (
            '<a class="short" ' +
            attrs +
            '><i>' +
            ic(ic_, 28) +
            '</i><span>' +
            lbl +
            '</span></a>'
          );
        }
