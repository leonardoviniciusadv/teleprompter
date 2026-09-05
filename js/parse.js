/* =====================================================================
   parse.js — Interpretação do roteiro
   Converte o texto cru em uma lista de segmentos:
     { type:'sentence', runs:[{text,b,i,hl}], words:Number, text:String }
     { type:'pause', ms:Number, label:String }
     { type:'cue', label:String, kind:String }   // marcação de interpretação
     { type:'para' }                              // quebra de parágrafo
   Também calcula contagem de palavras e duração estimada.
   ===================================================================== */
(function (global) {
  'use strict';

  // Marcações de interpretação reconhecidas -> ícone/rótulo amigável
  var CUES = {
    'SORRIR': { icon: '🙂', label: 'Sorrir' },
    'ENFASE': { icon: '‼️', label: 'Ênfase' },
    'OLHAR PARA A CAMERA': { icon: '🎯', label: 'Olhar para a câmera' },
    'OLHAR PRA CAMERA': { icon: '🎯', label: 'Olhar para a câmera' },
    'RESPIRAR': { icon: '🌬️', label: 'Respirar' },
    'MAIS DEVAGAR': { icon: '🐢', label: 'Mais devagar' },
    'MAIS RAPIDO': { icon: '⚡', label: 'Mais rápido' },
    'TOM DE PERGUNTA': { icon: '❓', label: 'Tom de pergunta' },
    'PAUSA': { icon: '⏸', label: 'Pausa' }
  };

  function stripAccents(s) {
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }
  function normKey(s) {
    return stripAccents(String(s || '')).toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // Interpreta o conteúdo de um [colchete]. Retorna segmento pause/cue.
  function parseBracket(inner) {
    var raw = inner.trim();
    var key = normKey(raw);

    // PAUSA com duração: "PAUSA 1s", "PAUSA 1,5s", "PAUSA 500ms", "PAUSA 0.5"
    var m = key.match(/^PAUSA(?:\s+(.+))?$/);
    if (m) {
      var ms = 1000; // padrão
      if (m[1]) {
        var d = m[1].replace(',', '.').trim();
        var mm;
        if ((mm = d.match(/^([\d.]+)\s*MS$/))) ms = Math.round(parseFloat(mm[1]));
        else if ((mm = d.match(/^([\d.]+)\s*S?$/))) ms = Math.round(parseFloat(mm[1]) * 1000);
      }
      if (!isFinite(ms) || ms < 0) ms = 1000;
      var secs = ms / 1000;
      var lbl = secs >= 1 ? (Number.isInteger(secs) ? secs + 's' : secs.toString().replace('.', ',') + 's')
        : ms + 'ms';
      return { type: 'pause', ms: ms, label: 'Pausa ' + lbl };
    }

    // Caso contrário: marcação de interpretação
    var known = CUES[key];
    return {
      type: 'cue',
      kind: key,
      icon: known ? known.icon : '▹',
      label: known ? known.label : capitalize(raw)
    };
  }

  function capitalize(s) {
    s = s.toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Divide um trecho de texto puro em frases, mantendo a pontuação final.
  function splitSentences(text) {
    var out = [];
    var re = /[^.!?…]*[.!?…]+["'”’)\]]*\s*|[^.!?…]+$/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var chunk = m[0];
      if (!chunk) { if (re.lastIndex === m.index) re.lastIndex++; continue; }
      if (chunk.trim()) out.push(chunk.trim());
    }
    if (!out.length && text.trim()) out.push(text.trim());
    return out;
  }

  // Converte marcação inline (**negrito**, *itálico*, ==destaque==) em "runs".
  function parseInline(text) {
    var runs = [];
    var i = 0, n = text.length;
    var buf = '', b = false, it = false, hl = false;
    function flush() {
      if (buf) { runs.push({ text: buf, b: b, i: it, hl: hl }); buf = ''; }
    }
    while (i < n) {
      var two = text.substr(i, 2);
      if (two === '**') { flush(); b = !b; i += 2; continue; }
      if (two === '==') { flush(); hl = !hl; i += 2; continue; }
      var ch = text[i];
      if (ch === '*') { flush(); it = !it; i += 1; continue; }
      buf += ch; i += 1;
    }
    flush();
    // texto formado só por marcação (ex.: "**") não deve reaparecer cru
    if (!runs.length) runs.push({ text: '', b: false, i: false, hl: false });
    return runs;
  }

  function countWords(text) {
    var t = text.replace(/[*=]/g, ' ').trim();
    if (!t) return 0;
    var mm = t.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
    return mm ? mm.length : 0;
  }

  // ---- Parser principal ----
  function parse(raw) {
    raw = String(raw || '').replace(/\r\n/g, '\n');
    var paras = raw.split(/\n{2,}/);
    var segs = [];
    var totalWords = 0;
    var totalPauseMs = 0;

    paras.forEach(function (para, pIdx) {
      // trata quebras simples de linha como espaço (fluxo contínuo dentro do parágrafo)
      var text = para.replace(/\n+/g, ' ').trim();
      if (text) {
        var re = /\[([^\[\]]+)\]/g;
        var last = 0, m;
        while ((m = re.exec(text)) !== null) {
          var before = text.slice(last, m.index);
          pushText(before);
          var seg = parseBracket(m[1]);
          if (seg.type === 'pause') totalPauseMs += seg.ms;
          segs.push(seg);
          last = re.lastIndex;
        }
        pushText(text.slice(last));
      }
      if (pIdx < paras.length - 1) segs.push({ type: 'para' });
    });

    function pushText(chunk) {
      if (!chunk || !chunk.trim()) return;
      splitSentences(chunk).forEach(function (s) {
        var runs = parseInline(s);
        var visible = runs.map(function (r) { return r.text; }).join('').trim();
        if (!visible) return; // frase sem conteúdo falado (só marcação/espaço)
        var w = countWords(s);
        totalWords += w;
        segs.push({ type: 'sentence', runs: runs, words: w, text: s.replace(/[*=]/g, '') });
      });
    }

    // limpa "para" duplicados/nas pontas
    segs = segs.filter(function (s, idx) {
      if (s.type !== 'para') return true;
      var prev = segs[idx - 1], next = segs[idx + 1];
      if (!prev || !next) return false;
      if (prev.type === 'para') return false;
      return true;
    });

    return { segs: segs, words: totalWords, pauseMs: totalPauseMs };
  }

  // ---- Estimativa de duração ----
  function estimate(raw, wpm) {
    wpm = wpm || 150;
    var p = parse(raw);
    var speakSec = p.words / wpm * 60;
    var totalSec = speakSec + p.pauseMs / 1000;
    return {
      words: p.words,
      pauseMs: p.pauseMs,
      speakSec: speakSec,
      totalSec: totalSec,
      parsed: p
    };
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60); m = m % 60;
      return h + 'h' + pad(m) + 'min';
    }
    if (m === 0) return s + 's';
    return m + 'min' + pad(s) + 's';
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return pad(m) + ':' + pad(s);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  global.Parse = {
    parse: parse,
    estimate: estimate,
    parseInline: parseInline,
    countWords: countWords,
    fmtDuration: fmtDuration,
    fmtClock: fmtClock,
    CUES: CUES,
    normKey: normKey
  };
})(window);
