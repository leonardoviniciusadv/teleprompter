/* =====================================================================
   store.js — Armazenamento local (roteiros + preferências)
   - Roteiros: IndexedDB (com fallback automático para localStorage)
   - Preferências: localStorage
   Nada é enviado para servidores. Tudo fica no aparelho.
   ===================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'teleprompter';
  var STORE = 'scripts';
  var LS_SCRIPTS = 'tp:scripts';       // fallback
  var LS_SETTINGS = 'tp:settings';
  var LS_DRAFT = 'tp:draft:';          // backup anti-perda por roteiro

  /* ---------- util ---------- */
  function uid() {
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function now() { return Date.now(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- IndexedDB ---------- */
  var idbPromise = null;
  var idbOK = ('indexedDB' in global);

  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { return reject(e); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
      // Safari às vezes trava sem disparar evento
      setTimeout(function () { reject(new Error('IDB timeout')); }, 2500);
    });
    return idbPromise;
  }

  function idbAll() {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }
  function idbPut(rec) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = function () { resolve(rec); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function idbDel(id) {
    return openIDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE)['delete'](id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* ---------- localStorage fallback ---------- */
  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_SCRIPTS) || '[]'); }
    catch (e) { return []; }
  }
  function lsWrite(list) {
    localStorage.setItem(LS_SCRIPTS, JSON.stringify(list));
  }

  var useFallback = !idbOK;

  // Testa o IDB uma vez; se falhar, cai para localStorage para sempre nesta sessão.
  var ready = (idbOK ? idbAll().then(function () { return true; })
    .catch(function () { useFallback = true; return true; })
    : Promise.resolve(true));

  /* ---------- API pública de roteiros ---------- */
  function list() {
    return ready.then(function () {
      var p = useFallback ? Promise.resolve(lsAll()) : idbAll();
      return p.then(function (arr) {
        arr.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
        return arr;
      });
    });
  }

  function get(id) {
    return list().then(function (arr) {
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      return null;
    });
  }

  function create(data) {
    data = data || {};
    var rec = {
      id: uid(),
      title: (data.title || '').trim() || 'Sem título',
      body: data.body || '',
      wpm: data.wpm || null,
      createdAt: now(),
      updatedAt: now()
    };
    return save(rec);
  }

  function save(rec) {
    rec = clone(rec);
    rec.updatedAt = now();
    if (!rec.id) rec.id = uid();
    return ready.then(function () {
      if (useFallback) {
        var arr = lsAll();
        var found = false;
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
        }
        if (!found) arr.push(rec);
        lsWrite(arr);
        return rec;
      }
      return idbPut(rec).catch(function () {
        // se o IDB falhar em runtime, migra para fallback
        useFallback = true;
        var arr = lsAll(); arr.push(rec); lsWrite(arr);
        return rec;
      });
    });
  }

  function remove(id) {
    return ready.then(function () {
      if (useFallback) {
        lsWrite(lsAll().filter(function (r) { return r.id !== id; }));
        return;
      }
      return idbDel(id);
    });
  }

  function duplicate(id) {
    return get(id).then(function (r) {
      if (!r) return null;
      var copy = clone(r);
      delete copy.id;
      copy.title = r.title + ' (cópia)';
      copy.createdAt = now();
      return save(copy);
    });
  }

  /* ---------- Backup anti-perda (rascunho vivo do editor) ---------- */
  function saveDraft(id, obj) {
    try { localStorage.setItem(LS_DRAFT + (id || 'new'), JSON.stringify(obj)); } catch (e) {}
  }
  function getDraft(id) {
    try { return JSON.parse(localStorage.getItem(LS_DRAFT + (id || 'new')) || 'null'); }
    catch (e) { return null; }
  }
  function clearDraft(id) {
    try { localStorage.removeItem(LS_DRAFT + (id || 'new')); } catch (e) {}
  }

  /* ---------- Exportar / Importar (backup manual do usuário) ---------- */
  function exportAll() {
    return list().then(function (arr) {
      return JSON.stringify({ app: 'teleprompter', version: 1, exportedAt: now(), scripts: arr }, null, 2);
    });
  }
  function importAll(json) {
    var data;
    try { data = JSON.parse(json); } catch (e) { return Promise.reject(new Error('Arquivo inválido')); }
    var scripts = (data && data.scripts) || [];
    var chain = Promise.resolve();
    scripts.forEach(function (s) {
      chain = chain.then(function () {
        var rec = clone(s);
        delete rec.id; // gera novo id para não sobrescrever
        return save(rec);
      });
    });
    return chain.then(function () { return scripts.length; });
  }

  /* ---------- Preferências ---------- */
  var DEFAULTS = {
    theme: 'dark',            // dark | light
    wpm: 150,                 // palavras por minuto (fala)
    speed: 1.0,               // multiplicador padrão do teleprompter
    fontSize: 46,             // px
    fontWeight: 600,          // 400..800
    lineHeight: 1.5,
    textWidth: 92,            // % da largura útil
    readingZone: 0.34,        // posição vertical da zona de leitura (0.12..0.6)
    align: 'left',            // left | center
    mirror: false,            // modo espelho (inverte horizontal)
    scalePauses: false,       // escalar a duração das pausas pela velocidade
    voiceFollow: false,       // acompanhamento por voz (experimental)
    voiceLang: 'pt-BR',
    hideControlsAfter: 3,     // segundos
    keepAwake: true,          // wake lock
    countIn: 3               // contagem regressiva antes de iniciar (0 = desliga)
  };

  function getSettings() {
    var s;
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}'); }
    catch (e) { s = {}; }
    var out = clone(DEFAULTS);
    for (var k in s) if (s.hasOwnProperty(k)) out[k] = s[k];
    return out;
  }
  function setSettings(patch) {
    var s = getSettings();
    for (var k in patch) if (patch.hasOwnProperty(k)) s[k] = patch[k];
    localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
    return s;
  }
  function resetSettings() {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(DEFAULTS));
    return clone(DEFAULTS);
  }

  function storageMode() { return useFallback ? 'localStorage' : 'IndexedDB'; }

  global.Store = {
    ready: ready,
    list: list, get: get, create: create, save: save, remove: remove, duplicate: duplicate,
    saveDraft: saveDraft, getDraft: getDraft, clearDraft: clearDraft,
    exportAll: exportAll, importAll: importAll,
    getSettings: getSettings, setSettings: setSettings, resetSettings: resetSettings,
    DEFAULTS: DEFAULTS, storageMode: storageMode, uid: uid
  };
})(window);
