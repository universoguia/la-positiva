/* ==========================================================================
   La Positiva - utilidades compartidas
   Sin dependencias. Se carga con "defer" en todas las vistas.
   ========================================================================== */
(function (global) {
  'use strict';

  /* --- Supabase -----------------------------------------------------------
     La clave anon es publica por diseno: viaja al navegador en cualquier app
     de Supabase y esta protegida por RLS. Nunca poner aca la service_role.  */
  var SUPABASE_URL = 'https://abjonztvstyieukmrikx.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiam9uenR2c3R5aWV1a21yaWt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NzUyNDksImV4cCI6MjEwMzM1MTI0OX0.bGpeGAFtBvy_I-np7N8mBmK59Yk_t60UEboei7QZ4rY';

  var TABLE = 'la_positiva_pedidos';
  var PUSH_TABLE = 'la_positiva_push_subs';
  var IMG_BASE = 'https://la-positiva-phi.vercel.app/';

  function client() {
    if (!global.supabase || !global.supabase.createClient) return null;
    return global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      realtime: { params: { eventsPerSecond: 4 } }
    });
  }

  /* --- Escapado -----------------------------------------------------------
     Todo lo que venga de Supabase o de la URL pasa por aca antes de tocar
     innerHTML. Evita que un nombre de cliente con "<" rompa o inyecte.     */
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  }

  /* --- Formato ------------------------------------------------------------ */
  function money(n) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    return '$' + Math.round(v).toLocaleString('es-AR');
  }

  function timeAgo(ts) {
    var ms = Date.now() - new Date(ts).getTime();
    if (!isFinite(ms)) return '';
    var min = Math.max(0, Math.round(ms / 60000));
    if (min <= 0) return 'recien';
    if (min < 60) return 'hace ' + min + ' min';
    var h = Math.floor(min / 60);
    return 'hace ' + h + ' h ' + (min % 60) + ' min';
  }

  /* --- Mensajes de error legibles ----------------------------------------
     Nunca mostramos error.message crudo al usuario: se registra en consola
     para diagnostico y se muestra una frase entendible.                    */
  function humanError(err, fallback) {
    // warn y no error: son condiciones previstas y ya manejadas en pantalla,
    // no fallas del navegador. Deja rastro sin ensuciar la consola.
    if (err) { try { console.warn('[La Positiva]', err); } catch (e) {} }
    if (!navigator.onLine) {
      return 'Parece que te quedaste sin internet. Revisa la conexion y proba de nuevo.';
    }
    return fallback || 'No pudimos completar la accion. Proba de nuevo en un momento.';
  }

  /* --- Toasts con aria-live ---------------------------------------------- */
  var toastRegion = null;
  function ensureToastRegion() {
    if (toastRegion && document.body.contains(toastRegion)) return toastRegion;
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    toastRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(toastRegion);
    return toastRegion;
  }
  function toast(msg, kind, ms) {
    var region = ensureToastRegion();
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' is-' + kind : '');
    el.textContent = msg;
    region.appendChild(el);
    var t = setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, ms || 4200);
    el.addEventListener('click', function () {
      clearTimeout(t);
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    return el;
  }

  /* --- Dialogos accesibles ------------------------------------------------
     Foco inicial, foco contenido, Escape, devolucion del foco al disparador
     y bloqueo del scroll de fondo.                                         */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
    'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var dialogStack = [];

  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openDialog(el, opts) {
    opts = opts || {};
    if (!el || dialogStack.indexOf(el) !== -1) return;
    var entry = { el: el, opener: document.activeElement };
    dialogStack.push(entry);

    el.hidden = false;
    document.body.classList.add('sheet-open');

    var panel = el.querySelector('.sheet-panel') || el;
    var first = opts.focus ? el.querySelector(opts.focus) : null;
    if (!first) first = focusables(panel)[0] || panel;
    if (first === panel && !panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    try { first.focus({ preventScroll: true }); } catch (e) { try { first.focus(); } catch (e2) {} }

    entry.onKey = function (ev) {
      if (dialogStack[dialogStack.length - 1] !== entry) return;
      if (ev.key === 'Escape') {
        ev.preventDefault();
        closeDialog(el);
        return;
      }
      if (ev.key !== 'Tab') return;
      var list = focusables(panel);
      if (!list.length) { ev.preventDefault(); return; }
      var firstEl = list[0], lastEl = list[list.length - 1];
      if (ev.shiftKey && document.activeElement === firstEl) {
        ev.preventDefault(); lastEl.focus();
      } else if (!ev.shiftKey && document.activeElement === lastEl) {
        ev.preventDefault(); firstEl.focus();
      }
    };
    document.addEventListener('keydown', entry.onKey, true);

    // Click en el fondo cierra, salvo que se pida lo contrario.
    if (!opts.persistent) {
      entry.onClick = function (ev) { if (ev.target === el) closeDialog(el); };
      el.addEventListener('mousedown', entry.onClick);
    }
  }

  function closeDialog(el) {
    var idx = -1;
    for (var i = 0; i < dialogStack.length; i++) if (dialogStack[i].el === el) idx = i;
    if (idx === -1) return;
    var entry = dialogStack.splice(idx, 1)[0];

    el.hidden = true;
    if (entry.onKey) document.removeEventListener('keydown', entry.onKey, true);
    if (entry.onClick) el.removeEventListener('mousedown', entry.onClick);
    if (!dialogStack.length) document.body.classList.remove('sheet-open');

    var opener = entry.opener;
    if (opener && document.body.contains(opener)) {
      try { opener.focus({ preventScroll: true }); } catch (e) { try { opener.focus(); } catch (e2) {} }
    }
  }

  function isDialogOpen(el) {
    for (var i = 0; i < dialogStack.length; i++) if (dialogStack[i].el === el) return true;
    return false;
  }

  /* --- Estado de conexion -------------------------------------------------
     Refleja lo que realmente pasa: conectado / reconectando / sin conexion.
     Nunca decimos "En vivo" si Realtime esta caido.                        */
  function ConnBadge(el) {
    this.el = el;
    this.state = null;
    this.set('connecting');
  }
  ConnBadge.prototype.set = function (state) {
    if (this.state === state) return;
    this.state = state;
    var map = {
      live:       { cls: 'conn-live',  txt: 'En vivo' },
      connecting: { cls: 'conn-retry', txt: 'Conectando...' },
      retry:      { cls: 'conn-retry', txt: 'Reconectando...' },
      off:        { cls: 'conn-off',   txt: 'Sin conexion' }
    };
    var m = map[state] || map.off;
    this.el.className = 'conn ' + m.cls;
    // El punto de color nunca es el unico indicador: siempre va con texto.
    this.el.innerHTML = '<span class="dot" aria-hidden="true"></span><span>' + esc(m.txt) + '</span>';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
  };

  /* --- Limpieza al abandonar la pagina ------------------------------------ */
  var cleanups = [];
  function onCleanup(fn) { cleanups.push(fn); }
  function runCleanup() {
    while (cleanups.length) {
      var fn = cleanups.pop();
      try { fn(); } catch (e) {}
    }
  }
  global.addEventListener('pagehide', runCleanup);

  /* --- Registro del service worker ----------------------------------------
     Alcance en la raiz para que valga para todas las vistas.               */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(function (reg) {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        return reg;
      })
      .catch(function (e) { console.warn('[La Positiva] SW no registrado', e); return null; });
  }

  global.LP = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON: SUPABASE_ANON,
    TABLE: TABLE,
    PUSH_TABLE: PUSH_TABLE,
    IMG_BASE: IMG_BASE,
    client: client,
    esc: esc,
    money: money,
    timeAgo: timeAgo,
    humanError: humanError,
    toast: toast,
    openDialog: openDialog,
    closeDialog: closeDialog,
    isDialogOpen: isDialogOpen,
    ConnBadge: ConnBadge,
    onCleanup: onCleanup,
    registerSW: registerSW
  };
})(window);
