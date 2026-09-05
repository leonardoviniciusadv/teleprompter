/* =====================================================================
   app.js — Shell do aplicativo: rotas, tela inicial, editor, configurações
   ===================================================================== */
(function (global) {
  'use strict';

  var routes = [];
  var appEl;

  /* ---------------- helpers de DOM ---------------- */
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (!attrs.hasOwnProperty(k)) continue;
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'dataset') { for (var d in v) e.dataset[d] = v[d]; }
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function toast(msg) {
    var t = h('div', { class: 'toast', text: msg });
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 250);
    }, 2200);
  }

  function confirmSheet(opts) {
    return new Promise(function (resolve) {
      var back = h('div', { class: 'sheet-back' });
      var sheet = h('div', { class: 'sheet' }, [
        h('div', { class: 'sheet-title', text: opts.title || 'Confirmar' }),
        opts.message ? h('div', { class: 'sheet-msg', text: opts.message }) : null,
        h('button', {
          class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
          onclick: function () { done(true); }, text: opts.ok || 'Confirmar'
        }),
        h('button', { class: 'btn btn-ghost', onclick: function () { done(false); }, text: opts.cancel || 'Cancelar' })
      ]);
      back.appendChild(sheet);
      back.addEventListener('click', function (e) { if (e.target === back) done(false); });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      function done(v) {
        back.classList.remove('show');
        setTimeout(function () { back.remove(); }, 220);
        resolve(v);
      }
    });
  }

  /* ---------------- router ---------------- */
  function route(pattern, handler) {
    // pattern: '/', '/edit/:id'
    var parts = pattern.split('/').filter(Boolean);
    routes.push({ parts: parts, handler: handler });
  }

  function parseHash() {
    var hash = location.hash.replace(/^#/, '') || '/';
    var segs = hash.split('/').filter(Boolean);
    for (var i = 0; i < routes.length; i++) {
      var r = routes[i];
      if (r.parts.length !== segs.length) continue;
      var params = {}, ok = true;
      for (var j = 0; j < r.parts.length; j++) {
        var p = r.parts[j];
        if (p[0] === ':') params[p.slice(1)] = decodeURIComponent(segs[j]);
        else if (p !== segs[j]) { ok = false; break; }
      }
      if (ok) return { handler: r.handler, params: params };
    }
    return { handler: routes[0].handler, params: {} };
  }

  var current = null;
  function render() {
    if (current && current.destroy) { try { current.destroy(); } catch (e) {} }
    current = null;
    var m = parseHash();
    clear(appEl);
    var res = m.handler(appEl, m.params) || {};
    current = res;
    window.scrollTo(0, 0);
  }

  function navigate(path) {
    if (location.hash === '#' + path) render();
    else location.hash = path;
  }

  /* ================================================================
     TELA INICIAL
     ================================================================ */
  function viewHome(root) {
    var wrap = h('div', { class: 'screen home' });
    root.appendChild(wrap);

    wrap.appendChild(h('header', { class: 'home-head' }, [
      h('h1', { class: 'wordmark', text: 'Teleprompter' }),
      h('button', {
        class: 'icon-btn', 'aria-label': 'Configurações', title: 'Configurações',
        onclick: function () { navigate('/settings'); }, html: gearSVG()
      })
    ]));

    wrap.appendChild(h('button', {
      class: 'btn btn-primary big', onclick: function () { newScript(); },
      html: '<span class="plus">+</span> Novo roteiro'
    }));

    var search = h('input', {
      class: 'search', type: 'search', placeholder: 'Buscar roteiro…',
      'aria-label': 'Buscar roteiro', autocomplete: 'off', autocapitalize: 'off'
    });
    var searchRow = h('div', { class: 'search-row' }, [h('span', { class: 'search-ico', html: searchSVG() }), search]);
    wrap.appendChild(searchRow);

    var listWrap = h('div', { class: 'list' });
    wrap.appendChild(listWrap);

    var footer = h('div', { class: 'home-foot muted' });
    wrap.appendChild(footer);

    var all = [];
    Store.list().then(function (arr) {
      all = arr;
      footer.textContent = arr.length
        ? (arr.length + ' roteiro' + (arr.length > 1 ? 's' : '') + ' · guardados no aparelho (' + Store.storageMode() + ')')
        : '';
      draw();
    });

    search.addEventListener('input', draw);

    function draw() {
      clear(listWrap);
      var q = Parse.normKey(search.value);
      var items = all.filter(function (r) {
        if (!q) return true;
        return Parse.normKey(r.title).indexOf(q) >= 0 || Parse.normKey(r.body).indexOf(q) >= 0;
      });

      if (!all.length) {
        listWrap.appendChild(h('div', { class: 'empty' }, [
          h('p', { text: 'Nenhum roteiro ainda.' }),
          h('p', { class: 'muted', text: 'Toque em “Novo roteiro” para começar — ou cole um texto pronto.' })
        ]));
        return;
      }
      if (!items.length) {
        listWrap.appendChild(h('div', { class: 'empty' }, [h('p', { class: 'muted', text: 'Nada encontrado.' })]));
        return;
      }

      // "Último roteiro" em destaque quando não há busca
      if (!q && items[0]) {
        listWrap.appendChild(sectionLabel('Último roteiro'));
        listWrap.appendChild(scriptCard(items[0], true));
        if (items.length > 1) listWrap.appendChild(sectionLabel('Meus roteiros'));
        items.slice(1).forEach(function (r) { listWrap.appendChild(scriptCard(r, false)); });
      } else {
        items.forEach(function (r) { listWrap.appendChild(scriptCard(r, false)); });
      }
    }

    function scriptCard(r, hero) {
      var est = Parse.estimate(r.body, r.wpm || Store.getSettings().wpm);
      var meta = [
        fmtDate(r.updatedAt),
        est.words + ' palavra' + (est.words === 1 ? '' : 's'),
        '~' + Parse.fmtDuration(est.totalSec)
      ].join('  ·  ');

      var card = h('div', { class: 'card' + (hero ? ' hero' : '') }, [
        h('button', {
          class: 'card-main', onclick: function () { navigate('/prompter/' + r.id); }
        }, [
          h('div', { class: 'card-title', text: r.title || 'Sem título' }),
          h('div', { class: 'card-meta muted', text: meta })
        ]),
        h('button', {
          class: 'card-more icon-btn', 'aria-label': 'Ações', onclick: function () { actions(r); }, html: dotsSVG()
        })
      ]);
      return card;
    }

    function actions(r) {
      var back = h('div', { class: 'sheet-back' });
      var sheet = h('div', { class: 'sheet' }, [
        h('div', { class: 'sheet-title', text: r.title || 'Sem título' }),
        act('Iniciar teleprompter', function () { navigate('/prompter/' + r.id); }, 'btn-primary'),
        act('Editar roteiro', function () { navigate('/edit/' + r.id); }),
        act('Duplicar', function () {
          Store.duplicate(r.id).then(function () { toast('Roteiro duplicado'); refresh(); });
        }),
        act('Excluir', function () {
          close();
          confirmSheet({
            title: 'Excluir roteiro?', message: '“' + (r.title || 'Sem título') + '” será apagado deste aparelho.',
            ok: 'Excluir', danger: true
          }).then(function (yes) {
            if (yes) Store.remove(r.id).then(function () { toast('Excluído'); refresh(); });
          });
          return true;
        }, 'btn-danger'),
        act('Fechar', function () {}, 'btn-ghost')
      ]);
      back.appendChild(sheet);
      back.addEventListener('click', function (e) { if (e.target === back) close(); });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      function close() { back.classList.remove('show'); setTimeout(function () { back.remove(); }, 220); }
      function act(label, fn, cls) {
        return h('button', {
          class: 'btn ' + (cls || 'btn-line'),
          onclick: function () { var keep = fn(); if (!keep) close(); }, text: label
        });
      }
      function refresh() { close(); Store.list().then(function (a) { all = a; draw(); }); }
    }
  }

  function sectionLabel(t) { return h('div', { class: 'section-label', text: t }); }

  function newScript() {
    Store.create({ title: '', body: '' }).then(function (rec) {
      navigate('/edit/' + rec.id);
    });
  }

  /* ================================================================
     EDITOR
     ================================================================ */
  function viewEditor(root, params) {
    var wrap = h('div', { class: 'screen editor' });
    root.appendChild(wrap);

    var rec = null;
    var saveTimer = null;
    var lastSaved = '';

    var titleInput = h('input', {
      class: 'title-input', type: 'text', placeholder: 'Título do roteiro',
      'aria-label': 'Título', autocomplete: 'off'
    });
    var bodyInput = h('textarea', {
      class: 'body-input', placeholder:
        'Escreva ou cole seu roteiro aqui.\n\nUse marcações:\n[PAUSA 1s]   pausa de 1 segundo\n[RESPIRAR]   instrução de interpretação\n**negrito**   *itálico*   ==destaque==',
      'aria-label': 'Roteiro', spellcheck: 'true'
    });

    var status = h('span', { class: 'save-status muted', text: '' });
    var stats = h('div', { class: 'editor-stats muted' });

    wrap.appendChild(h('header', { class: 'bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': 'Voltar', onclick: goBack, html: backSVG() }),
      h('div', { class: 'bar-title', text: 'Editar' }),
      status
    ]));

    var toolbar = h('div', { class: 'toolbar' }, [
      tbtn('B', 'Negrito', function () { wrapSel('**', '**'); }, 'b'),
      tbtn('I', 'Itálico', function () { wrapSel('*', '*'); }, 'i'),
      tbtn('H', 'Destaque', function () { wrapSel('==', '=='); }, 'h'),
      h('span', { class: 'tb-sep' }),
      tbtn('⏸', 'Inserir pausa', pauseMenu),
      tbtn('🎬', 'Marcação de interpretação', cueMenu),
      h('span', { class: 'tb-sep' }),
      tbtn('¶', 'Quebra de parágrafo', function () { insert('\n\n'); })
    ]);

    wrap.appendChild(h('div', { class: 'editor-body' }, [
      titleInput,
      toolbar,
      bodyInput,
      stats
    ]));

    // ---- carregar ----
    Store.get(params.id).then(function (r) {
      if (!r) { toast('Roteiro não encontrado'); navigate('/'); return; }
      rec = r;
      var draft = Store.getDraft(r.id);
      if (draft && (draft.title !== r.title || draft.body !== r.body) && (draft.updatedAt || 0) > (r.updatedAt || 0)) {
        titleInput.value = draft.title; bodyInput.value = draft.body;
        toast('Rascunho recuperado');
      } else {
        titleInput.value = r.title === 'Sem título' ? '' : r.title;
        bodyInput.value = r.body;
      }
      lastSaved = serialize();
      updateStats();
      autoGrow();
      if (!titleInput.value) titleInput.focus();
    });

    titleInput.addEventListener('input', onChange);
    bodyInput.addEventListener('input', function () { onChange(); autoGrow(); });
    window.addEventListener('beforeunload', flush);

    function serialize() { return JSON.stringify({ t: titleInput.value.trim(), b: bodyInput.value }); }

    function onChange() {
      status.textContent = 'salvando…';
      Store.saveDraft(rec ? rec.id : 'new', {
        title: titleInput.value, body: bodyInput.value, updatedAt: Date.now()
      });
      updateStats();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 700);
    }

    function flush() {
      if (!rec) return;
      var cur = serialize();
      if (cur === lastSaved) { status.textContent = 'salvo'; return; }
      rec.title = titleInput.value.trim() || 'Sem título';
      rec.body = bodyInput.value;
      Store.save(rec).then(function (saved) {
        rec = saved; lastSaved = cur;
        status.textContent = 'salvo';
        Store.clearDraft(rec.id);
      });
    }

    function updateStats() {
      var s = Store.getSettings();
      var est = Parse.estimate(bodyInput.value, rec && rec.wpm || s.wpm);
      clear(stats);
      stats.appendChild(h('span', { text: 'Palavras: ' + est.words }));
      stats.appendChild(h('span', { text: 'Duração estimada: ~' + Parse.fmtDuration(est.totalSec) }));
      if (est.pauseMs > 0) stats.appendChild(h('span', { text: 'Pausas: ' + (est.pauseMs / 1000).toString().replace('.', ',') + 's' }));
      stats.appendChild(h('span', { text: est.words + ' pal · ' + (rec && rec.wpm || s.wpm) + ' ppm' }));
    }

    function goBack() { flush(); navigate('/'); }

    // ---- toolbar helpers ----
    function tbtn(label, title, fn, mod) {
      return h('button', { class: 'tb' + (mod ? ' tb-' + mod : ''), title: title, 'aria-label': title, onclick: fn, text: label });
    }
    function insert(str) {
      var s = bodyInput.selectionStart, e = bodyInput.selectionEnd, v = bodyInput.value;
      bodyInput.value = v.slice(0, s) + str + v.slice(e);
      bodyInput.selectionStart = bodyInput.selectionEnd = s + str.length;
      bodyInput.focus(); onChange(); autoGrow();
    }
    function wrapSel(pre, post) {
      var s = bodyInput.selectionStart, e = bodyInput.selectionEnd, v = bodyInput.value;
      var sel = v.slice(s, e) || 'texto';
      bodyInput.value = v.slice(0, s) + pre + sel + post + v.slice(e);
      bodyInput.selectionStart = s + pre.length;
      bodyInput.selectionEnd = s + pre.length + sel.length;
      bodyInput.focus(); onChange();
    }
    function pauseMenu() {
      menu('Inserir pausa', [
        ['0,5 segundo', '[PAUSA 0,5s]'], ['1 segundo', '[PAUSA 1s]'],
        ['1,5 segundo', '[PAUSA 1,5s]'], ['2 segundos', '[PAUSA 2s]'],
        ['3 segundos', '[PAUSA 3s]'], ['Personalizada…', '__custom__']
      ], function (val) {
        if (val === '__custom__') {
          var n = prompt('Duração da pausa em segundos (ex.: 2,5):', '2');
          if (n == null) return;
          n = parseFloat(String(n).replace(',', '.'));
          if (!isFinite(n) || n <= 0) return toast('Valor inválido');
          insert(' [PAUSA ' + String(n).replace('.', ',') + 's] ');
        } else insert(' ' + val + ' ');
      });
    }
    function cueMenu() {
      var items = [
        ['🙂 Sorrir', '[SORRIR]'], ['‼️ Ênfase', '[ÊNFASE]'],
        ['🎯 Olhar para a câmera', '[OLHAR PARA A CÂMERA]'], ['🌬️ Respirar', '[RESPIRAR]'],
        ['🐢 Mais devagar', '[MAIS DEVAGAR]'], ['⚡ Mais rápido', '[MAIS RÁPIDO]'],
        ['❓ Tom de pergunta', '[TOM DE PERGUNTA]'], ['✍️ Outra instrução…', '__custom__']
      ];
      menu('Marcação de interpretação', items, function (val) {
        if (val === '__custom__') {
          var t = prompt('Instrução (ex.: PALMAS, OLHAR PARA BAIXO):', '');
          if (!t) return;
          insert(' [' + t.toUpperCase() + '] ');
        } else insert(' ' + val + ' ');
      });
    }
    function menu(title, items, cb) {
      var back = h('div', { class: 'sheet-back' });
      var sheet = h('div', { class: 'sheet' }, [h('div', { class: 'sheet-title', text: title })]);
      items.forEach(function (it) {
        sheet.appendChild(h('button', {
          class: 'btn btn-line', text: it[0],
          onclick: function () { close(); cb(it[1]); }
        }));
      });
      sheet.appendChild(h('button', { class: 'btn btn-ghost', text: 'Cancelar', onclick: close }));
      back.appendChild(sheet);
      back.addEventListener('click', function (e) { if (e.target === back) close(); });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      function close() { back.classList.remove('show'); setTimeout(function () { back.remove(); }, 220); }
    }

    function autoGrow() {
      bodyInput.style.height = 'auto';
      bodyInput.style.height = Math.max(240, bodyInput.scrollHeight + 8) + 'px';
    }

    return {
      destroy: function () {
        flush();
        window.removeEventListener('beforeunload', flush);
      }
    };
  }

  /* ================================================================
     CONFIGURAÇÕES
     ================================================================ */
  function viewSettings(root) {
    var wrap = h('div', { class: 'screen settings' });
    root.appendChild(wrap);
    var s = Store.getSettings();

    wrap.appendChild(h('header', { class: 'bar' }, [
      h('button', { class: 'icon-btn', 'aria-label': 'Voltar', onclick: function () { navigate('/'); }, html: backSVG() }),
      h('div', { class: 'bar-title', text: 'Configurações' }),
      h('span', {})
    ]));

    var body = h('div', { class: 'settings-body' });
    wrap.appendChild(body);

    function put(patch) { s = Store.setSettings(patch); if (patch.theme) applyTheme(); }

    body.appendChild(group('Leitura', [
      rowSelect('Tema', 'theme', [['Escuro', 'dark'], ['Claro', 'light']]),
      rowRange('Velocidade padrão', 'speed', 0.4, 2.0, 0.05, function (v) { return v.toFixed(2) + '×'; }),
      rowRange('Tamanho da fonte', 'fontSize', 24, 96, 1, function (v) { return v + 'px'; }),
      rowRange('Peso da fonte', 'fontWeight', 300, 800, 100, function (v) { return String(v); }),
      rowRange('Espaçamento entre linhas', 'lineHeight', 1.1, 2.4, 0.05, function (v) { return v.toFixed(2); }),
      rowRange('Largura do texto', 'textWidth', 50, 100, 1, function (v) { return v + '%'; }),
      rowRange('Posição da zona de leitura', 'readingZone', 0.12, 0.6, 0.01, function (v) { return Math.round(v * 100) + '% do topo'; }),
      rowSelect('Alinhamento', 'align', [['Esquerda', 'left'], ['Centro', 'center']])
    ]));

    body.appendChild(group('Ritmo de fala', [
      rowSelect('Palavras por minuto', 'wpm',
        [['130', 130], ['140', 140], ['150', 150], ['160', 160], ['170', 170]], true),
      rowToggle('Escalar pausas pela velocidade', 'scalePauses',
        'Se ligado, ler a 0,7× também deixa as pausas mais longas.')
    ]));

    body.appendChild(group('Gravação', [
      rowToggle('Modo espelho', 'mirror', 'Inverte o texto na horizontal para uso com vidro de teleprompter.'),
      rowToggle('Manter a tela acesa', 'keepAwake', 'Usa Wake Lock quando o navegador permite (iOS 16.4+).'),
      rowRange('Ocultar controles após', 'hideControlsAfter', 0, 10, 1, function (v) { return v === 0 ? 'nunca' : v + 's'; }),
      rowRange('Contagem regressiva ao iniciar', 'countIn', 0, 10, 1, function (v) { return v === 0 ? 'desligada' : v + 's'; })
    ]));

    body.appendChild(group('Acompanhamento por voz (experimental)', [
      rowToggle('Ativar por padrão', 'voiceFollow',
        SpeechFollow.supported()
          ? 'O texto tenta seguir sua fala. Precisa de internet e permissão de microfone. Em iPhone é instável — o controle por velocidade continua sendo o principal.'
          : 'Indisponível neste navegador. O reconhecimento de voz da Web não é suportado aqui.'),
    ]));

    body.appendChild(group('Meus dados', [
      h('button', {
        class: 'btn btn-line', text: 'Exportar roteiros (backup)', onclick: function () {
          Store.exportAll().then(function (json) {
            var blob = new Blob([json], { type: 'application/json' });
            var a = h('a', {
              href: URL.createObjectURL(blob),
              download: 'teleprompter-backup-' + new Date().toISOString().slice(0, 10) + '.json'
            });
            document.body.appendChild(a); a.click(); a.remove();
          });
        }
      }),
      (function () {
        var file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
        file.addEventListener('change', function () {
          var f = file.files[0]; if (!f) return;
          var rd = new FileReader();
          rd.onload = function () {
            Store.importAll(rd.result).then(function (n) { toast(n + ' roteiro(s) importado(s)'); })
              .catch(function (e) { toast(e.message); });
          };
          rd.readAsText(f);
        });
        var b = h('button', { class: 'btn btn-line', text: 'Importar roteiros', onclick: function () { file.click(); } });
        var box = h('div', {}, [b, file]);
        return box;
      })(),
      h('button', {
        class: 'btn btn-ghost', text: 'Restaurar configurações padrão', onclick: function () {
          confirmSheet({ title: 'Restaurar padrão?', ok: 'Restaurar' }).then(function (y) {
            if (y) { Store.resetSettings(); applyTheme(); navigate('/settings'); render(); }
          });
        }
      })
    ]));

    body.appendChild(h('div', { class: 'about muted' }, [
      h('p', { text: 'Teleprompter · uso pessoal · 100% offline após a instalação.' }),
      h('p', { text: 'Armazenamento atual: ' + Store.storageMode() + '.' })
    ]));

    /* --- construtores de linha --- */
    function group(title, rows) {
      return h('section', { class: 'group' }, [h('h2', { text: title })].concat(rows));
    }
    function rowRange(label, key, min, max, step, fmt) {
      var val = h('span', { class: 'row-val', text: fmt(s[key]) });
      var input = h('input', {
        class: 'range', type: 'range', min: min, max: max, step: step, value: s[key]
      });
      input.addEventListener('input', function () {
        var v = parseFloat(input.value);
        val.textContent = fmt(v);
        var p = {}; p[key] = v; put(p);
      });
      return h('div', { class: 'row row-range' }, [
        h('div', { class: 'row-head' }, [h('label', { text: label }), val]), input
      ]);
    }
    function rowSelect(label, key, opts, numeric) {
      var sel = h('select', { class: 'select' });
      opts.forEach(function (o) {
        var opt = h('option', { value: String(o[1]), text: o[0] });
        if (String(s[key]) === String(o[1])) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () {
        var v = numeric ? parseFloat(sel.value) : sel.value;
        var p = {}; p[key] = v; put(p);
      });
      return h('div', { class: 'row' }, [h('label', { text: label }), sel]);
    }
    function rowToggle(label, key, hint) {
      var cb = h('input', { type: 'checkbox', class: 'switch' });
      cb.checked = !!s[key];
      cb.addEventListener('change', function () { var p = {}; p[key] = cb.checked; put(p); });
      return h('div', { class: 'row row-toggle' }, [
        h('div', {}, [h('label', { text: label }), hint ? h('div', { class: 'hint muted', text: hint }) : null]),
        h('label', { class: 'switch-wrap' }, [cb, h('span', { class: 'switch-track' })])
      ]);
    }
  }

  /* ---------------- tema ---------------- */
  function applyTheme() {
    var s = Store.getSettings();
    document.documentElement.setAttribute('data-theme', s.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', s.theme === 'light' ? '#fbfaf8' : '#0b0b0c');
  }

  /* ---------------- datas ---------------- */
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var yst = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    var hm = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (sameDay) return 'hoje ' + hm;
    if (yst) return 'ontem ' + hm;
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- ícones (SVG inline) ---------------- */
  function gearSVG() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L14.8 2h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1L6.4 4.6l-2 3.4L6.4 10a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.3.9 2-3.4z"/></svg>'; }
  function searchSVG() { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>'; }
  function dotsSVG() { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'; }
  function backSVG() { return '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>'; }

  /* ---------------- boot ---------------- */
  function start() {
    appEl = document.getElementById('app');
    applyTheme();
    route('/', viewHome);
    route('/edit/:id', viewEditor);
    route('/settings', viewSettings);
    if (global.Prompter && global.Prompter.registerRoutes) global.Prompter.registerRoutes(route);
    window.addEventListener('hashchange', render);
    render();
  }

  global.App = {
    start: start, navigate: navigate, route: route, render: render,
    h: h, clear: clear, toast: toast, confirmSheet: confirmSheet, applyTheme: applyTheme,
    fmtDate: fmtDate, backSVG: backSVG
  };
})(window);
