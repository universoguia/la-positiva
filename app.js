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
  var COBROS_TABLE = 'la_positiva_cobros';
  var BUCKET = 'la-positiva';
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

  /* --- Web Push -----------------------------------------------------------
     La clave publica VAPID es publica por definicion: identifica al emisor
     y viaja al navegador. La privada vive solo en la Edge Function.      */
  var VAPID_PUBLIC = 'BJI6zNTZGccfBNfA0U0-difiHHYW1rNPU-YVhThhX2g3K51nHdcWCOdI8EiCtD8lgygfiKiU18zN8_GF-IMnSSI';

  function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function pushSoportado() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  function esIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function esInstalada() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  /* Devuelve el estado real, sin pedir permisos:
     no-soportado | ios-sin-instalar | denegado | activo | inactivo        */
  function estadoPush() {
    if (!pushSoportado()) return Promise.resolve('no-soportado');
    if (esIOS() && !esInstalada()) return Promise.resolve('ios-sin-instalar');
    if (Notification.permission === 'denied') return Promise.resolve('denegado');
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return 'inactivo';
      return reg.pushManager.getSubscription().then(function (sub) {
        return (sub && Notification.permission === 'granted') ? 'activo' : 'inactivo';
      });
    }).catch(function () { return 'inactivo'; });
  }

  /* La tabla no tiene UNIQUE sobre empleado, asi que un upsert por conflicto
     no es posible sin cambiar el esquema. Se deduplica por endpoint.      */
  function guardarSub(sb, empleado, sub) {
    if (!sb) return Promise.resolve(false);
    var json = sub.toJSON();
    var endpoint = json && json.endpoint;
    if (!endpoint) return Promise.resolve(false);

    return sb.from(PUSH_TABLE).select('id')
      .eq('empleado', empleado)
      .eq('subscription->>endpoint', endpoint)
      .limit(1)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        if (res.data && res.data.length) return true;   // ya estaba: no duplica
        return sb.from(PUSH_TABLE).insert({ empleado: empleado, subscription: json })
          .then(function (ins) {
            if (ins.error) { humanError(ins.error); return false; }
            return true;
          });
      }, function (e) { humanError(e); return false; });
  }

  /* Pide permiso y deja la suscripcion guardada.
     Resuelve con activo | denegado | sin-decidir | error | no-guardado.   */
  function suscribirPush(sb, empleado) {
    return registerSW().then(function (reg) {
      if (!reg) throw new Error('sw');
      return navigator.serviceWorker.ready.then(function () { return reg; });
    }).then(function (reg) {
      return Notification.requestPermission().then(function (perm) {
        if (perm === 'denied') return 'denegado';
        if (perm !== 'granted') return 'sin-decidir';
        return reg.pushManager.getSubscription().then(function (sub) {
          if (sub) return sub;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
          });
        }).then(function (sub) {
          return guardarSub(sb, empleado, sub).then(function (ok) {
            return ok ? 'activo' : 'no-guardado';
          });
        });
      });
    }).catch(function (e) { humanError(e); return 'error'; });
  }

  // Dispara el aviso sin bloquear al que lo llama: si falla, no rompe nada.
  function avisar(sb, empleado, title, body, pedidoId) {
    if (!sb) return Promise.resolve(false);
    return sb.functions.invoke('notify-empleado', {
      body: { empleado: empleado, title: title, body: body, pedidoId: pedidoId || null }
    }).then(function (res) {
      return !(res.error || (res.data && res.data.ok === false));
    }, function () { return false; });
  }

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

  /* --- QR de cobro ---------------------------------------------------------
     El QR de Mercado Pago es estatico: se carga una vez y sirve siempre.
     Por la interoperabilidad del BCRA lo lee cualquier billetera.          */

  // Las fotos de celular pesan 3-8 MB y el bucket admite 5. Se redimensiona
  // en el navegador antes de subir. 1400px y calidad 0.92 mantienen el QR
  // perfectamente escaneable y dejan el archivo en pocos cientos de KB.
  function prepararImagen(file) {
    return new Promise(function (resolve) {
      if (!/^image\//.test(file.type || '')) { resolve(file); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1400;
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { URL.revokeObjectURL(url); resolve(file); return; }
          if (w > max || h > max) {
            var r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);
          c.toBlob(function (blob) {
            URL.revokeObjectURL(url);
            // Si comprimir no ayudo, se manda el original.
            resolve(blob && blob.size < file.size ? blob : file);
          }, 'image/jpeg', 0.92);
        } catch (e) { URL.revokeObjectURL(url); resolve(file); }
      };
      // HEIC de iPhone y formatos que el canvas no sepa dibujar.
      img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  /* --- Decodificar el QR ---------------------------------------------------
     Usa BarcodeDetector, que es nativo del navegador: cero dependencias.
     Ojo con lo que devuelve. Un QR interoperable (EMVCo) NO es una URL:
     su contenido es un payload estructurado que solo sirve escaneandolo
     con una app de pagos. Solo los QR de "link de pago" traen una URL.  */
  function decodificarQR(file) {
    if (typeof BarcodeDetector !== 'undefined') {
      return createImageBitmap(file).then(function (bmp) {
        var det = new BarcodeDetector({ formats: ['qr_code'] });
        return det.detect(bmp).then(function (codes) {
          try { bmp.close(); } catch (e) {}
          var texto = codes && codes.length ? String(codes[0].rawValue || '') : null;
          if (texto) return { soportado: true, texto: texto, link: comoLink(texto) };
          return conJsQR(file);          // el nativo no lo vio: segundo intento
        });
      }).catch(function () { return conJsQR(file); });
    }
    // Chrome de escritorio y Firefox no traen BarcodeDetector.
    return conJsQR(file);
  }

  // jsQR se auto-aloja y se carga solo aca, la primera vez que hace falta.
  var jsqrCargando = null;
  function cargarJsQR() {
    if (typeof jsQR !== 'undefined') return Promise.resolve(true);
    if (jsqrCargando) return jsqrCargando;
    jsqrCargando = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'vendor/jsqr.js';
      s.onload = function () { resolve(typeof jsQR !== 'undefined'); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return jsqrCargando;
  }

  function conJsQR(file) {
    return cargarJsQR().then(function (listo) {
      if (!listo) return { soportado: false, texto: null, link: null };
      return pixeles(file).then(function (px) {
        if (!px) return { soportado: true, texto: null, link: null };
        var res = jsQR(px.data, px.width, px.height, { inversionAttempts: 'attemptBoth' });
        var texto = res && res.data ? String(res.data) : null;
        return { soportado: true, texto: texto, link: comoLink(texto) };
      });
    }).catch(function (e) {
      console.warn('[La Positiva] no se pudo leer el QR', e);
      return { soportado: true, texto: null, link: null };
    });
  }

  // Pasa la imagen a pixeles. Se limita el tamano para no trabar el celular,
  // pero sin bajar tanto como para perder los modulos del codigo.
  function pixeles(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1400;
          var w = img.naturalWidth, h = img.naturalHeight;
          if (w > max || h > max) {
            var r = Math.min(max / w, max / h);
            w = Math.round(w * r); h = Math.round(h * r);
          }
          var c = document.createElement('canvas');
          c.width = w; c.height = h;
          var ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, w, h);
          var d = ctx.getImageData(0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve({ data: d.data, width: w, height: h });
        } catch (e) { URL.revokeObjectURL(url); resolve(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  // Devuelve la URL solo si el contenido realmente lo es. Un payload EMVCo
  // arranca con "000201" y no se puede abrir en un navegador.
  function comoLink(texto) {
    if (!texto) return null;
    var t = texto.trim();
    if (!/^https?:\/\//i.test(t)) return null;
    try {
      var u = new URL(t);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
    } catch (e) { return null; }
  }

  function qrActivo(sb) {
    if (!sb) return Promise.resolve(null);
    return sb.from(COBROS_TABLE).select('*')
      .eq('activo', true).order('created_at', { ascending: false })
      .limit(1).maybeSingle()
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return res.data;
      }, function (e) { humanError(e); return null; });
  }

  function subirQR(sb, file, etiqueta, quien) {
    if (!sb) return Promise.reject(new Error('sin cliente'));
    // Se lee el archivo original, no el comprimido: mejor definicion.
    var lectura = decodificarQR(file);
    return prepararImagen(file).then(function (blob) {
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error('La imagen sigue pesando mas de 5 MB.');
      }
      var ext = (blob.type === 'image/jpeg') ? 'jpg'
              : (file.name || '').split('.').pop().toLowerCase().slice(0, 5) || 'jpg';
      var path = 'qr/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;

      return sb.storage.from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
        .then(function (up) {
          if (up.error) throw up.error;
          var pub = sb.storage.from(BUCKET).getPublicUrl(path);
          var url = pub && pub.data && pub.data.publicUrl;
          if (!url) throw new Error('sin URL publica');

          // Solo un QR activo por vez; el anterior queda de historial.
          return lectura.then(function (leido) {
            return sb.from(COBROS_TABLE).update({ activo: false }).eq('activo', true)
              .then(function () {
                return sb.from(COBROS_TABLE).insert({
                  etiqueta: (etiqueta || 'QR de cobro').slice(0, 60),
                  imagen_path: path,
                  imagen_url: url,
                  activo: true,
                  cargado_por: (quien || '').slice(0, 40) || null,
                  link_pago: leido.link,
                  qr_texto: leido.texto ? leido.texto.slice(0, 1200) : null
                }).select().single();
              })
              .then(function (ins) {
                if (ins.error) throw ins.error;
                // El resultado de la lectura viaja aparte para poder explicar
                // en pantalla por que no se obtuvo un link.
                ins.data.__lectura = leido;
                return ins.data;
              });
          });
        });
    });
  }

  // Guarda a mano el link del QR activo. Hace falta cuando el codigo es
  // EMVCo (no trae URL) o cuando el navegador no sabe decodificar.
  function guardarLink(sb, id, link) {
    if (!sb || !id) return Promise.reject(new Error('faltan datos'));
    var limpio = link ? comoLink(link) : null;
    if (link && link.trim() && !limpio) {
      return Promise.reject(new Error('Eso no parece un link. Tiene que empezar con https://'));
    }
    return sb.from(COBROS_TABLE)
      .update({ link_pago: limpio })
      .eq('id', id).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  global.LP = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON: SUPABASE_ANON,
    TABLE: TABLE,
    PUSH_TABLE: PUSH_TABLE,
    COBROS_TABLE: COBROS_TABLE,
    BUCKET: BUCKET,
    IMG_BASE: IMG_BASE,
    qrActivo: qrActivo,
    subirQR: subirQR,
    decodificarQR: decodificarQR,
    comoLink: comoLink,
    guardarLink: guardarLink,
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
    registerSW: registerSW,
    VAPID_PUBLIC: VAPID_PUBLIC,
    pushSoportado: pushSoportado,
    esIOS: esIOS,
    esInstalada: esInstalada,
    estadoPush: estadoPush,
    suscribirPush: suscribirPush,
    avisar: avisar
  };
})(window);
