/* =====================================================================
   pip.js — Teleprompter em Picture‑in‑Picture
   Desenha o roteiro num <canvas>, transforma em vídeo e joga esse vídeo
   no modo Picture‑in‑Picture do iOS. Assim o texto fica FLUTUANDO por
   cima do app Câmera do iPhone enquanto você grava — sem precisar de um
   segundo aparelho e sem o texto entrar no vídeo.

   Limitações reais (iOS/Safari):
   - Precisa de iOS 16.4+ (API requestPictureInPicture no iPhone).
   - O canvas vira vídeo via canvas.captureStream (iOS 15.4+).
   - Enquanto a janelinha PiP está aberta, o Safari mantém o desenho
     rodando em segundo plano; se o iOS congelar mesmo assim, não há
     como um app web contornar — aí o caminho é gravar em 2 aparelhos.
   - Controles dentro do PiP: só play/pause (os botões da própria
     janelinha do iOS). Velocidade e "voltar frase" ficam indisponíveis
     — ajuste a velocidade ANTES de entrar no modo câmera.
   ===================================================================== */
(function (global) {
  'use strict';

  var FONT_STACK = '-apple-system, system-ui, "SF Pro Text", Segoe UI, Roboto, sans-serif';

  function supported() {
    var v = document.createElement('video');
    var canvasOK = !!HTMLCanvasElement.prototype.captureStream;
    var pipOK = !!(v.requestPictureInPicture ||
      (typeof v.webkitSetPresentationMode === 'function'));
    return canvasOK && pipOK;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function words(s) { return (global.Parse ? Parse.countWords(s) : (s.trim().split(/\s+/).length)); }

  function create(opts) {
    var S = opts.settings || {};
    var speed = opts.speed || 1;
    var segs = opts.segs || [];

    var CW = 720, CH = 1280;                 // vídeo retrato 9:16
    var canvas = document.createElement('canvas');
    canvas.width = CW; canvas.height = CH;
    var ctx = canvas.getContext('2d');

    var pad = Math.round(CW * 0.055);
    var fontPx = Math.round(CW * (S.fontSize ? clamp(S.fontSize / 46, 0.7, 1.5) : 1) * 0.075);
    var weight = S.fontWeight || 600;
    var lh = Math.round(fontPx * (S.lineHeight || 1.5));
    var tokPx = Math.round(fontPx * 0.52);
    var readY = Math.round(CH * clamp(S.readingZone || 0.34, 0.12, 0.6));
    var mirror = !!S.mirror;
    var centered = S.align === 'center';
    var scalePauses = !!S.scalePauses;
    var wpm = S.wpm || 150;

    ctx.textBaseline = 'alphabetic';

    /* ---------- layout: quebra o texto em linhas ---------- */
    function setTextFont() { ctx.font = weight + ' ' + fontPx + 'px ' + FONT_STACK; }
    function wrap(text) {
      setTextFont();
      var maxW = CW - pad * 2;
      var out = [], line = '';
      text.split(/\s+/).forEach(function (w) {
        if (!w) return;
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; }
        else line = t;
      });
      if (line) out.push(line);
      return out.length ? out : [''];
    }

    var lines = [];          // { kind:'text'|'tok', text, ms?, y, h }
    var totalWords = 0;
    segs.forEach(function (s) {
      if (s.type === 'para') { lines.push({ kind: 'gap' }); return; }
      if (s.type === 'pause') { lines.push({ kind: 'tok', text: '⏸ ' + s.label.replace(/^Pausa /, ''), ms: s.ms, cls: 'pause' }); return; }
      if (s.type === 'cue') { lines.push({ kind: 'tok', text: (s.icon || '▹') + ' ' + s.label, cls: 'cue' }); return; }
      if (s.type === 'sentence') {
        var text = s.runs.map(function (r) { return r.text; }).join('');
        totalWords += (s.words || words(text));
        wrap(text).forEach(function (w) { lines.push({ kind: 'text', text: w }); });
      }
    });

    var y = 0;
    lines.forEach(function (L) {
      if (L.kind === 'gap') { y += Math.round(lh * 0.55); L.y = y; return; }
      L.y = y;
      y += (L.kind === 'tok') ? Math.round(lh * 0.8) : lh;
    });
    var contentH = y;

    var firstY = 0;
    for (var i = 0; i < lines.length; i++) { if (lines[i].kind !== 'gap') { firstY = lines[i].y; break; } }
    var lastY = lines.length ? lines[lines.length - 1].y : 0;

    var scroll = firstY;                       // 1ª linha na linha de leitura
    var endScroll = lastY + Math.round(lh * 0.4);
    // velocidade em px/s p/ que o roteiro inteiro leve ~ (palavras / ppm)
    var readSpan = Math.max(1, lastY - firstY);
    var pxPerSec = (readSpan / Math.max(1, totalWords)) * (wpm / 60) * speed;

    /* ---------- clock ---------- */
    var running = true, done = false, holdMs = 0, lastT = 0, raf = null, iv = null;

    function step(now) {
      if (!lastT) lastT = now;
      var dt = Math.min(120, now - lastT);
      lastT = now;
      if (running && !done) {
        if (holdMs > 0) {
          holdMs -= dt;
        } else {
          scroll += pxPerSec * (dt / 1000);
          for (var k = 0; k < lines.length; k++) {
            var L = lines[k];
            if (L.kind === 'tok' && L.ms && !L.consumed && scroll >= L.y) {
              L.consumed = true;
              holdMs = L.ms / (scalePauses ? speed : 1);
              break;
            }
          }
          if (scroll >= endScroll) { scroll = endScroll; done = true; opts.onEnd && opts.onEnd(); }
        }
      }
      draw();
    }
    function loop(now) { raf = requestAnimationFrame(loop); step(now || performance.now()); }

    /* ---------- desenho ---------- */
    function draw() {
      ctx.save();
      ctx.fillStyle = S.theme === 'light' ? '#f3f1ec' : '#000';
      ctx.fillRect(0, 0, CW, CH);

      if (mirror) { ctx.translate(CW, 0); ctx.scale(-1, 1); }

      ctx.textAlign = centered ? 'center' : 'left';
      var x = centered ? CW / 2 : pad;

      for (var k = 0; k < lines.length; k++) {
        var L = lines[k];
        if (L.kind === 'gap') continue;
        var sy = L.y - scroll + readY;
        if (sy < -lh || sy > CH + lh) continue;

        var dist = Math.abs(sy - readY);
        var op = clamp(1.15 - dist / (CH * 0.42), 0.12, 1);

        if (L.kind === 'tok') {
          setTok();
          ctx.globalAlpha = Math.min(op + 0.15, 0.9);
          ctx.fillStyle = L.cls === 'pause'
            ? (S.theme === 'light' ? '#0a6ea8' : '#7fd4ff')
            : (S.theme === 'light' ? '#9a6a00' : '#ffd479');
          ctx.fillText(L.text.toUpperCase(), x, sy);
        } else {
          setTextFont();
          ctx.globalAlpha = op;
          ctx.fillStyle = S.theme === 'light' ? '#14140f' : '#fff';
          ctx.fillText(L.text, x, sy);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // linha de leitura
      ctx.save();
      ctx.strokeStyle = S.theme === 'light' ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, readY + 2); ctx.lineTo(CW, readY + 2); ctx.stroke();
      ctx.fillStyle = S.theme === 'light' ? 'rgba(0,0,0,.4)' : 'rgba(255,255,255,.4)';
      tri(10, readY, 14, 1); tri(CW - 10, readY, 14, -1);
      ctx.restore();

      // estado (pausa / fim) no rodapé
      if (holdMs > 0 || done) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '700 ' + Math.round(fontPx * 0.6) + 'px ' + FONT_STACK;
        ctx.fillStyle = done ? (S.theme === 'light' ? '#14140f' : '#fff') : '#7fd4ff';
        ctx.fillText(done ? 'fim do roteiro' : (Math.ceil(holdMs / 100) / 10).toFixed(1).replace('.', ',') + 's',
          CW / 2, CH - Math.round(fontPx));
        ctx.restore();
      }
    }
    function setTok() { ctx.font = '700 ' + tokPx + 'px ' + FONT_STACK; }
    function tri(px, py, s, dir) {
      ctx.beginPath();
      ctx.moveTo(px, py + 2);
      ctx.lineTo(px + dir * s, py + 2 - s / 1.6);
      ctx.lineTo(px + dir * s, py + 2 + s / 1.6);
      ctx.closePath(); ctx.fill();
    }

    /* ---------- vídeo + PiP ---------- */
    var vid = document.createElement('video');
    vid.muted = true; vid.playsInline = true;
    vid.setAttribute('playsinline', ''); vid.setAttribute('webkit-playsinline', '');
    vid.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;bottom:0';

    // Manter o desenho vivo com o Safari em 2º plano: o iOS só continua
    // executando timers de uma página em background enquanto ela está
    // REPRODUZINDO áudio. Usamos um <audio> em loop, quase inaudível, além
    // de um AudioContext (que precisa de resume() dentro do gesto).
    var silence = null, keepAudio = null;
    function silentWav(seconds) {
      var sr = 8000, n = Math.floor(sr * seconds), total = 44 + n * 2;
      var buf = new ArrayBuffer(total), v = new DataView(buf);
      function s(o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); }
      s(0, 'RIFF'); v.setUint32(4, total - 8, true); s(8, 'WAVE'); s(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
      v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true);
      v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * 2, true);
      // 1 amostra baixíssima a cada ~200ms só para não ser "silêncio absoluto"
      for (var i = 0; i < n; i += sr / 5) v.setInt16(44 + i * 2, 8, true);
      var u8 = new Uint8Array(buf), bin = '';
      for (var j = 0; j < u8.length; j++) bin += String.fromCharCode(u8[j]);
      return 'data:audio/wav;base64,' + btoa(bin);
    }
    function keepAlive() {
      try {
        keepAudio = new Audio(silentWav(1));
        keepAudio.loop = true;
        keepAudio.volume = 0.02;
        keepAudio.setAttribute('playsinline', '');
      } catch (e) {}
      try {
        var Ac = global.AudioContext || global.webkitAudioContext;
        if (Ac) {
          var ac = new Ac();
          var osc = ac.createOscillator();
          var g = ac.createGain();
          g.gain.value = 0.0002;
          osc.connect(g); g.connect(ac.destination);
          osc.start();
          silence = { ac: ac, osc: osc };
        }
      } catch (e) {}
    }
    // roda DENTRO do gesto (enterPiP): destrava o áudio
    function armKeepAlive() {
      if (keepAudio) { keepAudio.play().catch(function () {}); }
      if (silence && silence.ac && silence.ac.state === 'suspended') { silence.ac.resume().catch(function () {}); }
    }

    // Prepara canvas → stream → vídeo tocando. NÃO precisa de gesto do usuário.
    // Deve rodar ANTES de o usuário tocar em "Ativar", para que a chamada de
    // Picture‑in‑Picture aconteça dentro do gesto (o iOS exige isso).
    var prepared = false;
    function prepare() {
      if (prepared) return Promise.resolve();
      prepared = true;
      document.body.appendChild(vid);
      draw();
      var stream = canvas.captureStream(30);
      vid.srcObject = stream;
      keepAlive();
      loop();
      iv = setInterval(function () { step(performance.now()); }, 250); // rede de segurança
      var p = vid.play().catch(function () {});
      return Promise.resolve(p).then(function () {
        if (vid.readyState >= 1) return;
        return new Promise(function (res) {
          vid.addEventListener('loadedmetadata', res, { once: true });
          setTimeout(res, 1500);
        });
      });
    }

    // Chamar DENTRO do handler do toque do usuário.
    function enterPiP() {
      armKeepAlive();
      var call;
      if (vid.requestPictureInPicture) call = vid.requestPictureInPicture();
      else if (vid.webkitSetPresentationMode) { vid.webkitSetPresentationMode('picture-in-picture'); call = Promise.resolve(); }
      else call = Promise.reject(new Error('PiP indisponível'));
      return Promise.resolve(call).then(function () {
        vid.addEventListener('leavepictureinpicture', onLeave, { once: true });
        vid.addEventListener('webkitpresentationmodechanged', onModeChange);
        vid.addEventListener('pause', onPause);
        vid.addEventListener('play', onPlay);
      });
    }

    // compat: start() = prepare()+enterPiP() (fora do iOS costuma funcionar)
    function start() { return prepare().then(enterPiP); }
    function onModeChange() {
      if (vid.webkitPresentationMode && vid.webkitPresentationMode !== 'picture-in-picture') onLeave();
    }
    function onPause() { running = false; }
    function onPlay() { running = true; lastT = 0; }
    function onLeave() { stop(); opts.onExit && opts.onExit(); }

    function stop() {
      cancelAnimationFrame(raf);
      clearInterval(iv);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('webkitpresentationmodechanged', onModeChange);
      try {
        if (document.pictureInPictureElement === vid && document.exitPictureInPicture) document.exitPictureInPicture();
        if (vid.webkitSetPresentationMode) vid.webkitSetPresentationMode('inline');
      } catch (e) {}
      try { (vid.srcObject ? vid.srcObject.getTracks() : []).forEach(function (t) { t.stop(); }); } catch (e) {}
      vid.srcObject = null;
      if (vid.parentNode) vid.parentNode.removeChild(vid);
      if (silence) { try { silence.osc.stop(); silence.ac.close(); } catch (e) {} silence = null; }
      if (keepAudio) { try { keepAudio.pause(); keepAudio.src = ''; } catch (e) {} keepAudio = null; }
    }

    return {
      prepare: prepare,
      enterPiP: enterPiP,
      start: start,
      stop: stop,
      setSpeed: function (v) {
        speed = v || 1;
        pxPerSec = (readSpan / Math.max(1, totalWords)) * (wpm / 60) * speed;
      },
      pause: function () { running = false; },
      resume: function () { running = false; lastT = 0; running = true; },
      restart: function () {
        scroll = firstY; done = false; holdMs = 0; lastT = 0;
        lines.forEach(function (L) { L.consumed = false; });
      },
      isDone: function () { return done; }
    };
  }

  global.PiPPrompter = { supported: supported, create: create };
})(window);
