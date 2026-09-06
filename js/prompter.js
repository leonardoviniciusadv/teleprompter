/* =====================================================================
   prompter.js — Motor do teleprompter + tela de leitura/gravação
   Recursos:
   - rolagem por ritmo (ppm) com multiplicador de velocidade ao vivo
   - zona de leitura ajustável (olhos perto da câmera)
   - pausas programadas [PAUSA 1s] respeitadas de verdade
   - marcações de interpretação exibidas com discrição
   - voltar/avançar frase · voltar/avançar 5s/10s · voltar/avançar parágrafo
   - modo ensaio (tempo, restante, ppm real, progresso, resumo final)
   - modo espelho · orientação livre · contagem regressiva
   - câmera frontal opcional + gravação (quando o navegador suporta)
   - acompanhamento por voz (experimental) com recuo automático para manual
   ===================================================================== */
(function (global) {
  'use strict';

  var h, clear, toast;

  /* ============ Acompanhamento por voz (experimental) ============ */
  var SpeechFollow = {
    supported: function () {
      return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
    },
    create: function (opts) {
      var Rec = global.SpeechRecognition || global.webkitSpeechRecognition;
      if (!Rec) return null;
      var rec = new Rec();
      rec.lang = opts.lang || 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      var running = false, stopped = false, lastHeardAt = 0, restarts = 0;
      var tailWords = [];

      rec.onresult = function (ev) {
        var words = [];
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var txt = ev.results[i][0].transcript || '';
          txt.toLowerCase().split(/[^\p{L}\p{N}]+/u).forEach(function (w) { if (w) words.push(stripAccents(w)); });
        }
        if (words.length) {
          tailWords = tailWords.concat(words).slice(-10);
          lastHeardAt = performance.now();
          opts.onwords && opts.onwords(tailWords.slice());
        }
      };
      rec.onerror = function (e) {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          opts.onfail && opts.onfail('Permissão de microfone negada.');
          stopped = true;
        }
      };
      rec.onend = function () {
        running = false;
        if (stopped) return;
        restarts++;
        if (restarts > 40) { opts.onfail && opts.onfail('Reconhecimento de voz instável neste aparelho.'); return; }
        try { rec.start(); running = true; } catch (e) {}
      };

      return {
        start: function () {
          stopped = false; restarts = 0;
          try { rec.start(); running = true; lastHeardAt = performance.now(); }
          catch (e) { opts.onfail && opts.onfail('Não foi possível iniciar o microfone.'); }
        },
        stop: function () { stopped = true; try { rec.stop(); } catch (e) {} },
        silenceMs: function () { return performance.now() - lastHeardAt; }
      };
    }
  };
  global.SpeechFollow = SpeechFollow;

  function stripAccents(s) {
    return s && s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  /* ============================ VIEW ============================ */
  function viewPrompter(root, params) {
    h = App.h; clear = App.clear; toast = App.toast;
    var S = Store.getSettings();

    var scr = h('div', { class: 'screen prompter', 'data-ptheme': S.theme });
    root.appendChild(scr);
    applyVars();

    // --- estrutura ---
    var video = h('video', { class: 'cam', playsinline: '', muted: '', autoplay: '' });
    var camTint = h('div', { class: 'cam-tint' });
    var doc = h('div', { class: 'doc' });
    var track = h('div', { class: 'doc-track' }, [doc]);
    var viewport = h('div', { class: 'doc-viewport' }, [track]);
    var guide = h('div', { class: 'reading-guide' });
    var fadeT = h('div', { class: 'edge-fade top' });
    var fadeB = h('div', { class: 'edge-fade bottom' });
    var bigMsg = h('div', { class: 'big-msg' });
    var stage = h('div', { class: 'stage' }, [video, camTint, viewport, fadeT, fadeB, guide, bigMsg]);
    scr.appendChild(stage);

    // HUD ensaio
    var hud = h('div', { class: 'hud hidden' });
    scr.appendChild(hud);

    // barra superior
    var topbar = h('div', { class: 'p-top' }, [
      h('button', { class: 'p-ico', 'aria-label': 'Sair', onclick: exit, html: App.backSVG() }),
      h('div', { class: 'p-top-right' }, [
        toggleBtn('Ensaio', 'rehearse', S ? false : false, toggleRehearse),
        SpeechFollow.supported() ? toggleBtn('Voz', 'voice', S.voiceFollow, toggleVoice) : null,
        toggleBtn('Espelho', 'mirror', S.mirror, toggleMirror),
        camAvailable() ? toggleBtn('Câmera', 'cam', false, toggleCam) : null
      ])
    ]);
    scr.appendChild(topbar);

    // controles inferiores
    var speedVal = h('button', { class: 'speed-val', onclick: speedPresets, text: fmtX(S.speed) });
    var speedSlider = h('input', { class: 'speed-slider', type: 'range', min: 0.4, max: 2.0, step: 0.05, value: S.speed });
    speedSlider.addEventListener('input', function () { setSpeed(parseFloat(speedSlider.value)); });

    var playBtn = h('button', { class: 'play-btn', 'aria-label': 'Iniciar', onclick: togglePlay, html: iconPlay() });

    var controls = h('div', { class: 'p-controls' }, [
      h('div', { class: 'nav-row' }, [
        navBtn('¶', 'Parágrafo anterior', function () { seekParagraph(-1); }),
        navBtn('10s', 'Voltar 10 segundos', function () { seekSeconds(-10); }),
        navBtn('5s', 'Voltar 5 segundos', function () { seekSeconds(-5); }),
        navBtn('frase', 'Frase anterior', function () { seekSentence(-1); }, 'wide'),
        playBtn,
        navBtn('frase', 'Próxima frase', function () { seekSentence(1); }, 'wide'),
        navBtn('5s', 'Avançar 5 segundos', function () { seekSeconds(5); }),
        navBtn('10s', 'Avançar 10 segundos', function () { seekSeconds(10); }),
        navBtn('¶', 'Próximo parágrafo', function () { seekParagraph(1); })
      ]),
      h('div', { class: 'speed-row' }, [
        h('button', { class: 'sp-step', 'aria-label': 'Diminuir velocidade', text: '−', onclick: function () { setSpeed(state.speed - 0.05); } }),
        speedSlider,
        h('button', { class: 'sp-step', 'aria-label': 'Aumentar velocidade', text: '+', onclick: function () { setSpeed(state.speed + 0.05); } }),
        speedVal,
        h('button', { class: 'sp-restart', 'aria-label': 'Recomeçar', title: 'Recomeçar', onclick: restart, html: iconRestart() })
      ])
    ]);
    scr.appendChild(controls);

    var hintOverlay = h('div', { class: 'gesture-hint', html:
      'Toque: mostrar/ocultar controles &nbsp;·&nbsp; Toque duplo: iniciar/pausar<br>' +
      'Deslize ↑/↓: velocidade &nbsp;·&nbsp; Deslize ←/→: frase' });
    scr.appendChild(hintOverlay);
    setTimeout(function () { hintOverlay.classList.add('gone'); }, 4200);

    /* ---------------- estado ---------------- */
    var state = {
      rec: null,
      parsed: null,
      anchors: [],           // {el,type,top,words,cumWords,consumed,paraIndex,tokens}
      totalWords: 0,
      offset: 0,
      startOffset: 0,
      maxOffset: 0,
      pxPerWord: 1,
      readingLineY: 0,
      speed: S.speed,
      running: false,
      inPause: false,
      finished: false,
      curIdx: -1,
      elapsedMs: 0,
      lastTs: 0,
      rehearse: false,
      voice: false,
      cam: false,
      mirror: S.mirror,
      voiceTargetOffset: null,
      voiceTargetAt: 0,
      speech: null,
      recorder: null, chunks: [], recording: false,
      recTried: false, lastRecordingBlob: null, recMime: null
    };

    var wakeLock = null;
    var hideTimer = null;
    var rafId = null;
    var pauseTimer = null;

    /* ---------------- carregar roteiro ---------------- */
    Store.get(params.id).then(function (r) {
      if (!r) { toast('Roteiro não encontrado'); App.navigate('/'); return; }
      state.rec = r;
      state.parsed = Parse.parse(r.body);
      buildDoc();
      requestAnimationFrame(function () { measure(); layoutIdle(); });
      keepAwake();
      tryFullscreen();
      if (S.voiceFollow && SpeechFollow.supported()) toggleVoice(true);
      showControls();
    });

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    if (screen.orientation && screen.orientation.addEventListener)
      screen.orientation.addEventListener('change', onResize);

    /* ---------------- construir DOM do texto ---------------- */
    function buildDoc() {
      clear(doc);
      var segs = state.parsed.segs;
      var p = h('p', { class: 'seg-para' });
      doc.appendChild(p);
      var paraIndex = 0;
      var cum = 0;
      segs.forEach(function (s) {
        if (s.type === 'para') {
          paraIndex++;
          p = h('p', { class: 'seg-para' });
          doc.appendChild(p);
          return;
        }
        if (s.type === 'sentence') {
          var span = h('span', { class: 'seg-sent', dataset: { p: paraIndex } });
          s.runs.forEach(function (rn) {
            var node = document.createTextNode(rn.text);
            if (rn.b || rn.i || rn.hl) {
              var w = h('span', {
                class: (rn.b ? 'r-b ' : '') + (rn.i ? 'r-i ' : '') + (rn.hl ? 'r-hl' : '')
              });
              w.appendChild(node); node = w;
            }
            span.appendChild(node);
          });
          span.appendChild(document.createTextNode(' '));
          p.appendChild(span);
        } else if (s.type === 'pause') {
          var pz = h('span', { class: 'seg-tok tok-pause', dataset: { p: paraIndex, ms: s.ms }, text: '⏸ ' + s.label.replace('Pausa ', '') });
          p.appendChild(pz);
        } else if (s.type === 'cue') {
          var cu = h('span', { class: 'seg-tok tok-cue', dataset: { p: paraIndex }, text: (s.icon || '▹') + ' ' + s.label });
          p.appendChild(cu);
        }
      });
    }

    /* ---------------- medir posições ---------------- */
    function measure() {
      var vpH = viewport.clientHeight;
      state.readingLineY = Math.round(vpH * clampNum(S.readingZone, 0.08, 0.7));
      guide.style.top = state.readingLineY + 'px';
      fadeT.style.height = state.readingLineY + 'px';
      fadeB.style.height = (vpH - state.readingLineY) + 'px';

      var anchors = [];
      var cum = 0;
      var sents = doc.querySelectorAll('.seg-sent, .seg-tok');
      var segList = state.parsed.segs.filter(function (s) { return s.type === 'sentence' || s.type === 'pause' || s.type === 'cue'; });
      for (var i = 0; i < sents.length; i++) {
        var el = sents[i];
        var seg = segList[i] || {};
        anchors.push({
          el: el,
          type: el.classList.contains('tok-pause') ? 'pause' : (el.classList.contains('tok-cue') ? 'cue' : 'sentence'),
          top: el.offsetTop,
          words: seg.words || 0,
          ms: seg.ms || 0,
          cumWords: cum,
          paraIndex: parseInt(el.dataset.p, 10) || 0,
          tokens: seg.text ? tokenize(seg.text) : [],
          consumed: false
        });
        if (seg.type === 'sentence') cum += (seg.words || 0);
      }
      state.anchors = anchors;
      state.totalWords = cum;

      var first = anchors[0], last = anchors[anchors.length - 1];
      state.startOffset = first ? (first.top - state.readingLineY) : 0;
      state.maxOffset = last ? (last.top - state.readingLineY) : 0;

      // px por palavra = distância real de rolagem dividida pelo nº de palavras.
      // Assim, a 1,0× o roteiro inteiro leva ≈ (palavras / ppm) minutos, e as
      // pausas programadas (rolagem congelada) somam por cima — igual à
      // estimativa mostrada no editor.
      var span = state.maxOffset - state.startOffset;
      state.pxPerWord = state.totalWords > 0 ? (span / state.totalWords) : 40;

      if (state.offset < state.startOffset) state.offset = state.startOffset;
      armPauses();
      applyOffset();
      refreshActive(true);
    }

    function layoutIdle() { applyOffset(); }

    function onResize() {
      var progress = state.maxOffset > state.startOffset
        ? (state.offset - state.startOffset) / (state.maxOffset - state.startOffset) : 0;
      requestAnimationFrame(function () {
        measure();
        state.offset = state.startOffset + progress * (state.maxOffset - state.startOffset);
        armPauses(); applyOffset(); refreshActive(true);
      });
    }

    /* ---------------- render de posição ---------------- */
    function applyOffset() {
      track.style.transform = 'translate3d(0,' + (-state.offset) + 'px,0)';
      doc.style.transform = state.mirror ? 'scaleX(-1)' : 'none';
    }

    function refreshActive(force) {
      var idx = currentAnchorIndex();
      if (idx === state.curIdx && !force) return;
      if (state.curIdx >= 0 && state.anchors[state.curIdx]) state.anchors[state.curIdx].el.classList.remove('active');
      state.curIdx = idx;
      if (idx >= 0 && state.anchors[idx]) state.anchors[idx].el.classList.add('active');
      if (state.rehearse) updateHud();
    }

    function currentAnchorIndex() {
      var y = state.offset + state.readingLineY;
      var idx = -1;
      for (var i = 0; i < state.anchors.length; i++) {
        if (state.anchors[i].top <= y + 2) idx = i; else break;
      }
      return idx;
    }

    function wordsPassed() {
      var y = state.offset + state.readingLineY, w = 0;
      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        if (a.type !== 'sentence') continue;
        if (a.top <= y) w = a.cumWords + a.words; else break;
      }
      return w;
    }

    /* ---------------- pausas ---------------- */
    function armPauses() {
      state.anchors.forEach(function (a) {
        if (a.type !== 'pause') return;
        var trigger = a.top - state.readingLineY;
        a.consumed = state.offset > trigger - 2;
      });
    }
    function checkPause() {
      if (state.inPause) return;
      for (var i = 0; i < state.anchors.length; i++) {
        var a = state.anchors[i];
        if (a.type !== 'pause' || a.consumed) continue;
        var trigger = a.top - state.readingLineY;
        if (state.offset >= trigger) {
          a.consumed = true;
          enterPause(a);
          return;
        }
      }
    }
    function enterPause(a) {
      var ms = a.ms || 1000;
      if (S.scalePauses) ms = ms / state.speed;
      state.inPause = true;
      var remain = Math.ceil(ms / 100) * 100;
      bigMsg.className = 'big-msg show pause';
      bigMsg.textContent = (remain / 1000).toFixed(1).replace('.', ',') + 's';
      clearInterval(pauseTimer);
      var t0 = performance.now();
      pauseTimer = setInterval(function () {
        var left = ms - (performance.now() - t0);
        if (left <= 0) {
          clearInterval(pauseTimer);
          bigMsg.className = 'big-msg';
          state.inPause = false;
        } else {
          bigMsg.textContent = (left / 1000).toFixed(1).replace('.', ',') + 's';
        }
      }, 80);
    }

    /* ---------------- loop ---------------- */
    function tick(ts) {
      rafId = requestAnimationFrame(tick);
      var dt = state.lastTs ? Math.min(0.05, (ts - state.lastTs) / 1000) : 0;
      state.lastTs = ts;
      if (!state.running) return;

      if (!state.inPause) state.elapsedMs += dt * 1000;

      if (state.inPause) { /* segura */ }
      else if (state.voice && state.voiceTargetOffset != null && (performance.now() - state.voiceTargetAt) < 3500) {
        // acompanhar voz: aproxima suavemente do alvo, sem recuar bruscamente
        var target = Math.max(state.offset - state.pxPerWord * 2, state.voiceTargetOffset);
        state.offset += (target - state.offset) * Math.min(1, dt * 3.5);
      } else if (state.voice && state.speech && state.speech.silenceMs() > 2500) {
        // silêncio prolongado no modo voz: mantém a posição
      } else {
        var pps = (S.wpm / 60) * state.pxPerWord * state.speed;
        state.offset += pps * dt;
      }

      if (state.offset >= state.maxOffset) {
        state.offset = state.maxOffset;
        applyOffset(); refreshActive(); finish();
        return;
      }
      checkPause();
      applyOffset();
      refreshActive();
      if (state.rehearse) updateHud();
    }

    /* ---------------- play / pause ---------------- */
    function togglePlay() { state.running ? pause() : play(); }

    function play() {
      if (state.finished) { restart(); return; }
      if (!state.anchors.length) return;
      var doStart = function () {
        state.running = true;
        state.lastTs = 0;
        playBtn.innerHTML = iconPause();
        playBtn.setAttribute('aria-label', 'Pausar');
        if (!rafId) rafId = requestAnimationFrame(tick);
        if (state.voice && state.speech) state.speech.start();
        keepAwake(); // iOS costuma exigir gesto do usuário para o Wake Lock
        scheduleHide();
      };
      var atStart = Math.abs(state.offset - state.startOffset) < 4;
      if (atStart && S.countIn > 0) countIn(S.countIn, doStart);
      else doStart();
    }

    function pause() {
      state.running = false;
      playBtn.innerHTML = iconPlay();
      playBtn.setAttribute('aria-label', 'Iniciar');
      showControls();
      if (state.speech) state.speech.stop();
    }

    function countIn(n, done) {
      var i = n;
      bigMsg.className = 'big-msg show count';
      bigMsg.textContent = i;
      var iv = setInterval(function () {
        i--;
        if (i <= 0) {
          clearInterval(iv);
          bigMsg.className = 'big-msg';
          done();
        } else bigMsg.textContent = i;
      }, 1000);
    }

    function restart() {
      state.offset = state.startOffset;
      state.elapsedMs = 0;
      state.finished = false;
      state.running = false;
      bigMsg.className = 'big-msg';
      hideSummary();
      armPauses();
      applyOffset(); refreshActive(true);
      playBtn.innerHTML = iconPlay();
      showControls();
    }

    function finish() {
      state.running = false;
      state.finished = true;
      playBtn.innerHTML = iconRestart();
      if (state.speech) state.speech.stop();
      if (state.recording) stopRecording(); // onstop reconstrói o resumo com o botão de salvar
      showSummary();
      showControls();
    }

    /* ---------------- navegação ---------------- */
    function seekTo(off) {
      state.offset = clampNum(off, state.startOffset, state.maxOffset);
      state.finished = false;
      hideSummary();
      armPauses();
      applyOffset(); refreshActive(true);
      bumpInteraction();
    }
    function seekSeconds(sec) {
      var px = (S.wpm / 60) * state.pxPerWord * sec; // "segundos de conteúdo" (independe do multiplicador)
      seekTo(state.offset + px);
    }
    function seekSentence(dir) {
      var idx = currentAnchorIndex();
      var target;
      if (dir < 0) {
        // início da frase atual; se já estiver no início, vai para a anterior
        var curTop = idx >= 0 ? state.anchors[idx].top - state.readingLineY : state.startOffset;
        if (state.offset - curTop < 12 && idx > 0) target = state.anchors[idx - 1];
        else target = state.anchors[Math.max(0, idx)];
      } else {
        target = state.anchors[Math.min(state.anchors.length - 1, idx + 1)];
      }
      if (target) seekTo(target.top - state.readingLineY);
    }
    function seekParagraph(dir) {
      var idx = currentAnchorIndex();
      var curPara = idx >= 0 ? state.anchors[idx].paraIndex : 0;
      var targetPara = curPara + dir;
      var found = null;
      if (dir < 0) {
        // se estiver longe do começo do parágrafo atual, volta para ele
        for (var i = idx; i >= 0; i--) {
          if (state.anchors[i].paraIndex === curPara) found = state.anchors[i];
          else break;
        }
        if (found && state.offset - (found.top - state.readingLineY) < 12) {
          targetPara = curPara - 1;
          found = null;
          for (var j = 0; j < state.anchors.length; j++) {
            if (state.anchors[j].paraIndex === targetPara) { found = state.anchors[j]; break; }
          }
        }
      } else {
        for (var k = 0; k < state.anchors.length; k++) {
          if (state.anchors[k].paraIndex >= targetPara) { found = state.anchors[k]; break; }
        }
      }
      if (found) seekTo(found.top - state.readingLineY);
    }

    /* ---------------- velocidade ---------------- */
    function setSpeed(v) {
      v = clampNum(Math.round(v * 100) / 100, 0.4, 2.0);
      state.speed = v;
      speedVal.textContent = fmtX(v);
      speedSlider.value = v;
      Store.setSettings({ speed: v });
      bumpInteraction();
    }
    function speedPresets() {
      var vals = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
      var back = h('div', { class: 'sheet-back' });
      var grid = h('div', { class: 'preset-grid' });
      vals.forEach(function (v) {
        grid.appendChild(h('button', {
          class: 'preset' + (Math.abs(v - state.speed) < 0.001 ? ' on' : ''),
          text: fmtX(v), onclick: function () { setSpeed(v); close(); }
        }));
      });
      var sheet = h('div', { class: 'sheet' }, [h('div', { class: 'sheet-title', text: 'Velocidade' }), grid,
        h('button', { class: 'btn btn-ghost', text: 'Fechar', onclick: close })]);
      back.appendChild(sheet);
      back.addEventListener('click', function (e) { if (e.target === back) close(); });
      document.body.appendChild(back);
      requestAnimationFrame(function () { back.classList.add('show'); });
      function close() { back.classList.remove('show'); setTimeout(function () { back.remove(); }, 200); }
    }

    /* ---------------- HUD / ensaio ---------------- */
    function toggleRehearse(on) {
      state.rehearse = on == null ? !state.rehearse : on;
      hud.classList.toggle('hidden', !state.rehearse);
      setToggle('rehearse', state.rehearse);
      if (state.rehearse) updateHud();
    }
    function updateHud() {
      var wp = wordsPassed();
      var elapsed = state.elapsedMs / 1000;
      var wpmNow = elapsed > 3 ? Math.round(wp / (elapsed / 60)) : 0;
      var totalSec = state.parsed ? Parse.estimate(state.rec.body, S.wpm).totalSec : 0;
      var prog = state.maxOffset > state.startOffset
        ? (state.offset - state.startOffset) / (state.maxOffset - state.startOffset) : 0;
      var remain = Math.max(0, totalSec * (1 - prog));
      clear(hud);
      hud.appendChild(hudItem(Parse.fmtClock(elapsed), 'decorrido'));
      hud.appendChild(hudItem('-' + Parse.fmtClock(remain), 'restante'));
      hud.appendChild(hudItem(Math.round(prog * 100) + '%', 'progresso'));
      hud.appendChild(hudItem(wpmNow || '—', 'ppm agora'));
      hud.appendChild(hudItem(wp + '/' + state.totalWords, 'palavras'));
    }
    function hudItem(v, l) {
      return h('div', { class: 'hud-item' }, [h('b', { text: String(v) }), h('span', { text: l })]);
    }

    /* ---------------- resumo final ---------------- */
    var summaryEl = null;
    function showSummary() {
      hideSummary();
      var elapsed = state.elapsedMs / 1000;
      var avg = elapsed > 1 ? Math.round(state.totalWords / (elapsed / 60)) : 0;
      summaryEl = h('div', { class: 'summary' }, [
        h('div', { class: 'summary-card' }, [
          h('div', { class: 'summary-h', text: 'Vídeo finalizado' }),
          h('div', { class: 'summary-grid' }, [
            sItem(Parse.fmtClock(elapsed), 'Duração'),
            sItem(String(state.totalWords), 'Palavras'),
            sItem(String(avg || '—'), 'ppm médio')
          ]),
          state.lastRecordingBlob ? h('button', {
            class: 'btn btn-line', text: 'Salvar / compartilhar vídeo', onclick: shareRecording
          }) : null,
          (state.recTried && !state.lastRecordingBlob) ? h('div', {
            class: 'summary-note', text: 'A gravação não funcionou neste navegador. Grave com o app Câmera do iPhone usando este app só como teleprompter.'
          }) : null,
          h('button', { class: 'btn btn-primary', text: 'Refazer', onclick: restart }),
          h('button', { class: 'btn btn-ghost', text: 'Sair', onclick: exit })
        ])
      ]);
      scr.appendChild(summaryEl);
    }
    function hideSummary() { if (summaryEl) { summaryEl.remove(); summaryEl = null; } }
    function sItem(v, l) { return h('div', {}, [h('b', { text: v }), h('span', { text: l })]); }

    /* ---------------- espelho ---------------- */
    function toggleMirror(on) {
      state.mirror = on == null ? !state.mirror : on;
      setToggle('mirror', state.mirror);
      Store.setSettings({ mirror: state.mirror });
      applyOffset();
    }

    /* ---------------- câmera ---------------- */
    function camAvailable() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }
    var camStream = null;
    function toggleCam(on) {
      var want = on == null ? !state.cam : on;
      if (want) startCam(); else stopCam();
    }
    function startCam() {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
        .then(function (stream) {
          camStream = stream;
          video.srcObject = stream;
          video.play().catch(function () {});
          state.cam = true;
          scr.classList.add('has-cam');
          setToggle('cam', true);
          maybeAddRecordBtn();
        })
        .catch(function (e) {
          toast('Câmera indisponível: ' + (e && e.name || e));
        });
    }
    function stopCam() {
      if (state.recording) stopRecording();
      if (camStream) camStream.getTracks().forEach(function (t) { t.stop(); });
      camStream = null; video.srcObject = null;
      state.cam = false;
      scr.classList.remove('has-cam');
      setToggle('cam', false);
      removeRecordBtn();
    }

    /* ---------------- gravação (quando suportada) ---------------- */
    var recBtn = null;
    function recMime() {
      if (!global.MediaRecorder) return null;
      var list = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
      for (var i = 0; i < list.length; i++) {
        try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {}
      }
      return null;
    }
    var recWarned = false;
    function maybeAddRecordBtn() {
      if (recBtn) return;
      if (!recMime()) {
        if (!recWarned) {
          recWarned = true;
          toast('Este navegador não grava vídeo. Use o app Câmera do iPhone com o app só como teleprompter.');
        }
        return;
      }
      recBtn = h('button', { class: 'rec-btn', 'aria-label': 'Gravar vídeo', onclick: toggleRecording, html: '<span class="rec-dot"></span>' });
      topbar.querySelector('.p-top-right').appendChild(recBtn);
    }
    function removeRecordBtn() { if (recBtn) { recBtn.remove(); recBtn = null; } }
    var saveBtn = null;
    function showTopSaveBtn() {
      if (saveBtn || !state.lastRecordingBlob) return;
      saveBtn = h('button', { class: 'p-toggle on', text: '⤓ Salvar vídeo', onclick: shareRecording });
      topbar.querySelector('.p-top-right').appendChild(saveBtn);
    }
    function toggleRecording() { state.recording ? stopRecording() : startRecording(); }
    function startRecording() {
      var mime = recMime();
      if (!mime) return toast('Gravação não suportada neste navegador');
      // adiciona áudio do microfone só agora
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(function (aud) {
        var tracks = camStream.getVideoTracks().concat(aud.getAudioTracks());
        var mix = new MediaStream(tracks);
        try {
          state.recorder = new MediaRecorder(mix, { mimeType: mime });
        } catch (e) {
          aud.getTracks().forEach(function (t) { t.stop(); });
          state.recTried = true;
          return toast('Não foi possível iniciar a gravação neste navegador.');
        }
        state.chunks = [];
        state.recTried = true;
        state.recorder.ondataavailable = function (e) { if (e.data && e.data.size) state.chunks.push(e.data); };
        state.recorder.onerror = function () { toast('Erro na gravação.'); };
        state.recorder.onstop = function () {
          aud.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(state.chunks, { type: mime });
          if (blob.size < 2048) {
            state.lastRecordingBlob = null;
            toast('A gravação saiu vazia — este navegador não suporta bem.');
          } else {
            state.lastRecordingBlob = blob;
            state.recMime = mime;
            showTopSaveBtn();
            toast('Gravação pronta. Toque em “Salvar vídeo”.');
          }
          if (state.finished) showSummary(); // reconstrói o resumo já com o botão
        };
        state.recorder.start(1000);
        state.recording = true;
        recBtn.classList.add('on');
      }).catch(function (e) { state.recTried = true; toast('Microfone negado: ' + (e && e.name || e)); });
    }
    function stopRecording() {
      if (state.recorder && state.recorder.state !== 'inactive') {
        try { state.recorder.stop(); } catch (e) {}
      }
      state.recording = false;
      if (recBtn) recBtn.classList.remove('on');
    }
    function shareRecording() {
      var blob = state.lastRecordingBlob;
      if (!blob) return;
      var file;
      try { file = new File([blob], recName(), { type: state.recMime || blob.type || 'video/mp4' }); }
      catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Vídeo' }).catch(function () {});
        return;
      }
      // fallback: abre o vídeo em nova aba para o usuário segurar e "Salvar em Fotos"
      var url = URL.createObjectURL(blob);
      var w = window.open();
      if (w) {
        w.document.title = recName();
        w.document.body.style.cssText = 'margin:0;background:#000';
        var v = w.document.createElement('video');
        v.src = url; v.controls = true; v.playsInline = true;
        v.style.cssText = 'width:100%;height:100%';
        w.document.body.appendChild(v);
      } else {
        toast('Permita pop-ups para abrir o vídeo, ou tente pelo Safari normal.');
      }
    }
    function recName() {
      var ext = (state.recMime && state.recMime.indexOf('mp4') >= 0) ? 'mp4' : 'webm';
      return 'teleprompter-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;
    }

    /* ---------------- voz ---------------- */
    function toggleVoice(on) {
      var want = on == null ? !state.voice : on;
      if (want && !SpeechFollow.supported()) { toast('Reconhecimento de voz indisponível aqui'); return; }
      state.voice = want;
      setToggle('voice', want);
      if (want) {
        state.speech = SpeechFollow.create({
          lang: S.voiceLang,
          onwords: onVoiceWords,
          onfail: function (msg) { toast(msg + ' Voltando ao modo velocidade.'); toggleVoice(false); }
        });
        if (!navigator.onLine) toast('Sem internet: o acompanhamento por voz pode não funcionar.');
        toast('Modo voz (experimental) ligado');
        if (state.running) state.speech.start();
      } else {
        if (state.speech) { state.speech.stop(); state.speech = null; }
        state.voiceTargetOffset = null;
      }
    }
    function onVoiceWords(tail) {
      // procura a melhor frase próxima da posição atual que "casa" com o final ouvido
      if (!tail.length) return;
      var idx = Math.max(0, currentAnchorIndex());
      var lo = Math.max(0, idx - 3), hi = Math.min(state.anchors.length - 1, idx + 25);
      var best = -1, bestScore = 1.5;
      for (var i = lo; i <= hi; i++) {
        var a = state.anchors[i];
        if (a.type !== 'sentence' || !a.tokens.length) continue;
        var score = matchScore(tail, a.tokens) + (i >= idx ? 0.3 : 0) - Math.abs(i - idx) * 0.02;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) {
        state.voiceTargetOffset = state.anchors[best].top - state.readingLineY;
        state.voiceTargetAt = performance.now();
      }
    }
    function matchScore(tail, tokens) {
      var set = {};
      tokens.forEach(function (t) { set[t] = true; });
      var hit = 0;
      tail.forEach(function (w) { if (set[w]) hit++; });
      return hit;
    }

    /* ---------------- controles: mostrar/ocultar ---------------- */
    function showControls() {
      scr.classList.remove('hide-ui');
      scheduleHide();
    }
    function hideControls() {
      if (!state.running) return;
      scr.classList.add('hide-ui');
    }
    function scheduleHide() {
      clearTimeout(hideTimer);
      if (S.hideControlsAfter > 0)
        hideTimer = setTimeout(hideControls, S.hideControlsAfter * 1000);
    }
    function bumpInteraction() { showControls(); }

    /* ---------------- gestos ---------------- */
    var tapTimer = null, lastTap = 0;
    var pt = { x: 0, y: 0, t: 0, moved: false };
    stage.addEventListener('pointerdown', function (e) {
      pt.x = e.clientX; pt.y = e.clientY; pt.t = performance.now(); pt.moved = false;
    });
    stage.addEventListener('pointermove', function (e) {
      if (Math.abs(e.clientX - pt.x) > 10 || Math.abs(e.clientY - pt.y) > 10) pt.moved = true;
    });
    stage.addEventListener('pointerup', function (e) {
      var dx = e.clientX - pt.x, dy = e.clientY - pt.y, dt = performance.now() - pt.t;
      if (dt < 550 && Math.max(Math.abs(dx), Math.abs(dy)) > 55) {
        // swipe
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) seekSentence(-1); else seekSentence(1); // esquerda = voltar, direita = avançar
        } else {
          if (dy < 0) setSpeed(state.speed + 0.05); else setSpeed(state.speed - 0.05);
        }
        return;
      }
      if (pt.moved) return;
      // tap vs double-tap
      var nowT = performance.now();
      if (nowT - lastTap < 300) {
        clearTimeout(tapTimer);
        lastTap = 0;
        togglePlay();
      } else {
        lastTap = nowT;
        tapTimer = setTimeout(function () {
          if (scr.classList.contains('hide-ui')) showControls();
          else if (state.running) hideControls();
          else showControls();
        }, 260);
      }
    });

    /* ---------------- wake lock / fullscreen ---------------- */
    function keepAwake() {
      if (!S.keepAwake || !('wakeLock' in navigator)) return;
      if (wakeLock && !wakeLock.released) return;
      navigator.wakeLock.request('screen').then(function (w) {
        wakeLock = w;
        w.addEventListener('release', function () {});
      }).catch(function () {});
    }
    function onVisible() {
      if (document.visibilityState === 'visible') { keepAwake(); }
    }
    function tryFullscreen() {
      var isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
      var iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (!isStandalone && iOS) {
        toast('Dica: instale o app (Compartilhar → Adicionar à Tela de Início) para tela cheia real.');
      } else if (!isStandalone && scr.requestFullscreen) {
        // precisa de gesto; tentaremos no primeiro toque
        stage.addEventListener('pointerdown', function once() {
          scr.requestFullscreen && scr.requestFullscreen().catch(function () {});
          stage.removeEventListener('pointerdown', once);
        }, { once: true });
      }
    }

    /* ---------------- sair ---------------- */
    function exit() {
      App.navigate('/');
    }

    /* ---------------- helpers de UI ---------------- */
    function toggleBtn(label, key, initial, fn) {
      var b = h('button', { class: 'p-toggle', dataset: { k: key }, text: label, onclick: function () { fn(); } });
      if (initial) b.classList.add('on');
      return b;
    }
    function setToggle(key, on) {
      var b = topbar.querySelector('.p-toggle[data-k="' + key + '"]');
      if (b) b.classList.toggle('on', !!on);
    }
    function navBtn(label, title, fn, cls) {
      return h('button', {
        class: 'nav-btn ' + (cls || ''), title: title, 'aria-label': title,
        onclick: function () { fn(); bumpInteraction(); }
      }, [
        label === '¶' ? h('span', { class: 'nb-para', text: '¶' })
          : h('span', { class: 'nb-label', text: label }),
        h('span', { class: 'nb-dir' })
      ]);
    }

    function applyVars() {
      scr.style.setProperty('--pt-font', S.fontSize + 'px');
      scr.style.setProperty('--pt-weight', S.fontWeight);
      scr.style.setProperty('--pt-lh', S.lineHeight);
      scr.style.setProperty('--pt-width', S.textWidth + '%');
      scr.style.setProperty('--pt-align', S.align);
    }

    /* ---------------- destroy ---------------- */
    return {
      destroy: function () {
        cancelAnimationFrame(rafId);
        clearTimeout(hideTimer);
        clearInterval(pauseTimer);
        if (state.speech) state.speech.stop();
        stopCam();
        if (wakeLock) { try { wakeLock.release(); } catch (e) {} }
        if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen().catch(function () {});
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }

  /* ============ util ============ */
  function tokenize(s) {
    return (stripAccents(String(s).toLowerCase()).match(/[a-z0-9]+/g) || []);
  }
  function clampNum(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmtX(v) { return (Math.round(v * 100) / 100).toFixed(2).replace(/0$/, '').replace(/\.$/, '') + '×'; }

  function iconPlay() { return '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; }
  function iconPause() { return '<svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'; }
  function iconRestart() { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/></svg>'; }

  global.Prompter = {
    registerRoutes: function (route) {
      route('/prompter/:id', viewPrompter);
    }
  };
})(window);
