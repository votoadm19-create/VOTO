'use strict';

        /* roteador */
        function route() {
          var h = decodeURIComponent(location.hash.slice(1)),
            v = 'home',
            arg = '';
          if (h.indexOf('produto-') === 0) {
            arg = h.slice(8);
            if (byId[arg]) v = 'produto';
          } else if (
            ['categorias', 'carrinho', 'montar', 'mais', 'conta', 'sobre', 'termos', 'privacidade'].indexOf(
              h
            ) > -1
          )
            v = h;
          VIEW = v;
          $('#app').dataset.view = v;
          var prod = v === 'produto';
          $('#top').hidden = prod;
          $('#nav').hidden = prod;
          $('#tabs').hidden = v !== 'home';
          var html =
            v === 'produto'
              ? vProduct(byId[arg])
              : v === 'categorias'
                ? vCats()
                : v === 'carrinho'
                  ? vCart()
                  : v === 'montar'
                    ? vBuild()
                    : v === 'mais'
                      ? vMore()
                      : v === 'conta'
                        ? vAccount()
                        : v === 'sobre'
                          ? vAbout()
                          : v === 'termos'
                            ? vTermos()
                            : v === 'privacidade'
                              ? vPrivacidade()
                              : vHome();
          $('#app').innerHTML = html;
          $('#foot').innerHTML = footHTML();
          if (v === 'conta' && S.user) loadOrders();
          if (v === 'produto') loadReviews(arg);
          $('#tabs').innerHTML = tabsHTML();
          $('#navin').innerHTML = navHTML();
          $('#navtop').innerHTML = navHTML();
          $('#cidade').value = S.cidade;
          updateBadge();
          updateAccountBtn();
          window.scrollTo(0, 0);
        }
        function go(h) {
          if (location.hash.slice(1) === h) route();
          else location.hash = h;
        }
        function refreshCart() {
          var a = $('#s-sub');
          if (!a) return;
          a.textContent = fmt(sub());
          $('#s-fr').textContent = fmt(frete());
          $('#s-tot').textContent = fmt(sub() - descontoCupom() + frete());
          $('#waCart').href = waCart();
        }

        document.addEventListener('click', function (e) {
          var t = e.target.closest('[data-a]');
          if (!t) return;
          var a = t.dataset.a,
            id = t.dataset.id,
            v = t.dataset.v;
          if (a === 'tab') {
            S.cat = v;
            S.q = '';
            $('#q').value = '';
            $('#app').innerHTML = vHome();
            $('#tabs').innerHTML = tabsHTML();
            window.scrollTo(0, 0);
          } else if (a === 'cat') {
            e.preventDefault();
            S.cat = v;
            S.q = '';
            $('#q').value = '';
            go('');
          } else if (a === 'back') {
            e.preventDefault();
            if (history.length > 1) history.back();
            else go('');
          } else if (a === 'add') {
            var p = byId[id];
            cartAdd(p.id, p.nome, p.preco, 1, null, p.id);
            toast('Adicionado ao carrinho');
          } else if (a === 'addq') {
            var p2 = byId[id],
              q = parseInt($('#qtySel').value, 10) || 1;
            cartAdd(p2.id, p2.nome, p2.preco, q, null, p2.id);
            toast('Adicionado ao carrinho');
          } else if (a === 'buy') {
            var p3 = byId[id],
              q3 = parseInt($('#qtySel').value, 10) || 1;
            cartAdd(p3.id, p3.nome, p3.preco, q3, null, p3.id);
            go('carrinho');
          } else if (a === 'ci' || a === 'cd') {
            var it = S.cart.find(function (i) {
              return i.key === id;
            });
            if (!it) return;
            it.qtd += a === 'ci' ? 1 : -1;
            if (it.qtd < 1) {
              S.cart = S.cart.filter(function (i) {
                return i !== it;
              });
              save();
              route();
              return;
            }
            save();
            var o = document.getElementById('o-' + id);
            if (o) o.textContent = it.qtd;
            updateBadge();
            refreshCart();
            var pr = o && o.closest('.line').querySelector('.pr');
            if (pr) pr.textContent = fmt(it.preco * it.qtd);
          } else if (a === 'rm') {
            S.cart = S.cart.filter(function (i) {
              return i.key !== id;
            });
            save();
            route();
          } else if (a === 'seg') {
            S.seg = v;
            S.bq = Object.assign({}, PRESET[v]);
            $('#app').innerHTML = vBuild();
            window.scrollTo(0, 0);
          } else if (a === 'bi' || a === 'bd') {
            var n = (S.bq[id] || 0) + (a === 'bi' ? 1 : -1);
            if (n < 0) n = 0;
            S.bq[id] = n;
            var o2 = document.getElementById('o-' + id);
            if (o2) o2.textContent = n;
            $('#b-n').textContent =
              bCount() + (bCount() === 1 ? ' item' : ' itens');
            $('#b-t').textContent = fmt(bTotal());
          } else if (a === 'badd') {
            if (!bCount()) {
              toast('Escolha ao menos um item');
              return;
            }
            var det = BI.filter(function (i) {
              return (
                (S.bq[i.id] || 0) > 0 && (i.seg === 'b' || i.seg === S.seg)
              );
            }).map(function (i) {
              return S.bq[i.id] + 'x ' + i.nome;
            });
            var tot = BI.filter(function (i) {
              return i.seg === 'b' || i.seg === S.seg;
            }).reduce(function (s, i) {
              return s + (S.bq[i.id] || 0) * i.preco;
            }, 0);
            cartAdd(
              'kit-' + Date.now(),
              'Meu kit (' + SEGLBL[S.seg] + ')',
              tot,
              1,
              det,
              null
            );
            go('carrinho');
          } else if (a === 'copy') {
            var done = function () {
              toast('Número copiado');
            };
            var fb = function () {
              var r = document.createRange();
              r.selectNodeContents($('#wanum'));
              var s = window.getSelection();
              s.removeAllRanges();
              s.addRange(r);
              toast('Toque em copiar no menu');
            };
            try {
              navigator.clipboard.writeText(WA_TXT).then(done, fb);
            } catch (err) {
              fb();
            }
          } else if (a === 'fav') {
            e.preventDefault();
            if (!S.user) {
              toast('Entre na sua conta para favoritar');
              go('conta');
              return;
            }
            apiJSON('/api/auth/favorites/' + encodeURIComponent(id), {
              method: 'POST',
            })
              .then(function (data) {
                var on = !!data.favorito;
                if (on) {
                  if (S.favs.indexOf(id) < 0) S.favs.push(id);
                  if (
                    byId[id] &&
                    !S.favProducts.some(function (p) {
                      return p.id === id;
                    })
                  )
                    S.favProducts.push(byId[id]);
                } else {
                  S.favs = S.favs.filter(function (x) {
                    return x !== id;
                  });
                  S.favProducts = S.favProducts.filter(function (p) {
                    return p.id !== id;
                  });
                }
                var sel = '[data-a="fav"][data-id="' + id + '"]';
                document.querySelectorAll(sel).forEach(function (b) {
                  b.classList.toggle('on', on);
                  var s = b.querySelector('span');
                  if (s)
                    s.textContent = on ? 'Favoritado' : 'Favoritar';
                  b.setAttribute(
                    'aria-label',
                    (on ? 'Remover dos favoritos: ' : 'Favoritar: ') +
                      (byId[id] ? byId[id].nome : 'produto')
                  );
                });
                if (VIEW === 'conta') {
                  var fb = document.getElementById('favBox');
                  if (fb) fb.innerHTML = favoritesHTML();
                  var fc = document.getElementById('favCount');
                  if (fc) fc.textContent = S.favs.length;
                }
                toast(
                  on
                    ? 'Adicionado aos favoritos'
                    : 'Removido dos favoritos'
                );
              })
              .catch(function (err) {
                toast(err.message);
              });
          } else if (a === 'authtab') {
            S.authTab = v;
            route();
          } else if (a === 'toggle-edit') {
            e.preventDefault();
            S.editOpen = !S.editOpen;
            var editPanel = document.getElementById('editPanel');
            if (editPanel) {
              editPanel.style.display = S.editOpen ? '' : 'none';
              editPanel.setAttribute(
                'aria-hidden',
                S.editOpen ? 'false' : 'true'
              );
              if (S.editOpen)
                editPanel.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
            }
            var editHint = document.getElementById('editHint');
            if (editHint)
              editHint.textContent = S.editOpen
                ? 'Ocultar formulário de dados'
                : 'Nome, CPF, Telefone e Foto de perfil';
            document
              .querySelectorAll('[data-a="toggle-edit"]')
              .forEach(function (btn) {
                btn.setAttribute(
                  'aria-expanded',
                  S.editOpen ? 'true' : 'false'
                );
              });
          } else if (a === 'logout') {
            apiJSON('/api/auth/logout', { method: 'POST' })
              .catch(function () {})
              .then(function () {
                S.user = null;
                S.orders = null;
                S.favs = [];
                S.favProducts = [];
                S.authTab = 'login';
                S.editOpen = false;
                toast('Você saiu da conta');
                route();
              });
          } else if (a === 'apply-cupom') {
            var inp = document.getElementById('cupomInput');
            return aplicarCupom(inp ? inp.value : '');
          } else if (a === 'rm-cupom') {
            removerCupom();
          } else if (a === 'checkout') {
            if (S.user)
              apiJSON('/api/orders', {
                method: 'POST',
                body: orderPayload(),
              }).catch(function () {});
          } else if (a === 'rmfoto') {
            if (!S.user || !S.user.foto) return;
            apiJSON('/api/auth/profile', {
              method: 'PUT',
              body: {
                nome: S.user.nome,
                cpf: S.user.cpf ? String(S.user.cpf).replace(/\D/g, '') : '',
                telefone: S.user.telefone || '',
                foto: '',
              },
            })
              .then(function (res) {
                S.user = res.cliente;
                toast('Foto de perfil removida');
                route();
              })
              .catch(function (err) {
                toast(err.message || 'Erro ao remover foto');
              });
          } else if (a === 'scroll-orders') {
            e.preventDefault();
            var el = document.getElementById('ordersBox');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          } else if (a === 'scroll-favs') {
            e.preventDefault();
            var el = document.getElementById('favBox');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          } else if (a === 'scroll-edit') {
            e.preventDefault();
            var el = document.getElementById('editPanel');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          } else if (a === 'theme') {
            applyTheme(
              document.documentElement.dataset.theme === 'dark'
                ? 'light'
                : 'dark',
              true
            );
          }
        });
        document.addEventListener('submit', function (e) {
          var form = e.target;
          if (
            form.id !== 'authForm' &&
            form.id !== 'profileForm' &&
            form.id !== 'reviewForm'
          )
            return;
          e.preventDefault();
          var btn = form.querySelector('button[type="submit"]');
          var label = btn.textContent;

          if (form.id === 'reviewForm') {
            var revMsg = document.getElementById('revMsg');
            var nota = parseInt(form.querySelector('[name="nota"]').value, 10);
            var comentario = form
              .querySelector('[name="comentario"]')
              .value.trim();
            revMsg.textContent = '';
            if (!nota) {
              revMsg.textContent = 'Escolha uma nota.';
              return;
            }
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            apiJSON(
              '/api/products/' +
                encodeURIComponent(form.dataset.pid) +
                '/reviews',
              {
                method: 'POST',
                body: { nota: nota, comentario: comentario },
              }
            )
              .then(function () {
                toast('Avaliação publicada. Obrigado!');
                loadReviews(form.dataset.pid);
              })
              .catch(function (err) {
                revMsg.textContent = err.message;
                btn.disabled = false;
                btn.textContent = label;
              });
            return;
          }

          if (form.id === 'profileForm') {
            var profMsg = document.getElementById('profMsg');
            var nome = form.querySelector('[name="nome"]').value.trim();
            var cpf = form
              .querySelector('[name="cpf"]')
              .value.replace(/\D/g, '');
            var tel = form.querySelector('[name="telefone"]').value.trim();
            profMsg.textContent = '';
            if (!nome) {
              profMsg.textContent = 'Informe seu nome.';
              return;
            }
            btn.disabled = true;
            btn.textContent = 'Salvando...';
            apiJSON('/api/auth/profile', {
              method: 'PUT',
              body: {
                nome: nome,
                cpf: cpf,
                telefone: tel,
                foto: S.user.foto || '',
              },
            })
              .then(function (data) {
                S.user = data.cliente;
                toast('Dados atualizados');
                route();
              })
              .catch(function (err) {
                profMsg.textContent = err.message;
                btn.disabled = false;
                btn.textContent = label;
              });
            return;
          }

          var msg = document.getElementById('authMsg');
          var reg = S.authTab === 'register';
          var emailEl = form.querySelector('[name="email"]');
          var senhaEl = form.querySelector('[name="senha"]');
          var nomeEl = form.querySelector('[name="nome"]');
          var telEl = form.querySelector('[name="telefone"]');
          var email = emailEl ? emailEl.value.trim() : '';
          var senha = senhaEl ? senhaEl.value : '';
          if (msg) msg.textContent = '';
          if (reg && (!nomeEl || !telEl)) {
            if (msg)
              msg.textContent = 'Recarregue a página e tente novamente.';
            return;
          }
          var nome = nomeEl ? nomeEl.value.trim() : '';
          if (!email || !senha || (reg && !nome)) {
            if (msg) msg.textContent = 'Preencha os campos obrigatórios.';
            return;
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (msg) msg.textContent = 'Informe um e-mail válido.';
            return;
          }
          if (reg && String(senha).length < 6) {
            if (msg)
              msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
            return;
          }
          btn.disabled = true;
          btn.textContent = 'Aguarde...';
          var body = { email: email, senha: senha };
          if (reg) {
            body.nome = nome;
            body.telefone = telEl.value.trim();
          }
          apiJSON(reg ? '/api/auth/register' : '/api/auth/login', {
            method: 'POST',
            body: body,
          })
            .then(function (data) {
              if (!data || !data.cliente)
                throw new Error(
                  'Resposta inesperada do servidor. Tente novamente.'
                );
              S.user = data.cliente;
              S.orders = null;
              toast('Bem-vindo(a), ' + data.cliente.nome.split(' ')[0] + '!');
              route();
              refreshFavs().then(function () {
                if (VIEW !== 'conta') return;
                var favBox = document.getElementById('favBox');
                if (favBox) favBox.innerHTML = favoritesHTML();
                var favCountEl = document.getElementById('favCount');
                if (favCountEl) favCountEl.textContent = S.favs.length;
              });
            })
            .catch(function (err) {
              if (msg) msg.textContent = err.message;
            })
            .then(function () {
              btn.disabled = false;
              btn.textContent = label;
            });
        });
        function showUnexpectedError(ev) {
          var detail =
            (ev && ev.message) ||
            (ev && ev.reason && (ev.reason.message || ev.reason)) ||
            '';
          try {
            console.error('[VOTO] erro inesperado:', detail || ev);
          } catch (e) {}
          var el =
            document.getElementById('authMsg') ||
            document.getElementById('profMsg');
          if (el && !el.textContent)
            el.textContent =
              'Não foi possível concluir' +
              (detail ? ': ' + detail : '. Recarregue a página e tente novamente.');
        }
        window.addEventListener('error', showUnexpectedError);
        window.addEventListener('unhandledrejection', showUnexpectedError);
        document.addEventListener('change', function (e) {
          if (e.target.id === 'profFile') {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
              toast('Imagem muito grande (máximo 5MB)');
              e.target.value = '';
              return;
            }
            toast('Enviando foto...');
            var reader = new FileReader();
            reader.onload = function () {
              apiJSON('/api/auth/upload', {
                method: 'POST',
                body: { dataUrl: reader.result },
              })
                .then(function (data) {
                  return apiJSON('/api/auth/profile', {
                    method: 'PUT',
                    body: {
                      nome: S.user.nome,
                      cpf: S.user.cpf ? String(S.user.cpf).replace(/\D/g, '') : '',
                      telefone: S.user.telefone || '',
                      foto: data.url,
                    },
                  });
                })
                .then(function (res) {
                  S.user = res.cliente;
                  toast('Foto de perfil atualizada!');
                  route();
                })
                .catch(function (err) {
                  toast(err.message || 'Erro ao atualizar foto');
                });
            };
            reader.readAsDataURL(file);
            return;
          }
          if (e.target.id === 'cidade' || e.target.id === 'cidade2') {
            S.cidade = e.target.value;
            save();
            $('#cidade').value = S.cidade;
            var c2 = $('#cidade2');
            if (c2) c2.value = S.cidade;
            refreshCart();
            if (VIEW === 'produto') route();
          }
          if (e.target.id === 'qtySel') {
            var pid = location.hash.slice(9),
              p = byId[pid];
            if (p)
              $('#waProd').href = waProduct(
                p,
                parseInt(e.target.value, 10) || 1
              );
          }
        });
        document.addEventListener('input', function (e) {
          var el = e.target;
          if (!el || !el.form || el.form.id !== 'profileForm') return;
          if (el.name === 'cpf') el.value = maskCPF(el.value);
          else if (el.name === 'telefone') el.value = maskPhone(el.value);
        });
        $('#q').addEventListener('input', function (e) {
          S.q = e.target.value;
          if (VIEW !== 'home') {
            go('');
            return;
          }
          $('#app').innerHTML = vHome();
        });

          /* comportamento do slider do banner */
var heroPause = 0;
function heroIdx() {
  var t = document.getElementById('hero');
  return t && t.clientWidth ? Math.round(t.scrollLeft / t.clientWidth) : 0;
}
function heroGo(i, user) {
  var t = document.getElementById('hero');
  if (!t) return;
  var n = t.children.length,
    wrap = i < 0 || i >= n;
  i = (i + n) % n;
  t.scrollTo({ left: i * t.clientWidth, behavior: wrap ? 'auto' : 'smooth' });
  if (user) heroPause = Date.now() + 8000;
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-hero],[data-hi]');
  if (!b) return;
  if (b.hasAttribute('data-hi')) heroGo(+b.getAttribute('data-hi'), true);
  else heroGo(heroIdx() + +b.getAttribute('data-hero'), true);
});
document.addEventListener(
  'scroll',
  function (e) {
    if (!e.target || e.target.id !== 'hero') return;
    var i = heroIdx(),
      d = document.querySelectorAll('.hero-dots button');
    for (var k = 0; k < d.length; k++) d[k].classList.toggle('on', k === i);
  },
  true
);
document.addEventListener(
  'touchstart',
  function (e) {
    if (e.target.closest && e.target.closest('#hero')) heroPause = Date.now() + 8000;
  },
  { passive: true }
);
setInterval(function () {
  if (document.hidden || Date.now() < heroPause) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.hero-main:hover')) return;
  heroGo(heroIdx() + 1, false);
}, 4500);

        window.addEventListener('hashchange', route);
        apiJSON('/api/auth/me')
          .then(function (data) {
            S.user = data.cliente || null;
            return refreshFavs();
          })
          .catch(function () {})
          .then(route);
