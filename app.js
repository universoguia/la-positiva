/* ==========================================================================
   La Positiva - utilidades compartidas
   Sin dependencias. Se carga con "defer" en todas las vistas.
   ========================================================================== */
(function (global) {
  'use strict';

  /* --- Configuracion ------------------------------------------------------
     Todos los valores vienen de config.js, que se carga antes que este
     archivo. Aca no se escribe ninguna clave.                            */
  var CFG = global.LP_CONFIG;
  if (!CFG) {
    // Falla ruidosa y temprana: es un error de instalacion, no del usuario.
    throw new Error('Falta config.js: cargalo antes que app.js.');
  }

  var SUPABASE_URL = CFG.SUPABASE_URL;
  var SUPABASE_ANON = CFG.SUPABASE_ANON;

  var TABLE = CFG.TABLE;
  var PUSH_TABLE = CFG.PUSH_TABLE;
  var COBROS_TABLE = CFG.COBROS_TABLE;
  var WA_TABLE = CFG.WA_TABLE || 'la_positiva_whatsapp';
  var FOTOS_TABLE = CFG.FOTOS_TABLE || 'la_positiva_fotos';
  var AGOTADOS_TABLE = CFG.AGOTADOS_TABLE || 'la_positiva_agotados';
  var SESIONES_TABLE = CFG.SESIONES_TABLE || 'la_positiva_sesiones';
  var MESAS_TABLE = CFG.MESAS_TABLE || 'la_positiva_mesas';
  var AJUSTES_TABLE = CFG.AJUSTES_TABLE || 'la_positiva_ajustes';
  var PRECIOS_TABLE = CFG.PRECIOS_TABLE || 'la_positiva_precios';
  var NOTAS_TABLE = CFG.NOTAS_TABLE || 'la_positiva_notas';
  var PERSONAS_TABLE = CFG.PERSONAS_TABLE || 'la_positiva_personas';
  var PROPINAS_TABLE = CFG.PROPINAS_TABLE || 'la_positiva_propinas';
  var VOZ_TABLE = CFG.VOZ_TABLE || 'la_positiva_voz';
  /* La libreta del local: lo que hay que anotar para no olvidarse, con fecha
     de recordatorio OPCIONAL. Ojo de no confundirla con NOTAS_TABLE, que es
     otra cosa: esas son las notas de UN pedido ("sin sal"). Esta no cuelga de
     ningun pedido ni de ninguna mesa, es del local entero. */
  var LIBRETA_TABLE = CFG.LIBRETA_TABLE || 'la_positiva_libreta';
  var BUCKET = CFG.BUCKET;
  var IMG_BASE = CFG.IMG_BASE;

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

  /* Buscar sin que las tildes estorben: el que escribe rapido en el celular
     pone "limon" y tiene que encontrar "Limonata". Se saca el acento de los
     dos lados (lo tipeado y el plato) antes de comparar. */
  function sinTildes(t) {
    return String(t === null || t === undefined ? '' : t)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
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
    if (min <= 0) return 'recién';
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
      return 'Parece que te quedaste sin internet. Revisá la conexión y probá de nuevo.';
    }
    return fallback || 'No pudimos completar la acción. Probá de nuevo en un momento.';
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
      off:        { cls: 'conn-off',   txt: 'Sin conexi\u00f3n' }
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

  /* --- El aviso que suena (AJ-003) ----------------------------------------
     Esto ya existia, pero escrito DOS VECES a mano: una en cocina.html y otra
     en mozo.html. La caja se habia quedado sin nada -ni una linea de audio en
     todo el archivo-, asi que un pago pendiente entraba mudo y el reporte del
     duenio ("no suena, ni en caja ni en el celular") era literal de ese lado.

     Aca queda la version compartida. NO se toco la de cocina ni la de mozo:
     andan y estan probadas en servicio. Esta la usa la caja.

     Lo que hay que saber y no se promete de mas: el navegador NO deja sonar
     hasta que alguien toca la pantalla una vez. El AudioContext nace
     'suspended' y ahi se queda. Por eso hay un enganche al primer toque y un
     estado 'falta-toque' para poder DECIRLO en pantalla en vez de fingir que
     el sonido esta activo. En iPhone, ademas, con la pestania en segundo
     plano no suena nada: eso lo decide el sistema y no hay codigo que lo
     arregle.                                                              */
  function Sonador(opciones) {
    var o = opciones || {};
    this.notas = o.notas || [880, 1174.7];
    this.volumen = o.volumen || 0.3;
    this.alCambiar = o.alCambiar || function () {};
    this.ctx = null;
    this.encendido = true;
    this.clave = o.clave || 'lp_sonido';
    try { this.encendido = localStorage.getItem(this.clave) !== '0'; } catch (e) {}
  }

  /* Devuelve 'listo' | 'falta-toque' | 'no-soportado'. Nunca miente: se lee
     el estado de verdad del AudioContext, no el que nos gustaria. */
  Sonador.prototype.armar = function () {
    var self = this;
    if (!this.ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return 'no-soportado';
      try { this.ctx = new AC(); } catch (e) { return 'no-soportado'; }
      /* resume() es asincronico: leer .state en la linea de abajo devuelve
         'suspended' aunque el gesto haya servido. Se repinta cuando el
         estado cambia de verdad. */
      try { this.ctx.onstatechange = function () { self.alCambiar(); }; } catch (e) {}
    }
    if (this.ctx.state === 'suspended') {
      try {
        var pr = this.ctx.resume();
        if (pr && pr.then) pr.then(function () {
          if (self.ctx.state === 'running') self.alCambiar();
        }, function () {});
      } catch (e) {}
    }
    return this.ctx.state === 'running' ? 'listo' : 'falta-toque';
  };

  Sonador.prototype.estado = function () {
    return this.encendido ? this.armar() : 'apagado';
  };

  // true = sono de verdad. false = no sono, y el que llama tiene que caerse
  // a la capa de abajo (aviso del sistema) en vez de dar el aviso por dado.
  Sonador.prototype.sonar = function (fuerte) {
    if (!this.encendido) return false;
    if (this.armar() !== 'listo') return false;
    try {
      var ctx = this.ctx;
      var t0 = ctx.currentTime;
      var notas = fuerte ? this.notas.concat(this.notas) : this.notas;
      var vol = fuerte ? Math.min(0.45, this.volumen + 0.15) : this.volumen;
      notas.forEach(function (hz, i) {
        var t = t0 + i * 0.17;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = hz;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t); osc.stop(t + 0.32);
      });
      return true;
    } catch (e) { return false; }
  };

  Sonador.prototype.prender = function (v) {
    this.encendido = !!v;
    try { localStorage.setItem(this.clave, this.encendido ? '1' : '0'); } catch (e) {}
    if (this.encendido) this.armar();
    this.alCambiar();
  };

  /* Un toque en cualquier parte de la pantalla destraba el audio. Es el
     gesto que pide el navegador y nadie tiene que saber que existe. */
  Sonador.prototype.engancharPrimerToque = function () {
    var self = this;
    function destrabar() {
      var st = self.armar();
      if (st === 'listo' || st === 'no-soportado') {
        document.removeEventListener('pointerdown', destrabar, true);
        document.removeEventListener('keydown', destrabar, true);
      }
      self.alCambiar();
    }
    document.addEventListener('pointerdown', destrabar, true);
    document.addEventListener('keydown', destrabar, true);
  };

  /* --- Web Push -----------------------------------------------------------
     La clave publica VAPID es publica por definicion: identifica al emisor
     y viaja al navegador. La privada vive solo en la Edge Function.      */
  var VAPID_PUBLIC = CFG.VAPID_PUBLIC;

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

  /* Que aparato es este. Sin esto la tabla guardaba suscripciones anonimas y
     era imposible saber cual era el celular de quien, ni sacar el que sobraba.
     Se deduce del user agent: no pide permisos ni datos personales.       */
  function describirDispositivo() {
    var ua = navigator.userAgent || '';
    var plataforma = 'Dispositivo';

    if (/iPad/.test(ua)) plataforma = 'iPad';
    else if (/iPhone|iPod/.test(ua)) plataforma = 'iPhone';
    else if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) plataforma = 'iPad';
    else if (/Android/.test(ua)) plataforma = /Mobile/.test(ua) ? 'Android' : 'Tablet Android';
    else if (/Windows/.test(ua)) plataforma = 'PC con Windows';
    else if (/Macintosh|Mac OS X/.test(ua)) plataforma = 'Mac';
    else if (/Linux/.test(ua)) plataforma = 'PC con Linux';

    // El orden importa: casi todos dicen "Safari" y "Chrome" en el user agent.
    var nav = '';
    if (/EdgA?\//.test(ua)) nav = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) nav = 'Opera';
    else if (/Brave/.test(ua)) nav = 'Brave';
    else if (/Firefox\//.test(ua)) nav = 'Firefox';
    else if (/CriOS|Chrome\//.test(ua)) nav = 'Chrome';
    else if (/Safari\//.test(ua)) nav = 'Safari';

    var instalada = esInstalada();
    var nombre = plataforma + (nav ? ' - ' + nav : '') + (instalada ? ' (app instalada)' : '');

    return { plataforma: plataforma, nombre: nombre, ua: ua.slice(0, 400) };
  }

  /* Compara la clave con la que se creo la suscripcion contra la vigente.
     Si el navegador no expone options.applicationServerKey damos por buena
     la que hay: no podemos afirmar que este vencida.                      */
  function claveVigente(sub) {
    try {
      var actual = sub.options && sub.options.applicationServerKey;
      if (!actual) return true;
      var a = new Uint8Array(actual);
      var b = urlBase64ToUint8Array(VAPID_PUBLIC);
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    } catch (e) { return true; }
  }

  // Saca de la base un endpoint que ya no sirve, para no dejar destinos muertos.
  function olvidarSub(sb, endpoint) {
    if (!sb || !endpoint) return Promise.resolve(false);
    return sb.from(PUSH_TABLE).delete()
      .eq('subscription->>endpoint', endpoint)
      .then(function () { return true; }, function () { return false; });
  }

  /* La tabla no tiene UNIQUE sobre empleado, asi que un upsert por conflicto
     no es posible sin cambiar el esquema. Se deduplica por endpoint.      */
  function guardarSub(sb, empleado, sub) {
    if (!sb) return Promise.resolve(false);
    var json = sub.toJSON();
    var endpoint = json && json.endpoint;
    if (!endpoint) return Promise.resolve(false);

    var quien = describirDispositivo();

    return sb.from(PUSH_TABLE).select('id')
      .eq('empleado', empleado)
      .eq('subscription->>endpoint', endpoint)
      .limit(1)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        if (res.data && res.data.length) {
          // Ya estaba: no duplica, pero refresca como se llama el aparato.
          return sb.from(PUSH_TABLE)
            .update({ dispositivo: quien.nombre, plataforma: quien.plataforma,
                      user_agent: quien.ua })
            .eq('id', res.data[0].id)
            .then(function () { return true; }, function () { return true; });
        }
        return sb.from(PUSH_TABLE).insert({
          empleado: empleado,
          subscription: json,
          dispositivo: quien.nombre,
          plataforma: quien.plataforma,
          user_agent: quien.ua
        }).then(function (ins) {
          // 23505 = ya existe por el indice unico. Es exito, no falla: dos
          // pestanias del mismo aparato pueden registrarse a la vez.
          if (ins.error && ins.error.code !== '23505') { humanError(ins.error); return false; }
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
          // Una suscripcion hecha con la clave VAPID anterior sigue viva en
          // el navegador pero el servidor de push la rechaza para siempre.
          // Al rotar claves hay que tirarla y sacar una nueva.
          if (sub && !claveVigente(sub)) {
            var viejo = (sub.toJSON() || {}).endpoint;
            return sub.unsubscribe()
              .catch(function () { return null; })
              .then(function () { return olvidarSub(sb, viejo); })
              .then(function () { return null; });
          }
          return sub;
        }).then(function (sub) {
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

  /* Los aparatos registrados para un rol, para poder mirarlos y sacar el que
     no corresponde. Marca cual es EL DE ESTA PANTALLA: sin eso, una lista de
     "iPhone, iPhone, PC" no se puede desambiguar mirandola.               */
  /* Ultimo recurso cuando la fila no tiene identidad guardada (se registro
     antes de que existiera la columna). El servidor de push delata bastante:
     Apple solo lo usan iPhone, iPad y Mac; FCM, Chrome y Android.        */
  function describirEndpoint(ep) {
    if (!ep) return null;
    if (ep.indexOf('web.push.apple.com') !== -1) return 'Apple - iPhone, iPad o Mac';
    if (ep.indexOf('fcm.googleapis.com') !== -1) return 'Chrome o Android';
    if (ep.indexOf('notify.windows.com') !== -1) return 'Windows';
    if (ep.indexOf('mozilla.com') !== -1 || ep.indexOf('mozaws.net') !== -1) return 'Firefox';
    return null;
  }

  function listarSubs(sb, empleado) {
    if (!sb) return Promise.resolve(null);
    var q = sb.from(PUSH_TABLE)
      .select('id, empleado, dispositivo, plataforma, created_at, ultimo_aviso, subscription')
      .order('created_at', { ascending: true });
    if (empleado) q = q.eq('empleado', empleado);

    return q.then(function (res) {
      if (res.error) { humanError(res.error); return null; }
      var filas = res.data || [];
      return endpointDeEsteAparato().then(function (mio) {
        return filas.map(function (f) {
          var ep = f.subscription && f.subscription.endpoint;
          return {
            id: f.id,
            empleado: f.empleado,
            dispositivo: f.dispositivo || describirEndpoint(ep) ||
                         'Dispositivo sin identificar',
            /* Se muestran los ultimos caracteres del endpoint: es lo unico
               que distingue dos aparatos de la misma marca, y permite ver a
               simple vista que dos filas son en realidad el MISMO aparato
               registrado en dos roles.                                    */
            huella: ep ? ep.slice(-8) : null,
            sinIdentificar: !f.dispositivo,
            plataforma: f.plataforma || '',
            created_at: f.created_at,
            ultimo_aviso: f.ultimo_aviso,
            esteAparato: !!(mio && ep && mio === ep)
          };
        });
      });
    }, function (e) { humanError(e); return null; });
  }

  function endpointDeEsteAparato() {
    if (!pushSoportado()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return null;
      return reg.pushManager.getSubscription().then(function (sub) {
        var json = sub && sub.toJSON();
        return (json && json.endpoint) || null;
      });
    }).catch(function () { return null; });
  }

  function borrarSub(sb, id) {
    if (!sb || !id) return Promise.resolve(false);
    return sb.from(PUSH_TABLE).delete().eq('id', id)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return true;
      }, function (e) { humanError(e); return false; });
  }

  /* Dispara el aviso sin bloquear al que lo llama. Nunca rompe nada, pero
     tampoco se traga el motivo: devuelve { ok, motivo, config } y deja
     rastro en consola. 'config' distingue "el servidor esta sin configurar"
     (reintentar no sirve) de "no hay a quien avisarle" o de un corte de red.
     'url' es la pantalla que se abre al tocar la notificacion.            */
  function avisar(sb, empleado, title, body, pedidoId, url, insistir) {
    /* Apagados desde el panel tecnico. No es un error: es una decision del
       local, y por eso lleva su propio codigo. */
    if (!func('f_avisos')) {
      return Promise.resolve({ ok: false, config: false, codigo: 'apagado',
        motivo: 'Los avisos al celular est\u00e1n apagados.' });
    }
    if (!sb) {
      return Promise.resolve({ ok: false, config: false, codigo: 'sin-cliente',
        motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    return sb.functions.invoke('notify-empleado', {
      body: {
        empleado: empleado, title: title, body: body,
        pedidoId: pedidoId || null, url: url || null,
        /* Sin esto el aviso se autodescarta a los segundos. El service worker
           y la Edge Function ya lo esperaban, pero nadie lo emitia. */
        requireInteraction: insistir === true
      }
    }).then(function (res) {
      /* El texto del servidor es nuestro y se puede mostrar. El message de un
         error de transporte es crudo (stack, codigos HTTP) y no va a pantalla:
         queda en consola y al usuario le damos una frase entendible.       */
      var delServidor = (res.data && res.data.error) || null;
      var codigo = (res.data && res.data.motivo) || null;
      var ok = !(res.error || (res.data && res.data.ok === false));
      if (!ok) console.warn('[La Positiva] aviso no enviado a ' + empleado,
                            delServidor || res.error || res);
      return {
        ok: ok,
        codigo: codigo,
        config: codigo === 'sin-config',
        motivo: delServidor ||
                (ok ? null : humanError(res.error, 'El servidor de avisos no respondio.'))
      };
    }, function (e) {
      console.warn('[La Positiva] aviso no enviado a ' + empleado, e);
      return { ok: false, config: false, codigo: 'error',
        motivo: humanError(e, 'No pudimos contactar al servidor de avisos.') };
    });
  }

  /* Cuantos dispositivos hay realmente registrados por empleado.
     Es la unica forma de saber que un aviso tiene a quien llegarle: el
     permiso del navegador no dice nada sobre la fila en la base.        */
  function contarSubs(sb, empleado) {
    if (!sb) return Promise.resolve(null);
    var q = sb.from(PUSH_TABLE).select('id', { count: 'exact', head: true });
    if (empleado) q = q.eq('empleado', empleado);
    return q.then(function (res) {
      if (res.error) { humanError(res.error); return null; }
      return typeof res.count === 'number' ? res.count : null;
    }, function (e) { humanError(e); return null; });
  }

  /* Confirma que ESTE dispositivo esta registrado en la base para ese
     empleado. estadoPush() solo mira el navegador; esto mira el servidor.

     Devuelve TRES valores, no dos: true / false / null. null es "no pudimos
     comprobarlo" (sin red, error de la consulta). Colapsar el error en false
     acusaba de "no registrado" a un aparato sano y mandaba a registrarlo de
     nuevo cuando el problema era la conexion.                             */
  function pushRegistrado(sb, empleado) {
    if (!sb || !pushSoportado()) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg) return false;
      return reg.pushManager.getSubscription().then(function (sub) {
        if (!sub) return false;
        var json = sub.toJSON();
        if (!json || !json.endpoint) return false;
        return sb.from(PUSH_TABLE).select('id')
          .eq('empleado', empleado)
          .eq('subscription->>endpoint', json.endpoint)
          .limit(1)
          .then(function (res) {
            if (res.error) { humanError(res.error); return null; }
            return !!(res.data && res.data.length);
          }, function (e) { humanError(e); return null; });
      });
    }).catch(function () { return null; });
  }

  /* --- WhatsApp -----------------------------------------------------------
     Canal aparte del push: otras credenciales, otros modos de falla. Que se
     caiga uno no puede tumbar al otro.                                    */

  /* Deja el numero en formato internacional o devuelve null. Se valida aca
     ademas de en el servidor para poder explicarlo mientras se escribe.  */
  function normalizarTelefono(t) {
    if (!t) return null;
    var limpio = String(t).replace(/[\s()\-.]/g, '');
    return /^\+[1-9]\d{6,14}$/.test(limpio) ? limpio : null;
  }

  function listarWhatsapp(sb, rol) {
    if (!sb) return Promise.resolve(null);
    var q = sb.from(WA_TABLE).select('*').order('created_at', { ascending: true });
    if (rol) q = q.eq('rol', rol);
    return q.then(function (res) {
      if (res.error) { humanError(res.error); return null; }
      return res.data || [];
    }, function (e) { humanError(e); return null; });
  }

  function agregarWhatsapp(sb, rol, telefono, nombre) {
    if (!sb) return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    var tel = normalizarTelefono(telefono);
    if (!tel) {
      return Promise.resolve({
        ok: false,
        motivo: 'El número tiene que ir en formato internacional, con el código de país. ' +
                'Por ejemplo +5491122334455.'
      });
    }
    return sb.from(WA_TABLE)
      .insert({ rol: rol, telefono: tel, nombre: (nombre || '').slice(0, 60) || null })
      .select().single()
      .then(function (res) {
        if (res.error) {
          // 23505 = ese numero ya estaba cargado para ese rol.
          if (res.error.code === '23505') {
            return { ok: false, motivo: 'Ese número ya estaba cargado para ' + rol + '.' };
          }
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos guardar el número.' };
        }
        return { ok: true, fila: res.data };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos guardar el número.' };
      });
  }

  function borrarWhatsapp(sb, id) {
    if (!sb || !id) return Promise.resolve(false);
    return sb.from(WA_TABLE).delete().eq('id', id).then(function (res) {
      if (res.error) { humanError(res.error); return false; }
      return true;
    }, function (e) { humanError(e); return false; });
  }

  /* Manda el WhatsApp. opts: { rol } para los numeros del local, o
     { telefono } para uno suelto (el comensal). Devuelve la misma forma que
     avisar(): { ok, codigo, motivo }.                                     */
  function avisarWhatsapp(sb, opts) {
    if (!func('f_avisos')) {
      return Promise.resolve({ ok: false, codigo: 'apagado',
        motivo: 'Los avisos est\u00e1n apagados.' });
    }
    if (!sb) {
      return Promise.resolve({ ok: false, codigo: 'sin-cliente',
        motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    return sb.functions.invoke('notify-whatsapp', { body: opts }).then(function (res) {
      var delServidor = (res.data && res.data.error) || null;
      var codigo = (res.data && res.data.motivo) || null;
      var ok = !(res.error || (res.data && res.data.ok === false));
      if (!ok) console.warn('[La Positiva] WhatsApp no enviado', delServidor || res.error || res);
      return {
        ok: ok,
        codigo: codigo,
        config: codigo === 'sin-config',
        motivo: delServidor ||
                (ok ? null : humanError(res.error, 'El servidor de WhatsApp no respondio.'))
      };
    }, function (e) {
      console.warn('[La Positiva] WhatsApp no enviado', e);
      return { ok: false, codigo: 'error',
        motivo: humanError(e, 'No pudimos contactar al servidor de WhatsApp.') };
    });
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

  /* --- Pantalla despierta -------------------------------------------------
     La tablet de la cocina se apaga sola a los dos minutos y el aviso suena
     contra una pantalla negra. Esto la mantiene encendida mientras el panel
     este a la vista.

     No arregla el caso del panel CERRADO: ahi no hay pagina viva que pueda
     sonar, y lo unico que llega es la notificacion push. Es un limite del
     navegador, no algo que se pueda programar.                           */
  var wakeLock = null;

  function mantenerDespierta() {
    if (!('wakeLock' in navigator)) return Promise.resolve(false);
    if (document.hidden) return Promise.resolve(false);
    if (wakeLock) return Promise.resolve(true);

    return navigator.wakeLock.request('screen').then(function (wl) {
      wakeLock = wl;
      // El sistema lo suelta solo al minimizar o bloquear: se vuelve a pedir
      // cuando la pantalla regresa.
      wl.addEventListener('release', function () { wakeLock = null; });
      return true;
    }).catch(function () { return false; });
  }

  /* Se engancha una vez y se ocupa de re-pedirlo cuando haga falta. */
  function pantallaSiempreEncendida() {
    mantenerDespierta();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) mantenerDespierta();
    });
    onCleanup(function () {
      if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    });
  }

  /* --- Quien esta usando esto --------------------------------------------
     Sin contrasenia y sin correo: se toca el nombre y listo. En un local de
     seis personas con el telefono en la mano, una clave solo agrega un paso
     que alguien va a terminar anotando en un papel. Esto no protege datos
     -la demo es de acceso libre-: sirve para saber quien aprobo, quien
     cobro y a quien avisarle.                                            */
  var YO_KEY = 'lp_quien_soy';

  function personas(sb) {
    if (!sb) return Promise.resolve([]);
    return sb.from(PERSONAS_TABLE).select('*')
      .eq('activo', true).order('orden', { ascending: true })
      .then(function (res) {
        if (res.error) { humanError(res.error); return []; }
        return res.data || [];
      }, function (e) { humanError(e); return []; });
  }

  /* --- Propinas -------------------------------------------------------
     El QR de cobro de la comida es unico por persona y por posnet: la
     propina NO pasa por ahi. Se paga aparte, por transferencia al alias
     bancario DEL MOZO (no del local) o en efectivo. No hay integracion
     bancaria real -nadie puede confirmar automaticamente que la plata
     entro-, asi que el flujo es de auto-reporte mas confirmacion manual:

       1) El comensal, desde la carta de su mesa, toca "Ya transferí".
          Eso guarda una fila 'reportada': todavia nadie la vio en el banco.
       2) El mozo la confirma cuando la ve entrar en su cuenta. Recien ahi
          pasa a 'confirmada'.

     El efectivo es distinto: el mozo lo carga a mano porque ya lo tiene en
     el bolsillo, y entra 'confirmada' de una, sin paso 1.                */

  function mozosActivos(sb) {
    return personas(sb).then(function (lista) {
      return lista.filter(function (p) { return p.rol === 'Mozo'; });
    });
  }

  /* El alias vive en la_positiva_personas, junto con el resto del mozo: no
     tiene sentido una tabla aparte para un solo campo de texto. */
  function guardarAliasMozo(sb, id, alias) {
    if (!sb || !id) return Promise.resolve(false);
    var limpio = String(alias || '').trim().slice(0, 60) || null;
    return sb.from(PERSONAS_TABLE).update({ alias_propina: limpio }).eq('id', id)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return true;
      }, function (e) { humanError(e); return false; });
  }

  function numeroOnulo(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return (isFinite(n) && n >= 0) ? n : null;
  }

  /* El comensal avisa que ya transfirio. Nace 'reportada': el mozo todavia
     no la vio en su banco. */
  function reportarPropina(sb, datos) {
    if (!sb) return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    datos = datos || {};
    if (!datos.mesa || !datos.mozo) {
      return Promise.resolve({ ok: false, motivo: 'Falta saber la mesa o el mozo.' });
    }
    return sb.from(PROPINAS_TABLE).insert({
      mesa: String(datos.mesa).slice(0, 20),
      mozo: String(datos.mozo).slice(0, 60),
      mozo_alias: datos.mozo_alias ? String(datos.mozo_alias).slice(0, 60) : null,
      comensal: datos.comensal ? String(datos.comensal).slice(0, 60) : null,
      monto: numeroOnulo(datos.monto),
      medio: 'alias',
      estado: 'reportada',
      cargado_por: 'Comensal'
    }).select().single().then(function (res) {
      if (res.error) { humanError(res.error); return { ok: false, motivo: 'No pudimos guardar el aviso.' }; }
      return { ok: true, propina: res.data };
    }, function (e) { humanError(e); return { ok: false, motivo: 'No pudimos guardar el aviso.' }; });
  }

  /* El mozo la vio entrar en su cuenta: pasa a confirmada. Solo se puede
     confirmar una vez -el .eq('estado','reportada') es el candado-, para
     no pisar una confirmacion que hizo otro celular un segundo antes. */
  function confirmarPropina(sb, id) {
    if (!sb || !id) return Promise.resolve(false);
    return sb.from(PROPINAS_TABLE)
      .update({ estado: 'confirmada', confirmado_at: new Date().toISOString() })
      .eq('id', id).eq('estado', 'reportada')
      .select()
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return !!(res.data && res.data.length);
      }, function (e) { humanError(e); return false; });
  }

  /* Efectivo cargado a mano: no hay nada que confirmar despues, el mozo ya
     la tiene encima. */
  function cargarPropinaEfectivo(sb, datos) {
    if (!sb) return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    datos = datos || {};
    var monto = Number(datos.monto);
    if (!datos.mozo || !isFinite(monto) || monto <= 0) {
      return Promise.resolve({ ok: false, motivo: 'Falta el mozo o un monto mayor a cero.' });
    }
    return sb.from(PROPINAS_TABLE).insert({
      mesa: datos.mesa ? String(datos.mesa).slice(0, 20) : 'Sin mesa',
      mozo: String(datos.mozo).slice(0, 60),
      comensal: datos.comensal ? String(datos.comensal).slice(0, 60) : null,
      monto: monto,
      medio: 'efectivo',
      estado: 'confirmada',
      cargado_por: (datos.cargado_por || datos.mozo || '').slice(0, 40) || null,
      confirmado_at: new Date().toISOString()
    }).select().single().then(function (res) {
      if (res.error) { humanError(res.error); return { ok: false, motivo: 'No pudimos guardar la propina.' }; }
      return { ok: true, propina: res.data };
    }, function (e) { humanError(e); return { ok: false, motivo: 'No pudimos guardar la propina.' }; });
  }

  /* Todas las propinas de un mozo, mas nuevas primero. */
  function propinasDeMozo(sb, mozo) {
    if (!sb || !mozo) return Promise.resolve(null);
    return sb.from(PROPINAS_TABLE).select('*').eq('mozo', mozo)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return res.data || [];
      }, function (e) { humanError(e); return null; });
  }


  /* --- La libreta del local ----------------------------------------------
     Cosas para anotar y no olvidarse: tareas, eventos, stock, limpieza y
     arreglos. Cualquiera anota y cualquiera marca hecho, a proposito: es un
     cuaderno compartido. La usa gente que no maneja tecnologia, asi que
     anotar tiene que ser escribir y tocar un boton, nada mas.

     La fecha es OPCIONAL y eso no es un descuido: "arreglar la puerta del
     baniio" no tiene fecha, y obligar a poner una hace que la persona
     invente cualquier dia y el recordatorio pierda sentido.               */
  var TIPOS_LIBRETA = [
    { id: 'tarea',    texto: 'Tarea' },
    { id: 'evento',   texto: 'Evento' },
    { id: 'stock',    texto: 'Falta / comprar' },
    { id: 'limpieza', texto: 'Limpiar' },
    { id: 'arreglo',  texto: 'Arreglar' }
  ];

  function tipoLibretaValido(t) {
    for (var i = 0; i < TIPOS_LIBRETA.length; i++) if (TIPOS_LIBRETA[i].id === t) return true;
    return false;
  }

  /* El dia de HOY en el mismo formato que guarda la base (AAAA-MM-DD) y en la
     hora del telefono, no en UTC. Con toISOString() a las 22 de Argentina ya
     es maniana en Londres: lo de hoy aparecia como "de maniana" y lo atrasado
     dejaba de estar atrasado. */
  function hoyLocalISO(d) {
    var f = d || new Date();
    var m = String(f.getMonth() + 1);
    var dd = String(f.getDate());
    return f.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' +
           (dd.length < 2 ? '0' + dd : dd);
  }

  function libreta(sb) {
    var cliente = sb || client();
    if (!cliente) return Promise.resolve(null);
    return cliente.from(LIBRETA_TABLE).select('*')
      .order('created_at', { ascending: false })
      .limit(400)
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return res.data || [];
      }, function (e) { humanError(e); return null; });
  }

  /* Devuelve { ok, motivo } como el resto de los guardados de la app, para que
     la pantalla pueda decir QUE paso y no solo que no anduvo.             */
  function anotar(sb, datos) {
    var cliente = sb || client();
    if (!cliente) return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    var texto = String((datos && datos.texto) || '').trim().slice(0, 400);
    if (!texto) return Promise.resolve({ ok: false, motivo: 'Escrib\u00ed qu\u00e9 hay que hacer.' });
    var tipo = (datos && datos.tipo) || 'tarea';
    if (!tipoLibretaValido(tipo)) tipo = 'tarea';
    var fila = {
      texto: texto,
      tipo: tipo,
      /* Cadena vacia no es lo mismo que null y Postgres rechaza '' como date:
         sin fecha se manda null, que es lo que la columna espera. */
      para_cuando: (datos && datos.para_cuando) ? datos.para_cuando : null,
      anotado_por: (datos && datos.anotado_por) || null
    };
    return cliente.from(LIBRETA_TABLE).insert(fila).select('*').single()
      .then(function (res) {
        if (res.error) return { ok: false, motivo: humanError(res.error, 'No pudimos guardar la anotaci\u00f3n.') };
        return { ok: true, fila: res.data };
      }, function (e) { return { ok: false, motivo: humanError(e, 'No pudimos guardar la anotaci\u00f3n.') }; });
  }

  /* Marcar y desmarcar son la MISMA funcion: marcar sin querer tiene que
     poder deshacerse con otro toque. Al desmarcar se limpian quien y cuando,
     asi no queda un "hecho por Betty" en algo que esta pendiente.         */
  function marcarAnotacion(sb, id, hecho, quien) {
    var cliente = sb || client();
    if (!cliente || !id) return Promise.resolve(false);
    var cambio = hecho
      ? { hecho: true, hecho_por: quien || null, hecho_at: new Date().toISOString() }
      : { hecho: false, hecho_por: null, hecho_at: null };
    return cliente.from(LIBRETA_TABLE).update(cambio).eq('id', id)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return true;
      }, function (e) { humanError(e); return false; });
  }

  function borrarAnotacion(sb, id) {
    var cliente = sb || client();
    if (!cliente || !id) return Promise.resolve(false);
    return cliente.from(LIBRETA_TABLE).delete().eq('id', id)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return true;
      }, function (e) { humanError(e); return false; });
  }

  function quienSoy() {
    try {
      var crudo = localStorage.getItem(YO_KEY);
      return crudo ? JSON.parse(crudo) : null;
    } catch (e) { return null; }
  }

  function entrarComo(persona) {
    try {
      localStorage.setItem(YO_KEY, JSON.stringify({
        nombre: persona.nombre, rol: persona.rol, nota: persona.nota || null
      }));
    } catch (e) {}
    return persona;
  }

  function salir() {
    try { localStorage.removeItem(YO_KEY); } catch (e) {}
  }

  /* A que pantalla va cada rol al entrar. */
  var PANTALLA_POR_ROL = {
    Duenio: 'admin.html',
    Mozo:   'mozo.html',
    Caja:   'caja.html',
    Cocina: 'cocina.html',
    Encargada: 'admin.html',
    /* Mantenimiento no tiene operacion: su pantalla es la libreta. */
    Mantenimiento: 'anotaciones.html'
  };

  function pantallaDe(rol) { return PANTALLA_POR_ROL[rol] || 'index.html'; }

  /* --- Que hace cada uno --------------------------------------------------
     La regla del local: cada persona tiene UNA cosa que hacer bien, y como
     mucho dos. Por eso el mozo no ve la caja y la cocina no ve la plata: no
     es que no tengan permiso, es que no es su trabajo y les ocupa la
     pantalla.

     El duenio es la excepcion a proposito: Nelly y Oscar entran y ven todo.
     Si no fuera asi, Nelly terminaria entrando como Jonathan para poder
     hacer algo, y el rastro de quien hizo que se volveria mentira.

     Los textos son la funcion en castellano, no el nombre del archivo: la
     persona busca "los pagos", no "caja.html".                          */
  /* =====================================================================
     LA MATRIZ. Este es el UNICO lugar donde se decide quien entra a que.

     De aca salen las dos cosas a la vez: los botones que ve cada uno en la
     portada Y el portero que rebota al que escribe la direccion a mano. Antes
     eran dos listas separadas y bastaba un renglon mal copiado para que el
     menu ofreciera una puerta que despues rebotaba.

     Para dar o sacar un acceso se toca UN renglon de MATRIZ y nada mas.

     Decision de David del 17/09: cada puesto ve solo lo suyo, y el duenio
     dejo de ser la excepcion. Antes Nelly y Oscar veian las catorce
     pantallas por ser duenios; ahora tienen dos, como todos.

     Los modulos que no le tocan a nadie NO se borraron: siguen enteros, con
     su codigo y sus datos. Estan fuera de MATRIZ, nada mas. Devolverle una
     pantalla a un puesto es agregar su nombre a la lista de abajo.      */
  var MODULOS = {
    'comanda.html':     'Tomar comanda',
    'mozo.html':        'Los pedidos de las mesas',
    'cobrar.html':      'Cobrar con QR',
    'admin.html':       'Cómo viene el salón',
    'caja.html':        'Los pagos',
    'cocina.html':      'Las comandas',
    'carta-fotos.html': 'Marcar lo que se terminó',
    'anotaciones.html': 'La libreta del local',
    'mesas.html':       'El salón y las cuentas',
    'qr-mesa.html':     'Los QR de las mesas',
    'propinas.html':    'Las propinas de los mozos',
    'diseno.html':      'El diseño del local',
    'tecnico.html':     'Panel técnico',
    'alta.html':        'Activar los avisos'
  };

  /* El orden importa: el primero de cada lista se pinta como boton grande en
     la portada, asi que va la pantalla con la que arranca el turno. */
  var MATRIZ = {
    Mozo:          ['comanda.html', 'mozo.html', 'cobrar.html'],
    Encargada:     ['comanda.html', 'mozo.html', 'cobrar.html', 'admin.html'],
    Caja:          ['cobrar.html', 'caja.html'],
    Cocina:        ['cocina.html', 'carta-fotos.html'],
    Mantenimiento: ['anotaciones.html'],
    Duenio:        ['admin.html', 'anotaciones.html', 'carta-fotos.html', 'tecnico.html']
  };

  /* El mismo modulo se llama distinto segun quien entra: el mozo va a cobrar,
     la caja va a mostrar el QR. Es la misma pantalla y dos trabajos. */
  var ROTULO_POR_ROL = {
    Caja: { 'cobrar.html': 'Mostrar el QR de cobro' },
    /* La cocina entra a la carta a marcar lo que se acabo y nada mas. La
       duenia entra a lo mismo MAS los precios y las fotos, asi que el boton
       no puede prometerle solo una de las tres cosas. */
    Duenio: { 'carta-fotos.html': 'La carta y lo que se terminó' }
  };

  /* Los menus salen de MATRIZ. No hay una segunda lista que mantener. */
  var FUNCIONES_POR_ROL = (function () {
    var out = {};
    Object.keys(MATRIZ).forEach(function (rol) {
      out[rol] = MATRIZ[rol].map(function (url) {
        var propio = ROTULO_POR_ROL[rol] && ROTULO_POR_ROL[rol][url];
        return { url: url, texto: propio || MODULOS[url] };
      });
    });
    return out;
  })();

  /* El renombre del panel tecnico se aplica ACA, en el unico lugar por el
     que pasan todos los menus. Si la copia local esta rota, devuelve los
     nombres de fabrica: nadie se queda sin menu por un rotulo.        */
  /* Que pantalla depende de que interruptor. Si la funcion esta apagada, la
     pantalla no figura en el menu de nadie: dejar el link llevaria a una
     pantalla vacia, y eso se lee como "se rompio". */
  var LLAVE_DE_PANTALLA = {
    'propinas.html': 'f_propinas',
    'cobrar.html': 'f_qr_pago',
    'anotaciones.html': 'f_libreta'
  };

  function funcionesDe(rol) {
    var base = FUNCIONES_POR_ROL[rol] || [];
    try {
      return base.filter(function (f) {
        /* Dos filtros y hacen cosas distintas. El interruptor apaga una
           funcion para TODO el local; el permiso dice si ESTE puesto entra.
           El segundo es de la fase 5 y antes no se consultaba aca: la lista
           de la portada y el portero de cada pantalla eran dos verdades
           separadas, y bastaba un renglon mal copiado para que el menu
           ofreciera una puerta que despues rebotaba (AJ-008).            */
        var p = permisoDe(f.url, rol);
        if (p !== 'edita' && p !== 've') return false;
        var llave = LLAVE_DE_PANTALLA[f.url];
        return !llave || func(llave);
      }).map(function (f) {
        return { url: f.url, texto: nombreDePantalla(f.url, f.texto) };
      });
    } catch (e) { return base; }
  }

  /* --- Los iconos ---------------------------------------------------------
     Un dibujo por pantalla. Se reconoce mas rapido de lo que se lee un
     renglon de texto, y el mozo mira el celular con una mano y una bandeja
     en la otra.

     TRES decisiones y las tres son a proposito:

     1. SVG escrito a mano, nada de librerias. El proyecto no tiene build y
        la portada tiene que abrir de una: bajar una libreta de iconos para
        dibujar once figuras seria mas peso que toda la app junta.
     2. Trazo y NO relleno, con stroke="currentColor". Asi el mismo icono
        sirve sobre el fondo tinta de la portada y sobre la crema de las
        pantallas de dia, y si maniana el tema cambia el terracota por otro
        color el icono lo sigue solo, sin tocar una linea.
     3. Cero emojis. El emoji de olla, de campana o de camara se dibuja
        distinto en cada telefono y en algunos directamente no aparece. Esa
        regla ya estaba escrita en comanda.html para el icono de la foto;
        aca se vuelve la regla de todos.

     Va en app.js y no en cada HTML porque los usan DOS lugares: la grilla de
     la portada y la barra de acceso rapido, y las dos se arman desde JS a
     partir de funcionesDe(). Una sola copia, un solo lugar donde corregir. */
  var ICONO_BASE =
    '<svg class="ico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" ' +
      'focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round">';

  var DIBUJOS = {
    /* Libreta con lapiz: tomar la comanda. */
    'comanda.html':
      '<rect x="3.5" y="3" width="12" height="18" rx="2.2"/>' +
      '<path d="M6.8 7.6h5.4M6.8 11.2h5.4M6.8 14.8h3.2"/>' +
      '<path d="M18.4 12.4 21 15l-3.4 3.4-2.6.6.6-2.6z"/>',
    /* Comanda impresa con el borde dentado: los pedidos que ya dan vueltas. */
    'mozo.html':
      '<path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5L7.7 19z"/>' +
      '<path d="M9 8.2h6M9 12h6"/>',
    /* La planta del salon vista de arriba: mesas redondas y cuadradas. */
    'mesas.html':
      '<circle cx="7.5" cy="7.5" r="3.1"/>' +
      '<rect x="14" y="4.2" width="6.2" height="6.6" rx="1.4"/>' +
      '<rect x="3.8" y="14" width="7" height="6.4" rx="1.4"/>' +
      '<circle cx="17.1" cy="17.2" r="3.1"/>',
    /* Olla con vapor. */
    'cocina.html':
      '<path d="M4.4 10.4h15.2v4.4a4.2 4.2 0 0 1-4.2 4.2H8.6a4.2 4.2 0 0 1-4.2-4.2z"/>' +
      '<path d="M19.6 11.8h1.6a1.3 1.3 0 0 1 0 2.6h-1.6M4.4 11.8H2.8a1.3 1.3 0 0 0 0 2.6h1.6"/>' +
      '<path d="M9.6 7.4c0-1.3 1.2-1.5 1.2-2.8M14 7.4c0-1.3 1.2-1.5 1.2-2.8"/>',
    /* Billete: los pagos. */
    'caja.html':
      '<rect x="2.6" y="6" width="18.8" height="12" rx="2.2"/>' +
      '<circle cx="12" cy="12" r="2.6"/>' +
      '<path d="M6 10.4v3.2M18 10.4v3.2"/>',
    /* El QR de cobro. */
    'cobrar.html':
      '<rect x="3.4" y="3.4" width="6.2" height="6.2" rx="1.2"/>' +
      '<rect x="14.4" y="3.4" width="6.2" height="6.2" rx="1.2"/>' +
      '<rect x="3.4" y="14.4" width="6.2" height="6.2" rx="1.2"/>' +
      '<path d="M14.4 14.4h3.1v3.1h-3.1z"/>' +
      '<path d="M20.6 14.4v3.1M17.5 20.6h3.1"/>',
    /* Libro abierto: la carta. */
    'carta-fotos.html':
      '<path d="M12 6.6C10.5 5.1 8.4 4.4 5 4.4v12.8c3.4 0 5.5.7 7 2.2 1.5-1.5 3.6-2.2 7-2.2V4.4' +
        'c-3.4 0-5.5.7-7 2.2z"/>' +
      '<path d="M12 6.6v12.8"/>',
    /* Etiqueta colgada: el QR que se pega en cada mesa. */
    'qr-mesa.html':
      '<path d="M20.4 12.7l-7.7 7.7a2 2 0 0 1-2.8 0L3.7 14.2a2 2 0 0 1-.58-1.55l.44-5.9' +
        'a2 2 0 0 1 1.84-1.84l5.9-.44a2 2 0 0 1 1.55.58l6.2 6.2a2 2 0 0 1 0 2.8z"/>' +
      '<circle cx="8.3" cy="8.3" r="1.5"/>',
    /* Barras: como viene el salon. */
    'admin.html':
      '<path d="M3.6 20.4h16.8"/>' +
      '<path d="M7.2 17.6v-5.4M12 17.6V7.8M16.8 17.6V4.6"/>',
    /* Moneda sobre la mano: las propinas. */
    'propinas.html':
      '<circle cx="12" cy="7.8" r="4.1"/>' +
      '<path d="M12 6v3.6M10.7 6.9h2.6"/>' +
      '<path d="M3.6 20.4c2-2.3 4.7-3.5 8.4-3.5s6.4 1.2 8.4 3.5"/>',
    /* Paleta de pintor: el diseno del local. */
    'diseno.html':
      '<path d="M12 3.3a8.7 8.7 0 0 0 0 17.4c1.35 0 1.95-.9 1.95-1.8 0-1.55-1.55-1.85-1.55-3.25' +
        ' 0-1.2.95-2.05 2.25-2.05h1.75a4.25 4.25 0 0 0 4.25-4.25C20.65 5.85 16.8 3.3 12 3.3z"/>' +
      '<circle cx="8.3" cy="9.3" r="1.05"/><circle cx="12" cy="7.1" r="1.05"/>' +
      '<circle cx="7.5" cy="13.6" r="1.05"/>',
    /* Nota con el tilde de "hecho": la libreta del local. */
    'anotaciones.html':
      '<rect x="4" y="3.4" width="16" height="17.2" rx="2.2"/>' +
      '<path d="M8 9.6l2 2 3.6-3.6"/><path d="M8 15.6h8"/>',
    /* Campana: activar los avisos. */
    'alta.html':
      '<path d="M18.1 16.6H5.9l1.35-2.25V11a4.75 4.75 0 0 1 9.5 0v3.35z"/>' +
      '<path d="M10.2 19.3a2 2 0 0 0 3.6 0"/><path d="M12 6.25V4.4"/>',
    /* Llave: el panel tecnico. Es una llave y no un engranaje porque el
       engranaje ya quiere decir "ajustes" en media docena de pantallas del
       telefono, y esto no es ajustes: es el tablero interno. */
    'tecnico.html':
      '<circle cx="7.8" cy="16.2" r="3.6"/>' +
      '<path d="M10.35 13.65 19.6 4.4"/>' +
      '<path d="M16.1 7.9l2.4 2.4M18.7 5.3l2.4 2.4"/>'
  };

  /* Si maniana aparece una pantalla nueva y nadie le dibujo el icono, sale
     este cuadrado con un punto en vez de un hueco: la tarjeta se sigue
     viendo entera y el que la agrego se da cuenta de que falta el dibujo.
     Es un cuadrado y no una grilla de cuatro a proposito: la grilla de
     cuatro se confunde con el plano del salon y con el boton de las 19
     categorias de la comanda, y un icono "no se" no puede parecerse a uno
     de verdad. */
  var DIBUJO_GENERICO =
    '<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3"/>' +
    '<circle cx="12" cy="12" r="1.7"/>';

  /* El icono de una pantalla, listo para pegar en el HTML. La url puede
     venir con parametros ('carta-fotos.html?solo=agotados'): se corta en el
     '?' antes de buscar. */
  function iconoDe(url) {
    var limpia = String(url || '').split('?')[0].split('/').pop();
    return ICONO_BASE + (DIBUJOS[limpia] || DIBUJO_GENERICO) + '</svg>';
  }

  /* --- El acceso rapido ---------------------------------------------------
     La pastilla fija de abajo con las tres cosas que el mozo hace todo el
     turno: tomar la comanda, las mesas y cobrar. "Saca el celu y ya esta
     adentro": sin volver a la portada y sin buscar nada.

     POR QUE ABAJO Y NO ARRIBA: arriba ya vive la barra de navegacion fija
     (.nav-fija: el boton de volver y el nombre de la pantalla). Taparla o
     competirle seria romper lo unico que ya esta siempre visible. Abajo,
     ademas, es donde llega el pulgar con el celular en una mano.

     DONDE APARECE: en una lista cerrada de pantallas de trabajo, no en
     "todas las que tengan barra de navegacion". Es a proposito: diseno.html
     tiene su propia barra pegada abajo, la carta del comensal es del cliente
     y la portada ya muestra los accesos grandes. Una lista explicita no se
     rompe sola cuando maniana se agregue una pantalla nueva.

     A QUIEN: solo los accesos que su puesto puede abrir. La cocina no ve
     "Cobrar" y, como no puede abrir ninguno de los tres, no le aparece
     barra ninguna. Se pregunta a permisoDe() y al interruptor, los mismos
     dos filtros que usa funcionesDe(): la barra no puede ofrecer una puerta
     que el portero despues rebota.                                        */
  var ACCESO_RAPIDO = [
    { url: 'comanda.html', texto: 'Comanda' },
    { url: 'mesas.html',   texto: 'Mesas' },
    { url: 'cobrar.html',  texto: 'Cobrar' }
  ];

  var CON_ACCESO_RAPIDO = [
    'comanda.html', 'mozo.html', 'mesas.html', 'cobrar.html',
    'cocina.html', 'caja.html', 'admin.html', 'anotaciones.html',
    'carta-fotos.html', 'propinas.html'
  ];

  function paginaActual() {
    var p = (location.pathname || '').split('/').pop();
    return p || 'index.html';
  }

  function accesoRapido() {
    if (!document.body || document.querySelector('.acceso-rapido')) return;
    var aqui = paginaActual();
    if (CON_ACCESO_RAPIDO.indexOf(aqui) === -1) return;

    var yo = quienSoy();
    if (!yo) return;                      // todavia no dijo quien es

    var mios = ACCESO_RAPIDO.filter(function (a) {
      if (a.url === aqui) return false;   // no se ofrece la pantalla que ya esta abierta
      var p = permisoDe(a.url, yo.rol);
      if (p !== 'edita' && p !== 've') return false;
      var llave = LLAVE_DE_PANTALLA[a.url];
      return !llave || func(llave);
    });
    if (!mios.length) return;

    var barra = document.createElement('nav');
    barra.className = 'acceso-rapido';
    barra.setAttribute('aria-label', 'Accesos rápidos');
    barra.innerHTML = mios.map(function (a) {
      return '<a href="' + esc(a.url) + '">' + iconoDe(a.url) +
        '<span>' + esc(nombreCorto(a)) + '</span></a>';
    }).join('');

    document.body.appendChild(barra);
    document.body.classList.add('con-acceso');
  }

  /* El rotulo de la pastilla. Se respeta el renombre del panel tecnico solo
     si el nombre nuevo es corto: en una pastilla de 100px, "Tomar la comanda
     de la mesa" se corta en "Tomar la com...". */
  function nombreCorto(a) {
    var puesto = nombreDePantalla(a.url, a.texto);
    return puesto && puesto.length <= 12 ? puesto : a.texto;
  }

  /* Escribe quien sos en las pantallas que tengan un [data-quien].
     Se llama sola al cargar app.js: asi ninguna pantalla se puede olvidar
     de decirlo, que es lo que pidio el duenio.                          */
  /* --- Como se llama el puesto de cada uno --------------------------------
     Antes cada pantalla tenia el rotulo escrito a mano en el HTML, y por eso
     admin.html le decia "Duenia" a Cintia, que es encargada. Ahora sale de
     quien entro, en un solo lugar.

     El genero lo resuelve la nota de la persona: Oscar tiene "Dueno" y Nelly
     "Duenia", una moza tendria "Moza". Solo se usa si es una variante del
     mismo puesto, para que una nota rara no le cambie el rol a nadie. Y se
     corta en " de ": "Encargada de maniana" es el puesto de Betty, pero
     arriba de la pantalla va "Encargada". */
  var ROTULO_DE_ROL = {
    Duenio: 'Dueña',
    Encargada: 'Encargada',
    Mozo: 'Mozo',
    Caja: 'Caja',
    Cocina: 'Cocina',
    Mantenimiento: 'Mantenimiento'
  };

  function rotuloDeRol(persona) {
    var yo = persona || quienSoy();
    if (!yo || !yo.rol) return '';
    var base = ROTULO_DE_ROL[yo.rol] || yo.rol;
    var nota = String(yo.nota || '').trim();
    if (nota) {
      var raiz = sinTildes(base.slice(0, Math.max(3, base.length - 1)));
      if (sinTildes(nota).indexOf(raiz) === 0) return nota.split(' de ')[0];
    }
    return base;
  }

  /* Escribe el puesto en todo nodo con [data-rol], y de paso arregla el
     titulo de la pestania si termina con el rotulo viejo. */
  function mostrarRol() {
    var yo = quienSoy();
    var txt = rotuloDeRol(yo);
    var nodos = document.querySelectorAll('[data-rol]');
    for (var i = 0; i < nodos.length; i++) {
      if (txt) nodos[i].textContent = txt;
    }
    if (txt && nodos.length && /–|-/.test(document.title)) {
      document.title = document.title.replace(/[-–]\s*[^-–]*$/, '- ' + txt);
    }
  }

  function mostrarQuienSoy() {
    var nodos = document.querySelectorAll('[data-quien]');
    if (!nodos.length) return;
    var yo = quienSoy();
    for (var i = 0; i < nodos.length; i++) {
      if (!yo) { nodos[i].hidden = true; continue; }
      nodos[i].hidden = false;
      nodos[i].textContent = yo.nombre;
      nodos[i].setAttribute('title', yo.nota || yo.rol);
    }
  }

  /* --- Podar los enlaces que ya no corresponden ---------------------------
     Esconder el modulo del menu no alcanza: adentro de las pantallas hay
     links sueltos que llevan a otras. admin.html tenia seis, mozo.html dos.
     Si se dejan, el que los toca rebota contra el portero y lee "esta
     pantalla no es de tu puesto" en un boton que el sistema le ofrecio: eso
     se lee como que algo se rompio, no como que no le toca.

     Se recorre UNA vez al arrancar, contra la misma MATRIZ de siempre. No se
     borra nada del HTML: se oculta. Y se oculta el <li> entero cuando el link
     vive en una lista, para no dejar una vinieta vacia colgando.        */
  function podarEnlaces() {
    var yo = quienSoy();
    if (!yo || !yo.rol) return;              // sin puesto no hay nada que podar
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      /* Solo los internos y solo los que son un modulo de la matriz. Se corta
         en ? y en # para que 'alta.html?rol=Cocina' cuente como alta.html. */
      var url = href.split('?')[0].split('#')[0].replace(/^\.\//, '');
      if (!MODULOS[url]) continue;
      if (puedeVer(url)) continue;
      var caja = links[i].closest ? (links[i].closest('li') || links[i]) : links[i];
      caja.hidden = true;
      /* hidden solo no gana contra un display puesto por CSS. */
      try { caja.style.display = 'none'; } catch (e) {}
    }
  }

  /* --- La navegacion fija -------------------------------------------------
     El boton de volver arriba a la izquierda y el nombre de la pantalla a su
     derecha, siempre visibles. El duenio lo pidio dos veces: "siempre,
     siempre, siempre".

     Se arma desde aca y no en cada HTML por una razon concreta: son doce
     pantallas y el .back-link de cada una ya tiene su href, su id y sus
     listeners propios (comanda.html tiene DOS y los alterna). Moviendo el
     nodo que ya existe -mover no pierde los listeners- no hay que tocar ni
     una linea de la logica de ninguna pantalla.

     Si la pantalla no tiene ningun .back-link no se arma nada: de la portada
     y de la carta del comensal no se vuelve a ningun lado.              */
  function navegacionFija() {
    if (!document.body || document.querySelector('.nav-fija')) return;

    /* El de la cabecera manda. Recien si no hay se levanta el suelto del pie
       (alta.html y mesas.html lo tienen solo abajo). */
    var zona = document.querySelector('.head-right') || document.querySelector('header.top');
    var links = zona ? zona.querySelectorAll('.back-link') : [];
    if (!links.length) {
      var suelto = document.querySelector('.back-link');
      links = suelto ? [suelto] : [];
    }
    if (!links.length) return;

    var barra = document.createElement('div');
    barra.className = 'nav-fija';
    // Se copia la lista antes de mover: querySelectorAll es viva en algunos
    // casos y mover nodos mientras se recorre saltea la mitad.
    var mover = Array.prototype.slice.call(links);
    for (var i = 0; i < mover.length; i++) barra.appendChild(mover[i]);

    var donde = document.createElement('span');
    donde.className = 'nav-donde';
    donde.id = 'navDonde';
    var h1 = document.querySelector('header.top h1') || document.querySelector('h1');
    donde.textContent = (h1 && h1.textContent ? h1.textContent : '').trim();
    barra.appendChild(donde);

    document.body.insertBefore(barra, document.body.firstChild);
    document.body.classList.add('con-nav');

    /* Los "Volver al inicio" repetidos al fondo de la pagina (carta-fotos y
       qr-mesa tienen uno arriba y otro abajo) ya no hacen falta: existian
       justo porque el de arriba se iba con el scroll. */
    var sobran = document.querySelectorAll('.back-link');
    for (var k = 0; k < sobran.length; k++) {
      if (!barra.contains(sobran[k])) sobran[k].hidden = true;
    }
  }

  /* Cambia el nombre de la pantalla en la barra. Lo usa un flujo de varios
     pasos para decir en cual esta parado (la comanda). */
  function navDonde(texto) {
    var el = document.getElementById('navDonde');
    if (el) el.textContent = texto || '';
  }

  /* El rol al que le llegan los avisos. Duenio y Caja comparten los del
     encargado: en un local de este tamanio son la misma persona mirando. */
  var ROL_DE_AVISOS = {
    Duenio: 'Jonathan', Caja: 'Jonathan', Mozo: 'Mozo', Cocina: 'Cocina'
  };

  function rolDeAvisos(rol) { return ROL_DE_AVISOS[rol] || rol; }

  /* --- Flujo del pedido ---------------------------------------------------
     El pedido del comensal NO va derecho a la cocina: primero lo aprueba el
     mozo. Asi el mozo puede agregar lo que el comensal dijo de palabra y no
     cargo en la carta, y frenar lo que no corresponda.

       Por aprobar -> En cocina -> Cocinando -> Listo -> Entregado
            \-> Rechazado

     'En cocina' es "la comanda llego"; 'Cocinando' es "la estan haciendo".
     Son cosas distintas y es justo lo que el mozo necesita distinguir.   */

  var ESTADOS = ['Por aprobar', 'En cocina', 'Cocinando', 'Listo', 'Entregado'];

  /* Que NO se le cobra al cliente. Una sola lista, en un solo lugar.
     Antes esta regla estaba escrita a mano en cuatro lados distintos y con
     cuatro criterios distintos: caja.html con .neq, app.js con .not(..in..),
     admin.html con un !==, y cobrar.html sin ninguno. Por eso la misma mesa
     podia mostrar un numero en el salon y otro en la caja.               */
  var NO_SE_COBRA = ['Rechazado'];

  // La misma lista en el formato que quiere PostgREST para .not('estado','in',...)
  var NO_SE_COBRA_SQL = '("' + NO_SE_COBRA.join('","') + '")';

  function seCobra(pedido) {
    return !!pedido && NO_SE_COBRA.indexOf(pedido.estado) === -1;
  }

  /* --- Sacar un plato de la cuenta ----------------------------------------
     Cuando vuelve un plato -salio frio, se arrepintieron, no hay
     ingrediente- hay que sacarlo de lo que se cobra. Antes no se podia:
     aprobado el pedido, no habia forma, y el plato devuelto se facturaba
     igual.

     COMO ESTA HECHO, y por que asi:

     La linea NO se borra: se le pone una marca adentro de `lines`. Asi la
     comanda que vio la cocina se sigue leyendo entera, se sabe que paso, y
     se puede volver atras.

     La columna `total` NO se toca NUNCA despues del insert: sigue queriendo
     decir "lo que se pidio". Lo que se cobra se calcula con cobrable(). Se
     puede porque total === suma de price*qty exacta (lo arma pedir.html),
     asi que los dos numeros nunca se contradicen. Mutar `total` habria
     borrado el dato de lo que la mesa pidio de verdad.

     No hay estado nuevo: cuando NO queda ninguna linea viva, el pedido pasa
     a 'Rechazado', que ya quiere decir "esto no se cobra" y que ya esta
     contemplado en liberarSiPagado, en SIN_TERMINAR, en admin y en la carta
     del comensal. Un estado nuevo habria obligado a revisar cada consulta
     que existe y cada una que se escriba despues.                       */

  var ROLES_QUE_SACAN = ['Mozo', 'Duenio'];

  /* Cocina y Caja no sacan: la cocina no decide que se le cobra al cliente,
     y la caja cobra lo que el salon le pasa. El duenio si, porque si no
     Nelly termina entrando como Jonathan y el rastro miente.            */
  function puedeSacar(persona) {
    var yo = persona || quienSoy();
    return !!yo && ROLES_QUE_SACAN.indexOf(yo.rol) !== -1;
  }

  /* Cuatro, cerrados, en este orden. Sin campo de texto libre: el mozo esta
     parado en el salon con el celular en una mano. */
  var MOTIVOS_SACAR = [
    'Se arrepintieron',
    'Salió mal o frío',
    'No hay ingrediente',
    'Lo cargué en la mesa equivocada'
  ];

  function lineasDe(pedido) {
    var ls = pedido && pedido.lines;
    return Object.prototype.toString.call(ls) === '[object Array]' ? ls : [];
  }

  function importeDeLinea(l) {
    return (Number(l.price) || 0) * (Number(l.qty) || 1);
  }

  function lineaSacada(l) { return !!(l && l.anulada); }

  /* Lo que la cocina tiene que HACER: las lineas menos la de cubiertos, que
     no es un plato. Sin esto la comanda decia "1x Cubiertos" como si fuera
     algo que cocinar, y un pedido de solo cubiertos quedaba vivo en la
     pantalla de la cocina sin nada que hacer.                           */
  function lineasDeComanda(pedido) {
    var out = [];
    lineasDe(pedido).forEach(function (l) { if (!l.cubierto) out.push(l); });
    return out;
  }

  function lineasVivas(pedido) {
    var vivas = [];
    lineasDe(pedido).forEach(function (l) { if (!lineaSacada(l)) vivas.push(l); });
    return vivas;
  }

  /* Lo que se le cobra al cliente por este pedido, hoy. */
  function cobrable(pedido) {
    if (!pedido || !seCobra(pedido)) return 0;
    var todas = lineasDe(pedido);
    // Sin detalle de platos no hay de donde restar: vale el total.
    if (!todas.length) return Number(pedido.total) || 0;
    var suma = 0;
    todas.forEach(function (l) { if (!lineaSacada(l)) suma += importeDeLinea(l); });
    return suma;
  }

  /* Plata que YA entro por platos que despues se sacaron y que todavia nadie
     devolvio.

     Ojo con esto, que es la parte facil de arruinar: NO se puede mirar el
     booleano `pagado` del pedido en el momento de preguntar, porque no dice
     cuando se pago. Si se mirara asi, este caso normal inventaria una
     devolucion que nunca existio:

       pedido de 18.200 sin pagar -> vuelve la milanesa, se saca (no se
       debe nada, todavia no pago nada) -> la caja cobra los 8.400 que
       quedaron y marca pagado -> de golpe la milanesa sacada "figura
       pagada" y el sistema pide devolver 9.800 que nunca entraron.

     Por eso al sacar se congela en la linea si ESE plato ya estaba cobrado
     (clave `cobrada`). Las lineas viejas, de antes de esto, no la tienen:
     para esas se cae al booleano del pedido, que es lo unico que hay.   */
  function pendienteDeDevolver(pedido) {
    if (!pedido) return 0;
    var todas = lineasDe(pedido);
    if (!todas.length) {
      return (!seCobra(pedido) && pedido.pagado) ? (Number(pedido.total) || 0) : 0;
    }
    var suma = 0;
    todas.forEach(function (l) {
      if (!lineaSacada(l) || l.devuelto) return;
      var estabaCobrada = (l.cobrada === undefined) ? !!pedido.pagado : !!l.cobrada;
      if (estabaCobrada) suma += importeDeLinea(l);
    });
    return suma;
  }

  /* Saca UNA linea del pedido. indice es la posicion dentro de lines.
     Devuelve { ok, pedido, sacoTodo, devolver } o { ok:false, motivo }.  */
  function sacarPlato(sb, pedido, indice, motivo, quien) {
    if (!sb || !pedido) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    var todas = lineasDe(pedido);
    // 'indice' puede ser uno solo o varios: sacar la ronda entera es lo mismo
    // en una sola escritura, no N updates seguidos.
    var indices = (Object.prototype.toString.call(indice) === '[object Array]')
      ? indice : [indice];
    var linea = todas[indices[0]];
    if (!linea) return Promise.resolve({ ok: false, motivo: 'Ese plato ya no está.' });
    if (indices.every(function (i) { return lineaSacada(todas[i]); })) {
      return Promise.resolve({ ok: false, motivo: 'Eso ya estaba sacado.' });
    }

    var nuevas = todas.map(function (l, i) {
      if (indices.indexOf(i) === -1 || lineaSacada(l)) return l;
      var copia = {};
      for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) copia[k] = l[k];
      copia.anulada = true;
      copia.motivo = motivo || 'Sin motivo';
      copia.por = (quien || 'Salón').slice(0, 40);
      copia.en = new Date().toISOString();
      copia.era = pedido.estado;          // en que punto estaba cuando salio
      copia.cobrada = !!pedido.pagado;    // ver el comentario de arriba
      return copia;
    });

    var quedanVivas = 0;
    nuevas.forEach(function (l) { if (!lineaSacada(l)) quedanVivas++; });
    var sacoTodo = quedanVivas === 0;

    var parche = {
      lines: nuevas,
      updated_at: new Date().toISOString(),
      rechazado_motivo: ((motivo || 'Sin motivo') +
                         (quien ? ' - lo saco ' + quien : '')).slice(0, 200)
    };
    if (sacoTodo) parche.estado = 'Rechazado';

    /* El .eq('estado', ...) es el mismo candado que cambiarEstado: si entre
       que se pinto la pantalla y el toque la cocina movio la comanda, el
       update no pega y se avisa, en vez de escribir sobre un pedido que ya
       no esta donde el mozo cree.                                       */
    return sb.from(TABLE).update(parche)
      .eq('id', pedido.id).eq('estado', pedido.estado)
      .select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos sacarlo. Probá de nuevo.' };
        }
        var fila = (res.data || [])[0];
        if (!fila) {
          return { ok: false, choque: true,
                   motivo: 'Ese pedido lo acaba de cambiar otra persona. Fijate cómo quedó.' };
        }
        avisarSacado(sb, fila, linea, sacoTodo);
        liberarSiPagado(sb, fila);   // puede haber quedado la mesa sin deuda
        return { ok: true, pedido: fila, sacoTodo: sacoTodo,
                 devolver: pendienteDeDevolver(fila) };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos sacarlo. Probá de nuevo.' };
      });
  }

  /* Saca la ronda entera: todas las lineas que sigan vivas, de un saque. */
  function sacarRonda(sb, pedido, motivo, quien) {
    var indices = [];
    lineasDe(pedido).forEach(function (l, i) { if (!lineaSacada(l)) indices.push(i); });
    if (!indices.length) {
      return Promise.resolve({ ok: false, motivo: 'Esa ronda ya estaba sacada.' });
    }
    return sacarPlato(sb, pedido, indices, motivo, quien);
  }

  /* Volver a poner un plato sacado. Existe porque sacar no tiene "estas
     seguro?" -elegir el motivo ES la confirmacion- y porque el mozo no tiene
     ninguna manera de volver a cargar un plato desde su panel: sin esto, un
     toque errado a las 22:30 no se puede arreglar.

     Si el pedido habia quedado en 'Rechazado' por no tener lineas vivas,
     vuelve al estado que tenia cuando lo sacaron, que quedo guardado en la
     linea (`era`).                                                       */
  function volverAPoner(sb, pedido, indice, quien) {
    if (!sb || !pedido) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    var todas = lineasDe(pedido);
    var linea = todas[indice];
    if (!linea || !lineaSacada(linea)) {
      return Promise.resolve({ ok: false, motivo: 'Ese plato no estába sacado.' });
    }
    if (linea.devuelto) {
      return Promise.resolve({ ok: false,
        motivo: 'La caja ya devolvió esa plata. Cargalo como un pedido nuevo.' });
    }

    var nuevas = todas.map(function (l, i) {
      if (i !== indice) return l;
      var copia = {};
      for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) copia[k] = l[k];
      delete copia.anulada; delete copia.motivo; delete copia.por;
      delete copia.en; delete copia.era; delete copia.cobrada;
      return copia;
    });

    var parche = { lines: nuevas, updated_at: new Date().toISOString() };
    if (!seCobra(pedido)) parche.estado = linea.era || 'Por aprobar';

    return sb.from(TABLE).update(parche)
      .eq('id', pedido.id).eq('estado', pedido.estado)
      .select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos volver a ponerlo.' };
        }
        var fila = (res.data || [])[0];
        if (!fila) {
          return { ok: false, choque: true,
                   motivo: 'Ese pedido lo acaba de cambiar otra persona. Fijate cómo quedó.' };
        }
        /* Si volvio a la vida y la cocina lo tenia, hay que avisarle: dejo de
           estar tachado y hay que hacerlo.                               */
        if (parche.estado && SIN_TERMINAR.indexOf(parche.estado) !== -1) {
          avisar(sb, 'Cocina', 'Volvió un plato a la comanda',
                 fila.mesa + ' - ' + (linea.name || 'un plato') + ': hay que hacerlo.',
                 fila.id, 'cocina.html', true);
        }
        return { ok: true, pedido: fila };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos volver a ponerlo.' };
      });
  }

  /* La caja marca que ya le devolvio la plata al cliente. */
  function marcarDevuelto(sb, pedido, quien) {
    if (!sb || !pedido) return Promise.resolve(false);
    var nuevas = lineasDe(pedido).map(function (l) {
      if (!lineaSacada(l) || l.devuelto) return l;
      var estabaCobrada = (l.cobrada === undefined) ? !!pedido.pagado : !!l.cobrada;
      if (!estabaCobrada) return l;
      var copia = {};
      for (var k in l) if (Object.prototype.hasOwnProperty.call(l, k)) copia[k] = l[k];
      copia.devuelto = true;
      copia.devuelto_por = (quien || 'Caja').slice(0, 40);
      copia.devuelto_en = new Date().toISOString();
      return copia;
    });
    return sb.from(TABLE)
      .update({ lines: nuevas, updated_at: new Date().toISOString() })
      .eq('id', pedido.id)
      .then(function (res) { return !res.error; }, function () { return false; });
  }

  /* A quien se le avisa cuando sale un plato.

     A la cocina SOLO si llego a verlo: aprobado_en lo escribe unicamente
     aprobarPedido, asi que null quiere decir que la comanda nunca salio del
     panel del mozo y no hay a quien frenar.

     A la caja (rol 'Jonathan', que comparten Caja y Duenio) SOLO si hay
     plata para devolver. Sin este aviso la devolucion no le llega a nadie:
     la ficha queda esperando en una pantalla que Cecilia puede no estar
     mirando.                                                             */
  function avisarSacado(sb, pedido, linea, sacoTodo) {
    var plato = (linea && linea.name) || 'un plato';

    if (pedido.aprobado_en) {
      avisar(sb, 'Cocina',
             sacoTodo ? 'Anularon una comanda' : 'Sacaron un plato de una comanda',
             pedido.mesa + ' - ' + (sacoTodo ? 'no la hagas' : plato + ': no lo hagas'),
             pedido.id, 'cocina.html', true);
    }

    var devolver = pendienteDeDevolver(pedido);
    if (devolver > 0) {
      avisar(sb, 'Jonathan', 'Hay que devolver plata',
             pedido.mesa + ' - ' + money(devolver) + ' de ' + plato + '.',
             pedido.id, 'caja.html', true);
    }
  }

  /* Quien se entera de cada paso. Esta tabla es la UNICA fuente: si un estado
     esta aca, avisa; si no, no. Antes cada pantalla decidia por su cuenta y
     por eso habia pasos mudos.                                           */
  var AVISOS = {
    'Por aprobar': { a: 'Mozo',   titulo: 'Pedido para aprobar',
                     url: 'mozo.html',   insistir: true },
    'En cocina':   { a: 'Cocina', titulo: 'Comanda nueva',
                     url: 'cocina.html', insistir: true, wa: true },
    'Cocinando':   { a: 'Mozo',   titulo: 'La cocina lo esta cocinando',
                     url: 'mozo.html',   insistir: false },
    'Listo':       { a: 'Mozo',   titulo: 'Listo para llevar a la mesa',
                     url: 'mozo.html',   insistir: true, wa: true },
    'Entregado':   { a: 'Mozo',   titulo: 'Pedido entregado',
                     url: 'mozo.html',   insistir: false },
    'Rechazado':   { a: null }
  };

  /* Manda el aviso que corresponde al estado en que quedo el pedido.
     No bloquea a quien la llama y nunca rompe la operacion.              */
  function avisarEstado(sb, pedido, extra) {
    if (!pedido) return Promise.resolve(null);
    var cfg = AVISOS[pedido.estado];
    if (!cfg || !cfg.a) return Promise.resolve(null);

    var cuerpo = pedido.mesa + ' - ' + money(cobrable(pedido)) +
                 (pedido.cliente ? ' - ' + pedido.cliente : '') +
                 (extra ? '\n' + extra : '');

    /* WhatsApp solo en los pasos criticos, no en todos: el push ya avisa de
       todo, es instantaneo y gratis. WhatsApp cuesta por mensaje y fuera de
       la ventana de 24h necesita plantilla aprobada, asi que duplicar los
       seis eventos es caro y ademas hace vibrar el telefono dos veces por lo
       mismo. Aca es respaldo de lo que no se puede perder.
       Va aparte del push: que Twilio falle no toca el aviso que funciona. */
    if (cfg.wa) {
      var detalle = lineasDeComanda(pedido).map(function (l) {
        return l.qty + 'x ' + l.name;
      }).join(', ');
      avisarWhatsapp(sb, {
        rol: cfg.a,
        texto: cfg.titulo + ' - ' + pedido.mesa + '\n' + detalle +
               '\nTotal: ' + money(cobrable(pedido)) +
               (pedido.detalle_comensal ? '\nOJO: ' + pedido.detalle_comensal : '')
      });
    }

    return avisar(sb, cfg.a, cfg.titulo, cuerpo, pedido.id, cfg.url, cfg.insistir)
      .then(function (r) {
        if (!r.ok && r.codigo !== 'sin-destinos') {
          console.warn('[La Positiva] aviso de "' + pedido.estado + '" no llegó a ' +
                       cfg.a + ': ' + (r.motivo || 'motivo desconocido'));
        }
        return r;
      });
  }

  /* Cambia el estado y avisa. Todas las pantallas pasan por aca para que
     ninguna transicion quede sin su notificacion.                        */
  function cambiarEstado(sb, id, nuevo, campos, esperado) {
    if (!sb || !id) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    var parche = { estado: nuevo, updated_at: new Date().toISOString() };
    for (var k in (campos || {})) {
      if (Object.prototype.hasOwnProperty.call(campos, k)) parche[k] = campos[k];
    }

    /* 'esperado' es desde que estado se supone que sale el pedido. Cuando
       viene, el update solo pega si el pedido TODAVIA esta ahi.

       Sin esto el update era ciego y se pisaban entre si: Jonathan aprueba
       una comanda a las 20:31:02, Miguel la rechaza a las 20:31:04 desde su
       celular sin haber visto que ya estaba aprobada, y la cocina se queda
       sin la comanda sin que suene nada en ningun lado. Con el filtro, al
       segundo no le pega el update y se le avisa que mire la pantalla.

       Se usa .select() (array) y no .single(), porque .single() trata el
       "no cambie nada" como error de base y no se puede distinguir de una
       caida de conexion.                                                 */
    var q = sb.from(TABLE).update(parche).eq('id', id);
    if (esperado) q = q.eq('estado', esperado);

    return q.select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No se pudo cambiar el estado. Probá de nuevo.' };
        }
        var fila = (res.data || [])[0];
        if (!fila) {
          return { ok: false, choque: true,
                   motivo: 'Ese pedido lo acaba de cambiar otra persona. Fijate cómo quedó.' };
        }
        avisarEstado(sb, fila);              // sin await: no frena la pantalla
        return { ok: true, pedido: fila };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No se pudo cambiar el estado. Probá de nuevo.' };
      });
  }

  /* El mozo manda la comanda a la cocina. */
  function aprobarPedido(sb, id, quien, detalle) {
    return cambiarEstado(sb, id, 'En cocina', {
      aprobado_por: (quien || 'Mozo').slice(0, 40),
      aprobado_en: new Date().toISOString(),
      detalle_comensal: (detalle || '').slice(0, 500) || null
    }, 'Por aprobar');
  }

  function rechazarPedido(sb, id, quien, motivo) {
    /* Ya NO pisa aprobado_por: esa columna quiere decir una sola cosa, quien
       mando la comanda a la cocina, y se usa para saber si la cocina llego a
       ver el pedido. Quien lo saco va en rechazado_motivo.               */
    return cambiarEstado(sb, id, 'Rechazado', {
      rechazado_motivo: ((motivo || 'Sin motivo') +
                         (quien ? ' - lo saco ' + quien : '')).slice(0, 200)
    }, 'Por aprobar');
  }

  /* Un solo boton en la cocina: la recibieron Y la estan haciendo. */
  function tomarPedido(sb, id) {
    return cambiarEstado(sb, id, 'Cocinando', { tomado_en: new Date().toISOString() },
                         'En cocina');
  }

  /* Aviso de pago confirmado.
     Vive aca y no en cada pantalla porque estaba pasando lo peor: caja.html
     avisaba y cobrar.html no. El mismo hecho -confirmar un pago- notificaba
     o no segun desde donde se hiciera, y el mozo que cobraba con el QR en el
     salon dejaba a Jonathan sin enterarse.                               */
  /* Cuando se cobra el ultimo pedido impago de la mesa, la cuenta pasa sola
     a 'Limpieza'. Antes cobrar no tocaba la sesion: la mesa seguia figurando
     abierta hasta que alguien entraba a mano a mesas.html, asi que una mesa ya
     pagada se veia igual que una comiendo y se perdia rotacion.

     No cierra la sesion: cerrar es decir "la mesa esta libre", y eso lo sabe
     quien la levanta, no la caja.                                        */
  function liberarSiPagado(sb, pedido) {
    if (!sb || !pedido || !pedido.sesion_id) return Promise.resolve(false);

    return sb.from(TABLE).select('id', { count: 'exact', head: true })
      .eq('sesion_id', pedido.sesion_id)
      .eq('pagado', false)
      .not('estado', 'in', NO_SE_COBRA_SQL)
      .then(function (res) {
        if (res.error || (res.count || 0) > 0) return false;   // todavia deben
        return sb.from(SESIONES_TABLE)
          .update({ estado: 'Limpieza' })
          .eq('id', pedido.sesion_id).is('cerrada_en', null)
          .then(function (up) { return !up.error; }, function () { return false; });
      }, function () { return false; });
  }

  function avisarPago(sb, pedido) {
    if (!pedido) return Promise.resolve({ ok: false, motivo: 'Sin pedido.' });

    // Sin bloquear el aviso: que falle la liberacion no puede frenar el cobro.
    liberarSiPagado(sb, pedido);
    var cuerpo = pedido.mesa + ' pag\u00f3 ' + money(cobrable(pedido)) + '. Ya pod\u00e9s seguir.';

    avisarWhatsapp(sb, {
      rol: 'Jonathan',
      texto: 'Pago confirmado - ' + pedido.mesa + '\nTotal: ' + money(cobrable(pedido))
    });

    return avisar(sb, 'Jonathan', 'Pago confirmado', cuerpo, pedido.id, 'caja.html', false)
      .then(function (r) {
        if (!r.ok && r.codigo !== 'sin-destinos') {
          console.warn('[La Positiva] aviso de pago no llegó: ' +
                       (r.motivo || 'motivo desconocido'));
        }
        return r;
      });
  }

  /* --- Notas entre el mozo y la cocina ------------------------------------ */
  function notasDePedido(sb, pedidoId) {
    if (!sb || !pedidoId) return Promise.resolve([]);
    return sb.from(NOTAS_TABLE).select('*')
      .eq('pedido_id', pedidoId).order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { humanError(res.error); return []; }
        return res.data || [];
      }, function (e) { humanError(e); return []; });
  }

  /* Una nota tambien avisa: si la cocina pregunta algo y el mozo no se
     entera, la pregunta no sirve de nada.                                */
  function agregarNota(sb, pedido, autor, texto) {
    var limpio = String(texto || '').trim().slice(0, 500);
    if (!sb || !pedido || !limpio) {
      return Promise.resolve({ ok: false, motivo: 'Escrib\u00ed algo antes de mandar.' });
    }
    return sb.from(NOTAS_TABLE)
      .insert({ pedido_id: pedido.id, autor: autor, texto: limpio })
      .select().single()
      .then(function (res) {
        if (res.error) { humanError(res.error); return { ok: false, motivo: 'No se pudo mandar.' }; }
        var para = (autor === 'Cocina') ? 'Mozo' : 'Cocina';
        avisar(sb, para,
               (autor === 'Cocina' ? 'La cocina pregunta' : 'El mozo avisa') +
               ' - ' + pedido.mesa,
               limpio, pedido.id,
               para === 'Cocina' ? 'cocina.html' : 'mozo.html', true);
        return { ok: true, nota: res.data };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No se pudo mandar.' };
      });
  }

  /* --- Estado de las mesas ------------------------------------------------
     Una mesa esta en uno de cuatro estados:

       Libre        no tiene sesion abierta
       Ocupada      alguien esta sentado (con o sin pedidos todavia)
       Limpieza     pago todo, falta levantar
       Reservada    apartada, no sentar a nadie

     Los tres ultimos son una sesion abierta con su columna 'estado'. Libre es
     la AUSENCIA de sesion, que es lo que permite que "libre" exista sin tener
     que crear una fila por cada mesa vacia.

     El indice unico parcial de la base (una sola sesion abierta por mesa) es
     lo que impide que dos personas sienten gente en la misma mesa.        */

  /* Devuelve null si la consulta fallo. Esa diferencia con [] importa: un
     salon vacio y un salon que no se pudo leer se ven igual en pantalla, y
     el segundo mostraria las doce mesas libres cuando en realidad estan
     todas ocupadas.                                                       */
  function mesasDelLocal(sb) {
    if (!sb) return Promise.resolve(null);
    return sb.from(MESAS_TABLE).select('*').eq('activa', true)
      .order('orden', { ascending: true })
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return res.data || [];
      }, function (e) { humanError(e); return null; });
  }

  /* El plano del salon: cada mesa del catalogo con su estado y, si esta
     ocupada, su cuenta. Una sola consulta de sesiones y otra de pedidos para
     todas: pedir una por mesa no aguanta un servicio.                     */
  function planoDelSalon(sb) {
    if (!sb) return Promise.resolve(null);
    return Promise.all([mesasDelLocal(sb), mesasAbiertas(sb)])
      .then(function (r) {
        var mesas = r[0];
        var abiertas = r[1];
        // Cualquiera de las dos que falle invalida el plano entero.
        if (mesas === null || abiertas === null) return null;

        var porMesa = {};
        abiertas.forEach(function (a) { porMesa[a.mesa] = a; });

        return mesas.map(function (m) {
          // Las sesiones guardan "Mesa 7"; el catalogo guarda "7".
          var cuenta = porMesa['Mesa ' + m.numero] || porMesa[m.numero] || null;
          return {
            mesa: m,
            etiqueta: 'Mesa ' + m.numero,
            estado: estadoReal(cuenta),
            cuenta: cuenta
          };
        });
      });
  }

  /* La columna 'estado' dice lo que alguien marco; la cuenta dice lo que
     esta pasando. Cuando se contradicen, manda la cuenta:

       reservada pero ya pidieron  -> estan sentados, es una mesa ocupada
       para limpiar pero deben     -> volvieron a pedir, todavia no se levanta

     Sin esto, una mesa con gente comiendo podia quedar contada como
     reservada, o pintada de verde como si estuviera libre para limpiar. */
  function estadoReal(cuenta) {
    if (!cuenta) return 'Libre';
    var marcado = cuenta.sesion.estado || 'Ocupada';
    if (marcado === 'Reservada' && cuenta.rondas > 0) return 'Ocupada';
    if (marcado === 'Limpieza' && cuenta.debe > 0) return 'Ocupada';
    return marcado;
  }

  /* Sentar gente. Se usa cuando llegan, ANTES de que pidan: hasta ahora la
     mesa aparecia recien con el primer pedido.                            */
  function abrirMesa(sb, etiqueta, quien, estado) {
    if (!sb || !etiqueta) return Promise.resolve({ ok: false, motivo: 'Falta la mesa.' });
    return buscarAbierta(sb, etiqueta).then(function (ya) {
      if (ya) {
        // Otro la abrio primero. No es un error: es el indice haciendo su trabajo.
        return { ok: false, ocupada: true,
                 motivo: etiqueta + ' ya está abierta' +
                         (ya.abierta_por ? ' (la abrió ' + ya.abierta_por + ')' : '') + '.' };
      }
      return sb.from(SESIONES_TABLE)
        .insert({ mesa: etiqueta, estado: estado || 'Ocupada',
                  abierta_por: (quien || '').slice(0, 40) || null })
        .select().single()
        .then(function (res) {
          if (res.error) {
            if (res.error.code === '23505') {
              return { ok: false, ocupada: true,
                       motivo: etiqueta + ' la acaba de abrir otra persona.' };
            }
            humanError(res.error);
            return { ok: false, motivo: 'No pudimos abrir la mesa.' };
          }
          return { ok: true, sesion: res.data };
        });
    });
  }

  /* Cambia el estado de una mesa abierta (Ocupada / Limpieza / Reservada). */
  function estadoDeMesa(sb, sesionId, estado) {
    if (!sb || !sesionId) return Promise.resolve(false);
    return sb.from(SESIONES_TABLE).update({ estado: estado })
      .eq('id', sesionId).is('cerrada_en', null)
      .then(function (res) { return !res.error; }, function () { return false; });
  }

  /* Cuanta gente hay sentada. Lo carga el mozo cuando toma la comanda.

     Va en la SESION y no en el pedido a proposito: la gente es de la mesa,
     no de la ronda. Una mesa de cuatro que pide tres veces sigue siendo de
     cuatro, y si se escribiera en cada pedido habria tres numeros que
     mantener de acuerdo.

     No pisa con nulo: si el mozo no declara cuantos son, queda lo que ya
     hubiera. Que falle no rompe nada -es un dato de color al lado del
     pedido-, por eso devuelve un booleano y no frena a nadie.          */
  function guardarComensales(sb, sesionId, cuantos) {
    if (!sb || !sesionId) return Promise.resolve(false);
    var n = Math.round(Number(cuantos));
    if (!isFinite(n) || n < 1) return Promise.resolve(false);
    n = Math.min(99, n);                       // el check de la base corta en 99
    return sb.from(SESIONES_TABLE).update({ comensales: n })
      .eq('id', sesionId).is('cerrada_en', null)
      .then(function (res) { return !res.error; }, function () { return false; });
  }

  /* Reservar una mesa libre: se abre una sesion sin gente todavia. No es un
     sistema de reservas -no hay hora ni nombre-: es el cartelito de "no
     sentar aca", que es lo que el mozo necesita en el momento.

     Va en UNA escritura, no insert + update: asi no existe el instante en
     que la mesa figura ocupada, y lo que se devuelve es lo que quedo en la
     base y no el valor previo.                                            */
  function reservarMesa(sb, etiqueta, quien) {
    return abrirMesa(sb, etiqueta, quien, 'Reservada');
  }

  /* --- Sesiones de mesa ---------------------------------------------------
     Una sesion = una cuenta = muchas rondas. Se abre con el primer pedido de
     la mesa y se cierra cuando paga y se levanta. Sin esto, una mesa que pide
     tres veces son tres pedidos sueltos y nadie sabe que es la misma cuenta.

     La base garantiza una sola sesion abierta por mesa con un indice unico
     parcial; aca solo hay que contemplar la carrera.                     */

  /* Devuelve la sesion abierta de la mesa; si no hay, la abre.
     Resuelve con la fila, o null si no se pudo.                          */
  function sesionDeMesa(sb, mesa) {
    if (!sb || !mesa) return Promise.resolve(null);

    return buscarAbierta(sb, mesa).then(function (existente) {
      if (existente) return existente;

      return sb.from(SESIONES_TABLE).insert({ mesa: mesa }).select().single()
        .then(function (res) {
          if (!res.error) return res.data;
          /* 23505 = otro comensal de la misma mesa abrio la sesion entre
             nuestra busqueda y nuestro insert. No es un error: es justo lo
             que el indice tiene que impedir. Se reusa la de el.        */
          if (res.error.code === '23505') return buscarAbierta(sb, mesa);
          humanError(res.error);
          return null;
        });
    });
  }

  function buscarAbierta(sb, mesa) {
    return sb.from(SESIONES_TABLE).select('*')
      .eq('mesa', mesa).is('cerrada_en', null)
      .order('abierta_en', { ascending: false })
      .limit(1).maybeSingle()
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return res.data || null;
      }, function (e) { humanError(e); return null; });
  }

  /* Todos los pedidos de una sesion, con el total acumulado. */
  function cuentaDeSesion(sb, sesionId) {
    if (!sb || !sesionId) return Promise.resolve(null);
    return sb.from(TABLE).select('*')
      .eq('sesion_id', sesionId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        return resumirCuenta(res.data || []);
      }, function (e) { humanError(e); return null; });
  }

  /* El resumen se calcula en un solo lugar para que la mesa, la caja y el
     cliente muestren SIEMPRE el mismo numero.                            */
  var SIN_TERMINAR = ['Por aprobar', 'En cocina', 'Cocinando', 'Listo'];

  function resumirCuenta(pedidos) {
    var total = 0, pagado = 0, sinEntregar = 0, enCurso = 0;
    var devolver = 0, sacado = 0;

    pedidos.forEach(function (p) {
      var t = Number(p.total) || 0;

      var cobra = cobrable(p);
      var aDevolver = pendienteDeDevolver(p);
      devolver += aDevolver;
      // Lo que salio de la cuenta: la diferencia entre lo pedido y lo cobrable.
      sacado += Math.max(0, t - cobra);

      if (!seCobra(p)) {
        /* Sacado de la cuenta: no se cobra. Antes SI se cobraba -este era el
           bug-: el boton Rechazar existia desde siempre y el plato rechazado
           igual sumaba en el total de la mesa y en lo que el cliente debia.

           Pero no puede desaparecer sin mas: con tarjeta el pedido nace
           pagado (pedir.html), asi que un rechazado pagado es plata que YA
           entro y hay que devolver. Si se descartara a ciegas, esa plata no
           aparecia en ninguna pantalla.                                  */
        return;
      }

      /* Se cobra lo que quedo vivo, no el total del insert: si volvio una
         milanesa de tres, se cobran las otras dos.                       */
      total += cobra;
      if (p.pagado) pagado += cobra;
      if (p.estado !== 'Entregado') sinEntregar++;
      // Distinto de 'sinEntregar': lo sacado no esta entregado, pero tampoco
      // esta en curso. Esto cuenta lo que la cocina todavia debe.
      if (SIN_TERMINAR.indexOf(p.estado) !== -1) enCurso++;
    });

    return {
      pedidos: pedidos,
      rondas: pedidos.length,
      total: total,
      pagado: pagado,
      debe: Math.max(0, total - pagado),
      sinEntregar: sinEntregar,
      enCurso: enCurso,
      devolver: devolver,     // ya pagado, despues sacado: hay que devolverlo
      sacado: sacado          // cuanto salio de la cuenta (para el duenio)
    };
  }

  /* Las mesas con la cuenta abierta, con su resumen. Una sola consulta de
     pedidos para todas: pedir una por mesa no escala en un servicio.    */
  function mesasAbiertas(sb) {
    if (!sb) return Promise.resolve(null);
    return sb.from(SESIONES_TABLE).select('*')
      .is('cerrada_en', null)
      .order('abierta_en', { ascending: true })
      .then(function (res) {
        if (res.error) { humanError(res.error); return null; }
        var sesiones = res.data || [];
        if (!sesiones.length) return [];

        var ids = sesiones.map(function (x) { return x.id; });
        return sb.from(TABLE).select('*').in('sesion_id', ids)
          .order('created_at', { ascending: true })
          .then(function (r2) {
            if (r2.error) { humanError(r2.error); return null; }
            var porSesion = {};
            (r2.data || []).forEach(function (p) {
              (porSesion[p.sesion_id] = porSesion[p.sesion_id] || []).push(p);
            });
            return sesiones.map(function (ses) {
              var resumen = resumirCuenta(porSesion[ses.id] || []);
              resumen.sesion = ses;
              resumen.mesa = ses.mesa;
              return resumen;
            });
          });
      }, function (e) { humanError(e); return null; });
  }

  /* --- Las rondas de una mesa, juntas -------------------------------------
     El duenio, mirando cocina y mozo: "es como que fueran separadas, pero en
     realidad no lo son; la gente simplemente pidio a destiempo, la bebida, un
     cubierto mas, alguien se sumo a la mesa".

     Los pedidos YA traen sesion_id, que es la visita de la mesa. Lo unico que
     faltaba era agruparlos para pintarlos. Esto NO toca estados: cada ronda
     sigue con el suyo, y por eso el resultado lleva la lista de rondas cruda
     y no un estado unico de la mesa. Una mesa puede tener una ronda en el
     fuego y otra lista al mismo tiempo, y asi se tiene que ver.

     'sesiones' es opcional: { id: fila }, para poder mostrar la mesa y cuanta
     gente hay. Sin eso se cae al nombre de mesa que trae el pedido.      */
  function agruparPorMesa(pedidos, sesiones) {
    var mapa = sesiones || {};
    var orden = [];
    var cajas = Object.create(null);

    (pedidos || []).forEach(function (p) {
      /* Sin sesion, el pedido es su propia caja. Pasa con el mostrador y con
         el pedido que entro cuando la cuenta no se pudo abrir (pedir.html lo
         deja entrar igual a proposito). Agruparlos por nombre de mesa
         juntaria dos visitas distintas de la misma mesa en un solo recuadro,
         que es exactamente el error contrario al que estamos arreglando. */
      var clave = p.sesion_id ? ('s' + p.sesion_id) : ('p' + p.id);
      var caja = cajas[clave];
      if (!caja) {
        var ses = p.sesion_id ? (mapa[p.sesion_id] || null) : null;
        var cuantos = ses && ses.comensales ? Number(ses.comensales) : null;
        caja = cajas[clave] = {
          clave: clave,
          mesa: (ses && ses.mesa) || p.mesa,
          sesion: ses,
          sesionId: p.sesion_id || null,
          comensales: isFinite(cuantos) && cuantos > 0 ? cuantos : null,
          sinCuenta: !p.sesion_id,
          rondas: [],
          desde: p.created_at,
          ultima: p.created_at
        };
        orden.push(caja);
      }
      caja.rondas.push(p);
      if (new Date(p.created_at) < new Date(caja.desde)) caja.desde = p.created_at;
      if (new Date(p.created_at) > new Date(caja.ultima)) caja.ultima = p.created_at;
    });

    // Adentro de la mesa, en el orden en que pidieron: ronda 1, ronda 2...
    orden.forEach(function (c) {
      c.rondas.sort(function (a, b) {
        return new Date(a.created_at) - new Date(b.created_at);
      });
    });
    return orden;
  }

  /* Las sesiones de una lista de ids, en UNA consulta. La cocina no carga el
     salon entero -no le hace falta y seria una consulta cara cada 7 segundos-,
     pero si necesita el nombre de la mesa y cuanta gente hay sentada.
     Que falle devuelve {} y no rompe nada: se pierde el "4 personas".     */
  function sesionesPorId(sb, ids) {
    var limpios = [];
    (ids || []).forEach(function (x) {
      if (x && limpios.indexOf(x) === -1) limpios.push(x);
    });
    if (!sb || !limpios.length) return Promise.resolve({});
    return sb.from(SESIONES_TABLE)
      .select('id, mesa, estado, comensales, abierta_en, cerrada_en, qr_pedido_en, qr_pedido_por')
      .in('id', limpios)
      .then(function (res) {
        if (res.error) { humanError(res.error); return {}; }
        var m = {};
        (res.data || []).forEach(function (s) { m[s.id] = s; });
        return m;
      }, function (e) { humanError(e); return {}; });
  }

  /* Volver a avisarle al mozo que una ronda sigue esperando en el pase.
     Se puede tocar las veces que haga falta: NO escribe nada en el pedido, no
     cambia el estado y no genera una comanda nueva. Es el mismo push que ya
     manda avisarEstado(), por el mismo canal, con otro texto.

     El tag que arma el service worker sale del titulo, asi que el segundo
     aviso PISA al primero en la pantalla del mozo en vez de acumular cuatro
     notificaciones iguales -y con renotify vuelve a sonar igual.          */
  function reavisarMozo(sb, pedido, quien) {
    if (!sb || !pedido) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    }
    var detalle = lineasDeComanda(pedido).map(function (l) {
      return l.qty + 'x ' + l.name;
    }).join(', ');
    return avisar(sb, 'Mozo', 'Sigue esperando en el pase',
                  pedido.mesa + (detalle ? ' - ' + detalle : '') +
                  '. Está listo y todavía no lo llevaron.' +
                  (quien ? ' Avisa ' + quien + '.' : ''),
                  pedido.id, 'mozo.html', true);
  }

  /* Cierra la cuenta. La mesa queda libre y el proximo pedido abre una nueva. */
  function cerrarSesion(sb, id, quien, forzar) {
    if (!sb || !id) return Promise.resolve(false);

    /* Cerrar una mesa con pedidos todavia en curso deja esos pedidos colgando
       de una cuenta cerrada: siguen apareciendo en el panel del mozo, pero su
       importe ya no entra en ninguna cuenta abierta. Paso de verdad.
       Es distinto de cerrar con saldo impago -eso es normal, se cobro en
       efectivo y no se marco-, por eso este chequeo va aparte.          */
    var previo = forzar ? Promise.resolve(0) : sb.from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('sesion_id', id).in('estado', SIN_TERMINAR)
      .then(function (res) { return res.error ? 0 : (res.count || 0); },
            function () { return 0; });

    return previo.then(function (vivos) {
      if (vivos > 0) return { bloqueado: true, enCurso: vivos };
      return cerrarAhora(sb, id, quien);
    });
  }

  function cerrarAhora(sb, id, quien) {
    return sb.from(SESIONES_TABLE)
      .update({ cerrada_en: new Date().toISOString(),
                cerrada_por: (quien || '').slice(0, 40) || null })
      .eq('id', id).is('cerrada_en', null)      // no se cierra dos veces
      .select()
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return !!(res.data && res.data.length);
      }, function (e) { humanError(e); return false; });
  }

  /* --- Ajustes del local --------------------------------------------------
     Un clave/valor, como el `ajustes` de Liderapp: los numeros del local que
     el duenio cambia solo, sin tocar codigo ni volver a publicar.        */
  function ajustes(sb) {
    if (!sb) return Promise.resolve({});
    return sb.from(AJUSTES_TABLE).select('clave, valor').then(function (res) {
      if (res.error) { humanError(res.error); return {}; }
      var m = {};
      (res.data || []).forEach(function (a) { m[a.clave] = a.valor; });
      return m;
    }, function (e) { humanError(e); return {}; });
  }

  function guardarAjuste(sb, clave, valor, quien) {
    if (!sb || !clave) return Promise.resolve(false);
    return sb.from(AJUSTES_TABLE).upsert({
      clave: clave,
      valor: valor === null || valor === undefined ? null : String(valor),
      actualizado_por: (quien || '').slice(0, 40) || null,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'clave' })
      .then(function (res) { if (res.error) humanError(res.error); return !res.error; },
            function (e) { humanError(e); return false; });
  }

  /* --- El tema (nombre, color, letra, forma) -------------------------------
     El motor vive en tema.js, que se carga SIN defer en el <head> de cada
     pantalla y ya pinto el tema de la copia local antes del primer pintado.
     Lo unico que falta es traer de la base lo que haya cambiado y dejarlo
     guardado para la proxima vez.

     Va suelto y despues, a proposito: es una consulta de red y no puede
     frenar la pantalla. Si falla -sin internet, Supabase caido, RLS- no
     pasa NADA: queda el tema de la copia local, y si tampoco hay copia
     local queda el diseno de fabrica de styles.css. El tema nunca puede
     dejar una pantalla en blanco en medio de un turno.                     */
  function temaGuardado(sb) {
    if (!sb || !global.LP_TEMA) return Promise.resolve(null);
    return sb.from(AJUSTES_TABLE).select('clave, valor')
      .in('clave', global.LP_TEMA.CLAVES)
      .then(function (res) {
        if (res.error) return null;
        var m = {};
        (res.data || []).forEach(function (a) { if (a.valor) m[a.clave] = a.valor; });
        return global.LP_TEMA.normalizar(m);
      }, function () { return null; });
  }

  /* Trae el tema y, si cambio respecto de lo que ya se esta viendo, lo
     aplica y actualiza la copia local. Compararlo antes evita reescribir el
     <style> en cada carga, que en la vista previa se ve como un parpadeo. */
  function refrescarTema() {
    if (!global.LP_TEMA) return Promise.resolve(null);
    var sb = client();
    if (!sb) return Promise.resolve(null);
    return temaGuardado(sb).then(function (v) {
      if (!v) return null;
      var antes = JSON.stringify(global.LP_TEMA.leerCache() || {});
      global.LP_TEMA.guardarCache(v);
      if (JSON.stringify(v) !== antes) global.LP_TEMA.aplicar(v);
      else global.LP_TEMA.escribirNombre(v.nombre_local);
      return v;
    }, function () { return null; });
  }

  /* Guarda las claves del tema de una sola vez. Cada una es un renglon en
     la_positiva_ajustes, la misma tabla clave/valor del cubierto: no hace
     falta ninguna tabla nueva. */
  function guardarTema(sb, valores, quien) {
    if (!sb || !global.LP_TEMA) return Promise.resolve(false);
    var v = global.LP_TEMA.normalizar(valores);
    var ahora = new Date().toISOString();
    var filas = global.LP_TEMA.CLAVES.map(function (c) {
      return { clave: c, valor: String(v[c]),
               actualizado_por: (quien || '').slice(0, 40) || null, actualizado_en: ahora };
    });
    return sb.from(AJUSTES_TABLE).upsert(filas, { onConflict: 'clave' })
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        global.LP_TEMA.guardarCache(v);
        return true;
      }, function (e) { humanError(e); return false; });
  }

  /* El nombre del local para los textos que se arman en JavaScript (la hoja
     del QR, el mensaje de WhatsApp, el rotulo del plano). En el HTML fijo se
     usa [data-nombre-local], que lo llena tema.js solo. */
  function nombreLocal() {
    return (global.LP_TEMA && global.LP_TEMA.nombre()) || 'La Positiva';
  }

  /* --- El cubierto ---------------------------------------------------------
     Es fijo por mesa. NO es una regla de cobro nueva: es UNA LINEA MAS en el
     primer pedido que se cobra de la mesa. Asi pasa por todo lo que ya
     existe -cobrable, pagado, caja, QR, devoluciones, sacar- sin una sola
     linea de logica de plata nueva. Se congela al pedir: cambiar el importe
     no reescribe mesas abiertas. Y si Nelly lo quiere perdonar, lo saca con
     "Sacar un plato", con motivo, como cualquier otra linea.

     Se cuenta "primer pedido QUE SE COBRA": si el primer pedido se anulo
     entero y la mesa vuelve a pedir, el cubierto entra de nuevo, porque el
     anterior se fue con lo anulado.

     Limite conocido: el chequeo se hace en el navegador justo antes del
     insert. Dos comensales de la misma mesa tocando Enviar en el mismo
     medio segundo pueden meter dos cubiertos. En un bodegon es raro, y si
     pasa el mozo lo ve en la cuenta y saca uno: justo para eso es una linea.*/
  var CUBIERTO_ID = 'cubiertos';

  function importeCubierto(sb) {
    /* El interruptor del panel tecnico gana sobre el importe: apagado es
       apagado, aunque quede un numero cargado en la base. Se pregunta aca
       porque este es el unico camino por el que la linea del cubierto
       entra a un pedido.                                              */
    if (!func('f_cubiertos')) return Promise.resolve(0);
    return ajustes(sb).then(function (m) {
      // Solo digitos: "1.500" escrito a mano en la base es 1500, no 1,5.
      var n = Math.round(Number(String(m.cubierto_por_mesa || '').replace(/[^0-9]/g, '')));
      return isFinite(n) && n > 0 ? n : 0;
    });
  }

  function cubiertoParaSesion(sb, sesionId) {
    if (!sb || !sesionId) return Promise.resolve(null);
    return importeCubierto(sb).then(function (importe) {
      if (!importe) return null;
      return sb.from(TABLE).select('id', { count: 'exact', head: true })
        .eq('sesion_id', sesionId)
        .not('estado', 'in', NO_SE_COBRA_SQL)
        .then(function (res) {
          // Ante la duda (error), no se cobra: es mejor perder 1.500 que
          // cobrarlos dos veces.
          if (res.error || (res.count || 0) > 0) return null;
          return { id: CUBIERTO_ID, name: 'Cubiertos', qty: 1, price: importe, cubierto: true };
        }, function () { return null; });
    });
  }

  /* --- Mostrar o no el renglon del cubierto --------------------------------
     OJO CON ESTO, que es facil de leer al reves: el cubierto se cobra
     SIEMPRE y SIEMPRE esta adentro del total. Este ajuste no mueve un peso
     de lo que se cobra ni toca cubiertoParaSesion(): lo unico que decide es
     si el comensal ve el renglon "Cubiertos $1.500" desglosado, o si lo ve
     incluido en el total.

     Y cuando esta apagado, el total NO puede quedar sin explicacion: la suma
     de los renglones que se ven da menos que el total, y un total que no
     cierra con lo que esta arriba es peor que mostrar la linea. Por eso
     apagarlo trae siempre NOTA_SERVICIO al lado del total, que es la misma
     frase en todas las pantallas donde el comensal ve plata.

     De fabrica esta PRENDIDO: se desglosa, que es como venia funcionando. */
  var NOTA_SERVICIO = 'El total incluye el servicio de mesa.';

  function desgloseDeCubiertos(sb) {
    return ajustes(sb).then(function (m) {
      // Solo un '0' guardado a proposito lo apaga. Ante cualquier duda -sin
      // red, ajuste vacio, valor raro- se desglosa, que es lo mas claro.
      var v = m.cubierto_desglosado;
      return String(v === undefined || v === null ? '1' : v) !== '0';
    }, function () { return true; });
  }

  /* Si este pedido lleva la linea del cubierto y todavia se cobra. */
  function tieneCubierto(pedido) {
    var hay = false;
    lineasDe(pedido).forEach(function (l) {
      if (l.cubierto && !lineaSacada(l)) hay = true;
    });
    return hay;
  }

  /* --- Precios editables ---------------------------------------------------
     Una capa sobre menu-data.js, igual que las fotos propias y los agotados:
     la tabla guarda SOLO los platos cuyo precio se cambio respecto de la
     carta impresa. Los pedidos viejos no se tocan: lines[].price quedo
     congelado al pedir.                                                  */
  function preciosDePlatos(sb) {
    if (!sb) return Promise.resolve({});
    return sb.from(PRECIOS_TABLE).select('plato_id, precio').then(function (res) {
      if (res.error) { humanError(res.error); return {}; }
      var m = {};
      (res.data || []).forEach(function (f) { m[f.plato_id] = Number(f.precio); });
      return m;
    }, function (e) { humanError(e); return {}; });
  }

  function guardarPrecio(sb, platoId, precio, quien) {
    var n = Math.round(Number(precio));
    if (!sb || !platoId || !isFinite(n) || n < 0) return Promise.resolve(false);
    return sb.from(PRECIOS_TABLE).upsert({
      plato_id: platoId, precio: n,
      actualizado_por: (quien || '').slice(0, 40) || null,
      actualizado_en: new Date().toISOString()
    }, { onConflict: 'plato_id' })
      .then(function (res) { if (res.error) humanError(res.error); return !res.error; },
            function (e) { humanError(e); return false; });
  }

  function quitarPrecio(sb, platoId) {
    if (!sb || !platoId) return Promise.resolve(false);
    return sb.from(PRECIOS_TABLE).delete().eq('plato_id', platoId)
      .then(function (res) { if (res.error) humanError(res.error); return !res.error; },
            function (e) { humanError(e); return false; });
  }

  /* Aplica la capa sobre el array de la carta, EN EL LUGAR. Es a proposito:
     el carrito de pedir.html guarda la referencia al objeto del plato, asi
     que al mutar price el total del carrito y el precio que viaja en el
     pedido siguen solos, sin repintar nada a mano.
     La primera vez guarda el precio de la carta impresa en precioCarta, para
     poder mostrar "antes valia X" y para poder volver.                 */
  function aplicarPrecios(menu, mapa) {
    (menu || []).forEach(function (p) {
      if (p.precioCarta === undefined) p.precioCarta = Number(p.price) || 0;
      var nuevo = mapa && Object.prototype.hasOwnProperty.call(mapa, p.id) ? Number(mapa[p.id]) : NaN;
      p.price = isFinite(nuevo) && nuevo >= 0 ? nuevo : p.precioCarta;
    });
    return menu;
  }

  /* --- Platos agotados ----------------------------------------------------
     menu-data.js es un archivo, no un dato: sin esto, cuando se acaba la
     provoleta no hay forma de sacarla de la carta salvo volver a publicar el
     sitio. Y con tarjeta el pedido se marca pagado antes de que nadie del
     local lo vea, asi que se podia pagar algo que no habia.

     Se guardan SOLO los agotados: lo normal es que el plato este.          */

  /* Devuelve un objeto { plato_id: true } con los que hoy no hay. */
  function platosAgotados(sb) {
    if (!sb) return Promise.resolve({});
    return sb.from(AGOTADOS_TABLE).select('plato_id').then(function (res) {
      if (res.error) { humanError(res.error); return {}; }
      var m = {};
      (res.data || []).forEach(function (f) { m[f.plato_id] = true; });
      return m;
    }, function (e) { humanError(e); return {}; });
  }

  function agotarPlato(sb, plato, quien) {
    if (!sb || !plato) return Promise.resolve(false);
    return sb.from(AGOTADOS_TABLE).insert({
      plato_id: plato.id,
      nombre: (plato.name || '').slice(0, 120),
      apagado_por: (quien || '').slice(0, 40) || null
    }).then(function (res) {
      // 23505 = ya estaba apagado. Es exito, no falla.
      if (res.error && res.error.code !== '23505') { humanError(res.error); return false; }
      return true;
    }, function (e) { humanError(e); return false; });
  }

  function reponerPlato(sb, platoId) {
    if (!sb || !platoId) return Promise.resolve(false);
    return sb.from(AGOTADOS_TABLE).delete().eq('plato_id', platoId)
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        return true;
      }, function (e) { humanError(e); return false; });
  }

  /* Ultima linea de defensa, en el momento de enviar: entre que el comensal
     armo el carrito y toco Enviar pueden haber pasado veinte minutos y el
     plato puede haberse acabado. Devuelve los nombres de lo que ya no hay. */
  function agotadosEnElCarrito(sb, lineas) {
    if (!sb || !lineas || !lineas.length) return Promise.resolve([]);
    var ids = lineas.map(function (l) { return l.id; }).filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    return sb.from(AGOTADOS_TABLE).select('plato_id, nombre').in('plato_id', ids)
      .then(function (res) {
        if (res.error) return [];          // ante la duda, no frenar el pedido
        return (res.data || []).map(function (f) { return f.nombre || f.plato_id; });
      }, function () { return []; });
  }

  /* --- Fotos de los platos ------------------------------------------------
     La carta trae una foto por plato en menu-data.js, pero apunta a OTRO
     deploy: cambiarla obligaba a publicar ese otro sitio, cosa que desde un
     celular no se puede. Estas fotos son un dato en la base, asi que el mozo
     saca la foto y queda, sin que nadie despliegue nada.                  */

  /* Devuelve { plato_id: url } con todas las fotos propias cargadas. */
  function fotosDePlatos(sb) {
    if (!sb) return Promise.resolve({});
    return sb.from(FOTOS_TABLE).select('plato_id, imagen_url')
      .then(function (res) {
        if (res.error) { humanError(res.error); return {}; }
        var mapa = {};
        (res.data || []).forEach(function (f) { mapa[f.plato_id] = f.imagen_url; });
        return mapa;
      }, function (e) { humanError(e); return {}; });
  }

  /* La URL que hay que mostrar para un plato: la propia si existe, si no la
     que venia en la carta.                                                */
  function fotoDePlato(propias, plato) {
    /* Apagadas desde el panel tecnico: no hay foto para nadie. Se decide aca
       porque este es el unico camino por el que una pantalla consigue la
       foto de un plato. Las fotos cargadas NO se borran: vuelven enteras al
       prender el interruptor de nuevo. */
    if (!func('f_fotos')) return null;
    if (propias && propias[plato.id]) return propias[plato.id];
    return plato.photo ? (IMG_BASE + plato.photo) : null;
  }

  /* Sube la foto y la deja asociada al plato.
     Resuelve { ok, motivo, url }.                                         */
  function subirFotoPlato(sb, platoId, file, quien) {
    if (!sb) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexi\u00f3n con el sistema.' });
    }
    if (!file || !/^image\//.test(file.type || '')) {
      return Promise.resolve({ ok: false, motivo: 'Eso no parece una imagen.' });
    }

    return prepararImagen(file).then(function (blob) {
      /* Si el navegador no supo dibujar la imagen, prepararImagen devuelve el
         original tal cual. En iPhone eso suele ser HEIC, que Chrome y Android
         NO muestran: subirla dejaria la carta con un hueco en la mitad de los
         telefonos. Es mejor frenarlo y explicar como resolverlo.         */
      var tipo = (blob.type || file.type || '').toLowerCase();
      if (tipo.indexOf('heic') !== -1 || tipo.indexOf('heif') !== -1) {
        return {
          ok: false,
          motivo: 'La foto esta en formato HEIC y no se ve en todos los celulares. ' +
                  'En el iPhone: Ajustes > C\u00e1mara > Formatos > "M\u00e1s compatible", ' +
                  'y sacala de nuevo. O mandatela por WhatsApp y guarda esa copia.'
        };
      }
      if (blob.size > 5 * 1024 * 1024) {
        return { ok: false, motivo: 'La imagen sigue pesando más de 5 MB.' };
      }

      var ext = (blob.type === 'image/jpeg') ? 'jpg'
              : ((blob.type === 'image/png') ? 'png' : 'jpg');
      // El id del plato va en la ruta para poder reconocerla en el bucket, y
      // el sufijo aleatorio evita que el navegador muestre la foto vieja.
      var limpio = String(platoId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'plato';
      var path = 'carta/' + limpio + '-' + Date.now() + '-' +
                 Math.random().toString(36).slice(2, 7) + '.' + ext;

      return sb.storage.from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false })
        .then(function (up) {
          if (up.error) throw up.error;
          var pub = sb.storage.from(BUCKET).getPublicUrl(path);
          var url = pub && pub.data && pub.data.publicUrl;
          if (!url) throw new Error('sin URL publica');

          // Se guarda la ruta anterior para borrarla despues: si no, el bucket
          // junta todas las fotos descartadas para siempre.
          return sb.from(FOTOS_TABLE).select('imagen_path').eq('plato_id', platoId).maybeSingle()
            .then(function (prev) {
              var anterior = prev && prev.data && prev.data.imagen_path;
              return sb.from(FOTOS_TABLE).upsert({
                plato_id: platoId,
                imagen_path: path,
                imagen_url: url,
                cargada_por: (quien || '').slice(0, 40) || null
              }, { onConflict: 'plato_id' }).then(function (ins) {
                if (ins.error) throw ins.error;
                if (anterior && anterior !== path) {
                  // Que falle el borrado no invalida la carga: es limpieza.
                  sb.storage.from(BUCKET).remove([anterior]).then(null, function () {});
                }
                return { ok: true, url: url };
              });
            });
        });
    }).then(null, function (e) {
      humanError(e);
      return { ok: false, motivo: 'No pudimos subir la foto. Probá de nuevo.' };
    });
  }

  /* Saca la foto propia y deja que vuelva la original de la carta. */
  function borrarFotoPlato(sb, platoId) {
    if (!sb) return Promise.resolve(false);
    return sb.from(FOTOS_TABLE).select('imagen_path').eq('plato_id', platoId).maybeSingle()
      .then(function (prev) {
        var path = prev && prev.data && prev.data.imagen_path;
        return sb.from(FOTOS_TABLE).delete().eq('plato_id', platoId).then(function (res) {
          if (res.error) { humanError(res.error); return false; }
          if (path) sb.storage.from(BUCKET).remove([path]).then(null, function () {});
          return true;
        });
      }, function (e) { humanError(e); return false; });
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

  /* El QR de cobro es de UNA SESION DE MESA, no del local.

     Antes habia un solo QR con activo=true y se le mostraba a todo el mundo.
     Eso significaba que la mesa 3 y la mesa 8 escaneaban el mismo codigo y la
     caja no tenia forma de saber cual de las dos transferencias era cual. El
     duenio lo decidio al reves: un QR por mesa, y por mesa quiere decir por
     VISITA -la mesa 5 de hoy y la mesa 5 de maniana son dos cuentas
     distintas-, que es exactamente lo que modela la sesion.

     Por eso esta funcion EXIGE la sesion. Sin sesion no devuelve ningun QR,
     nunca: preferimos que la pantalla diga "todavia no hay QR para esta mesa"
     antes que mostrar el de otra. El QR viejo del local quedo con sesion_id
     nulo y por lo tanto invisible, pero no se borro.

     Devuelve tres cosas distintas y hay que respetarlas: false = no pudimos
     consultar, null = no hay QR para esa mesa, fila = el QR.             */
  function qrDeSesion(sb, sesionId) {
    if (!sb || !sesionId) return Promise.resolve(null);
    return sb.from(COBROS_TABLE).select('*')
      .eq('sesion_id', sesionId)
      .eq('activo', true).order('created_at', { ascending: false })
      .limit(1).maybeSingle()
      .then(function (res) {
        if (res.error) { humanError(res.error); return false; }
        /* Cinturon y tirantes. El filtro de arriba ya alcanza, pero esto es
           plata: si por lo que fuera volviera una fila de otra mesa, se
           descarta en vez de mostrarse.                                  */
        var fila = res.data || null;
        if (fila && String(fila.sesion_id) !== String(sesionId)) return null;
        return fila;
      }, function (e) { humanError(e); return false; });
  }

  /* Los QR de varias sesiones de una sola consulta, para la caja, que mira
     todas las mesas abiertas a la vez. Devuelve { sesion_id: fila }.     */
  function qrsDeSesiones(sb, ids) {
    if (!sb || !ids || !ids.length) return Promise.resolve({});
    return sb.from(COBROS_TABLE).select('*')
      .in('sesion_id', ids).eq('activo', true)
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { humanError(res.error); return {}; }
        var m = {};
        (res.data || []).forEach(function (q) {
          // Vienen del mas nuevo al mas viejo: el primero de cada mesa manda.
          if (!m[q.sesion_id]) m[q.sesion_id] = q;
        });
        return m;
      }, function (e) { humanError(e); return {}; });
  }

  function subirQR(sb, file, etiqueta, quien, sesionId) {
    if (!sb) return Promise.reject(new Error('sin cliente'));
    if (!sesionId) {
      var falta = new Error('Elegí primero a qué mesa le vas a cargar el QR.');
      falta.humano = true;
      return Promise.reject(falta);
    }
    // Se lee el archivo original, no el comprimido: mejor definicion.
    var lectura = decodificarQR(file);
    return prepararImagen(file).then(function (blob) {
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error('La imagen sigue pesando más de 5 MB.');
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

          /* Solo un QR activo por MESA; el anterior de esa mesa queda de
             historial. El .eq('sesion_id') es la diferencia con la version
             vieja: antes esto apagaba el QR de todo el local, asi que cargar
             el de la mesa 8 dejaba a la mesa 3 sin nada que mostrar.    */
          return lectura.then(function (leido) {
            return sb.from(COBROS_TABLE).update({ activo: false })
              .eq('activo', true).eq('sesion_id', sesionId)
              .then(function () {
                return sb.from(COBROS_TABLE).insert({
                  etiqueta: (etiqueta || 'QR de cobro').slice(0, 60),
                  imagen_path: path,
                  imagen_url: url,
                  activo: true,
                  sesion_id: sesionId,
                  cargado_por: (quien || '').slice(0, 40) || null,
                  link_pago: leido.link,
                  qr_texto: leido.texto ? leido.texto.slice(0, 1200) : null
                }).select().single();
              })
              .then(function (ins) {
                if (ins.error) throw ins.error;
                /* Cargar el QR responde el pedido del salon: se limpia la
                   marca para que la caja no siga viendo "la mesa 3 pide el
                   QR" cuando ya se lo cargo.                            */
                sb.from(SESIONES_TABLE)
                  .update({ qr_pedido_en: null, qr_pedido_por: null })
                  .eq('id', sesionId).then(function () {}, function () {});
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
      var err = new Error('Eso no parece un link. Tiene que empezar con https://');
      err.humano = true;   // este texto si se puede mostrar tal cual
      return Promise.reject(err);
    }
    return sb.from(COBROS_TABLE)
      .update({ link_pago: limpio })
      .eq('id', id).select().single()
      .then(function (res) {
        if (res.error) throw res.error;
        return res.data;
      });
  }

  /* --- Pedirle el QR a la caja --------------------------------------------
     El mozo esta parado en la mesa, el cliente quiere pagar y esa mesa
     todavia no tiene QR cargado. Hasta ahora la unica salida era caminar
     hasta la caja a avisar. Esto manda el mismo aviso push que ya usa el
     resto del sistema -no hay canal nuevo- y deja la marca en la sesion para
     que la caja lo vea aunque el aviso no le haya llegado.

     La marca en la base es la parte que NO se puede perder: un push depende
     de que la cajera haya activado las notificaciones en su celular. La
     pantalla de caja lee qr_pedido_en y muestra el pedido igual.        */
  function pedirQRaCaja(sb, sesion, quien) {
    if (!sb || !sesion || !sesion.id) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    }
    var mesa = sesion.mesa || 'Una mesa';
    return sb.from(SESIONES_TABLE)
      .update({ qr_pedido_en: new Date().toISOString(),
                qr_pedido_por: (quien || '').slice(0, 40) || null })
      .eq('id', sesion.id).is('cerrada_en', null)
      .select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos avisarle a la caja. Probá de nuevo.' };
        }
        if (!res.data || !res.data.length) {
          return { ok: false, motivo: 'Esa cuenta ya está cerrada.' };
        }
        /* El aviso va al rol 'Jonathan', que es el que comparten Caja y
           Duenio (ver ROL_DE_AVISOS): el mismo destino que el aviso de pago.
           insistir=true porque el cliente esta esperando de pie.         */
        return avisar(sb, 'Jonathan', 'Piden el QR de cobro',
                      mesa + ' quiere pagar y todavía no tiene QR cargado.' +
                      (quien ? ' Lo pide ' + quien + '.' : ''),
                      null, 'caja.html#qr', true)
          .then(function (r) {
            // El pedido quedo anotado igual: el aviso es el extra, no el dato.
            return { ok: true, sesion: res.data[0], aviso: r };
          });
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos avisarle a la caja. Probá de nuevo.' };
      });
  }

  function hayPedidoDeQR(sesion) {
    return !!(sesion && sesion.qr_pedido_en);
  }

  /* --- Avisar que pagaron NO es haber cobrado (AJ-006) --------------------
     Tres estados, y son tres cosas distintas:

       pendiente  -> nadie dijo nada todavia
       avisado    -> el mozo (o el comensal por el QR) dice que ya pago
       confirmado -> la CAJA lo vio entrar en el posnet

     El paso del medio es el que faltaba. Antes, el mozo parado en la mesa
     tocaba "ya pago" en cobrar.html y eso escribia pagado=true: la palabra
     de quien no esta mirando el posnet cerraba la cuenta. Ahora ese boton,
     desde un puesto que no es caja, deja la marca 'avisado' y manda el push
     -nada mas-. Confirmar sigue siendo una accion de caja, adentro de la
     cuenta abierta, y ahora deja escrito QUE PUESTO la hizo.

     La marca va en la base y no solo en el push: un aviso depende de que la
     cajera haya activado las notificaciones, y esto no se puede perder.   */
  function avisarQuePago(sb, pedidos, quien, rol) {
    var lista = [].concat(pedidos || []).filter(Boolean);
    if (!sb || !lista.length) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    }
    var ids = lista.map(function (p) { return p.id; });
    var mesa = lista[0].mesa || 'Una mesa';
    var cuanto = lista.reduce(function (t, p) { return t + cobrable(p); }, 0);

    return sb.from(TABLE)
      .update({ pago_avisado_en: new Date().toISOString(),
                pago_avisado_por: (quien || '').slice(0, 40) || null,
                pago_avisado_rol: (rol || '').slice(0, 20) || null })
      .in('id', ids).eq('pagado', false)
      .select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos avisarle a la caja. Probá de nuevo.' };
        }
        if (!res.data || !res.data.length) {
          return { ok: false, motivo: 'Esa cuenta ya figura cobrada.' };
        }
        /* Mismo destino que el aviso de pago y que el pedido de QR: el rol
           'Jonathan' es el que comparten Caja y Duenio. insistir=true porque
           hay plata sin confirmar y alguien esperando.                    */
        return avisar(sb, 'Jonathan', 'Avisan que una mesa pagó',
                      mesa + ' dice que ya pagó ' + money(cuanto) +
                      '. Confirmalo recién cuando lo veas en el posnet.' +
                      (quien ? ' Avisa ' + quien + '.' : ''),
                      lista[0].id, 'caja.html', true)
          .then(function (r) {
            return { ok: true, pedidos: res.data, aviso: r };
          });
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos avisarle a la caja. Probá de nuevo.' };
      });
  }

  function pagoAvisado(pedido) {
    return !!(pedido && pedido.pago_avisado_en && !pedido.pagado);
  }

  /* Un aviso de pago por MESA, no uno por ronda. La mesa 9 con dos rondas
     mandaba dos push identicos, y el importe de cada uno era medio total. */
  function avisarPagoMesa(sb, pedidos) {
    var lista = [].concat(pedidos || []).filter(Boolean);
    if (!lista.length) return Promise.resolve({ ok: false, motivo: 'Sin pedido.' });
    if (lista.length === 1) return avisarPago(sb, lista[0]);

    liberarSiPagado(sb, lista[0]);
    var mesa = lista[0].mesa;
    var cuanto = lista.reduce(function (t, p) { return t + cobrable(p); }, 0);
    var cuerpo = mesa + ' pagó ' + money(cuanto) + ' (' + lista.length +
                 ' rondas). Ya podés seguir.';

    avisarWhatsapp(sb, {
      rol: 'Jonathan',
      texto: 'Pago confirmado - ' + mesa + '\nTotal: ' + money(cuanto) +
             '\nRondas: ' + lista.length
    });

    return avisar(sb, 'Jonathan', 'Pago confirmado', cuerpo, lista[0].id, 'caja.html', false)
      .then(function (r) {
        if (!r.ok && r.codigo !== 'sin-destinos') {
          console.warn('[La Positiva] aviso de pago no llegó: ' +
                       (r.motivo || 'motivo desconocido'));
        }
        return r;
      });
  }

  /* --- Deshacer un pago confirmado por error ------------------------------
     El duenio: "afuera puede provocarse un error, que en realidad no pago y
     marco como pagado". Confirmar se endurecio (solo adentro del detalle),
     pero endurecer no alcanza: si igual se toca mal, tiene que haber vuelta
     atras, o la caja termina cuadrando con un pago que nunca entro.

     NO se borra la fila ni se pierde el rastro. Mismo criterio que anular una
     comanda: queda quien lo hizo, cuando y por que. El pedido vuelve a la
     lista de pendientes, que es donde corresponde que este si la plata no
     entro.

     El .eq('pagado', true) es el candado de siempre: si otro puesto ya lo
     revirtio, este update no pega y se avisa en vez de escribir dos veces. */
  var MOTIVOS_REVERTIR = [
    'No había entrado la plata',
    'Lo confirmé sin querer',
    'Era la mesa equivocada',
    'El cliente anuló la transferencia'
  ];

  function revertirPago(sb, pedido, motivo, quien) {
    if (!sb || !pedido) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexión con el sistema.' });
    }
    if (!pedido.pagado) {
      return Promise.resolve({ ok: false, motivo: 'Ese pedido no figura como pagado.' });
    }
    return sb.from(TABLE)
      .update({
        pagado: false,
        pago_revertido_en: new Date().toISOString(),
        pago_revertido_por: (quien || 'Caja').slice(0, 40),
        pago_revertido_motivo: (motivo || 'Sin motivo').slice(0, 200),
        updated_at: new Date().toISOString()
      })
      .eq('id', pedido.id).eq('pagado', true)
      .select()
      .then(function (res) {
        if (res.error) {
          humanError(res.error);
          return { ok: false, motivo: 'No se pudo deshacer el pago. Probá de nuevo.' };
        }
        var fila = (res.data || [])[0];
        if (!fila) {
          return { ok: false, choque: true,
                   motivo: 'Ese pago ya lo había deshecho otra persona.' };
        }
        /* Al cobrar, liberarSiPagado() pudo haber puesto la mesa en
           'Limpieza'. No se la toca de vuelta a proposito: estadoReal() ya
           muestra Ocupada cuando una mesa marcada para limpiar vuelve a
           deber, asi que el salon se entera solo y no hay dos escrituras
           peleando por el estado de la sesion.                           */
        avisar(sb, 'Jonathan', 'Se deshizo un pago',
               fila.mesa + ' - ' + money(cobrable(fila)) + ' vuelve a estar sin cobrar. ' +
               (motivo || 'Sin motivo') + '.',
               fila.id, 'caja.html', true);
        return { ok: true, pedido: fila };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No se pudo deshacer el pago. Probá de nuevo.' };
      });
  }


  /* ==========================================================================
     FASE 5 - lo que se puede prender, apagar y renombrar
     ==========================================================================
     Un interruptor es una fila en la_positiva_ajustes con clave 'f_algo' y
     valor '1' o '0'. Nada mas. Se leen todos juntos al arrancar y quedan en
     una copia local para que `func()` pueda contestar SIN esperar la red: las
     pantallas preguntan mientras pintan, y esperar una consulta ahi seria un
     parpadeo en cada carga.

     LA REGLA DE ORO DE ESTO: ante la duda, PRENDIDO. Una copia local rota, un
     Supabase caido o un valor raro dejan la funcion andando. Apagar algo que
     el local usa en medio de un servicio es mucho peor que mostrar de mas un
     boton que la duenia queria esconder.                                  */
  var FUNCIONES_BASE = {
    f_voz: true,              // notas de voz
    f_notas_frecuentes: true, // los botones de notas repetidas
    f_propinas: true,
    f_cubiertos: true,
    f_estadisticas: true,
    f_fotos: true,
    f_carta_comensal: true,   // que el comensal pida desde el QR
    f_qr_pago: true,
    f_avisos: true,
    /* La libreta del local. Con esto apagado desaparece anotaciones.html del
       menu de todos; lo anotado NO se borra. Para un local que ya lleva su
       cuaderno de papel y no la quiere ver. */
    f_libreta: true
  };

  var FUNCIONES_KEY = 'lp_funciones';
  var funcionesCache = null;

  function leerFunciones() {
    if (funcionesCache) return funcionesCache;
    var v = {};
    for (var k in FUNCIONES_BASE) v[k] = FUNCIONES_BASE[k];
    try {
      var crudo = localStorage.getItem(FUNCIONES_KEY);
      if (crudo) {
        var guardado = JSON.parse(crudo);
        for (var c in FUNCIONES_BASE) {
          if (guardado && typeof guardado[c] === 'boolean') v[c] = guardado[c];
        }
      }
    } catch (e) {}
    funcionesCache = v;
    return v;
  }

  /* Sincrona a proposito. Una clave que no existe devuelve true: si maniana
     alguien pregunta por una funcion que todavia no esta en la lista, se ve,
     no desaparece.                                                        */
  function func(clave) {
    var v = leerFunciones();
    return v[clave] === undefined ? true : v[clave] !== false;
  }

  /* Esconde lo que corresponda sin que cada pantalla escriba una linea:
       data-si-func="f_propinas"  -> se ve solo si esta prendido
       data-no-func="f_propinas"  -> se ve solo si esta apagado
     Se corre sola al arrancar y otra vez cuando llegan los valores de la
     base. Las pantallas que pintan de nuevo la vuelven a llamar.         */
  function aplicarFunciones(raiz) {
    var doc = raiz || document;
    var si = doc.querySelectorAll('[data-si-func]');
    for (var i = 0; i < si.length; i++) si[i].hidden = !func(si[i].getAttribute('data-si-func'));
    var no = doc.querySelectorAll('[data-no-func]');
    for (var j = 0; j < no.length; j++) no[j].hidden = func(no[j].getAttribute('data-no-func'));
  }

  /* Trae los interruptores y los nombres de las pantallas de la base. Va
     suelta y sin bloquear, igual que refrescarTema(): si falla no pasa nada,
     queda lo de la copia local.                                           */
  function refrescarFunciones(sb) {
    var cliente = sb || client();
    if (!cliente) return Promise.resolve(null);
    return cliente.from(AJUSTES_TABLE).select('clave, valor').then(function (res) {
      if (res.error) return null;
      var v = {}, nombres = {};
      for (var k in FUNCIONES_BASE) v[k] = FUNCIONES_BASE[k];
      (res.data || []).forEach(function (a) {
        if (a.clave && a.clave.indexOf('f_') === 0) {
          v[a.clave] = String(a.valor) !== '0';
        } else if (a.clave && a.clave.indexOf('nombre_pantalla_') === 0) {
          var archivo = a.clave.slice('nombre_pantalla_'.length).replace(/_/g, '.');
          var texto = String(a.valor || '').trim().slice(0, 40);
          if (texto) nombres[archivo] = texto;
        }
      });
      funcionesCache = v;
      nombresCache = nombres;
      try {
        localStorage.setItem(FUNCIONES_KEY, JSON.stringify(v));
        localStorage.setItem(NOMBRES_KEY, JSON.stringify(nombres));
      } catch (e) {}
      try { aplicarFunciones(); } catch (e) {}
      return v;
    }, function () { return null; });
  }

  function guardarFuncion(sb, clave, prendido, quien) {
    return guardarAjuste(sb, clave, prendido ? '1' : '0', quien).then(function (ok) {
      if (ok) {
        var v = leerFunciones();
        v[clave] = !!prendido;
        funcionesCache = v;
        try { localStorage.setItem(FUNCIONES_KEY, JSON.stringify(v)); } catch (e) {}
        try { aplicarFunciones(); } catch (e) {}
      }
      return ok;
    });
  }

  /* --- Renombrar las pantallas --------------------------------------------
     El duenio pidio poder cambiar como se llama una pantalla EN LA REUNION,
     sin volver a programar: "aca no le decimos Los pagos, le decimos Caja".
     Es una fila mas en ajustes, con clave nombre_pantalla_caja_html.

     Cambia el rotulo, NUNCA el archivo ni el permiso. Renombrar no mueve a
     nadie de puesto.                                                      */
  var NOMBRES_KEY = 'lp_nombres';
  var nombresCache = null;

  function nombresDePantalla() {
    if (nombresCache) return nombresCache;
    var m = {};
    try {
      var crudo = localStorage.getItem(NOMBRES_KEY);
      if (crudo) {
        var g = JSON.parse(crudo);
        if (g && typeof g === 'object') m = g;
      }
    } catch (e) {}
    nombresCache = m;
    return m;
  }

  function nombreDePantalla(archivo, porDefecto) {
    var m = nombresDePantalla();
    var v = m && m[archivo];
    return (typeof v === 'string' && v.trim()) ? v.trim() : porDefecto;
  }

  function guardarNombrePantalla(sb, archivo, texto, quien) {
    var clave = 'nombre_pantalla_' + String(archivo).replace(/\./g, '_');
    var limpio = String(texto || '').trim().slice(0, 40);
    return guardarAjuste(sb, clave, limpio, quien).then(function (ok) {
      if (ok) {
        var m = nombresDePantalla();
        if (limpio) m[archivo] = limpio; else delete m[archivo];
        nombresCache = m;
        try { localStorage.setItem(NOMBRES_KEY, JSON.stringify(m)); } catch (e) {}
      }
      return ok;
    });
  }

  /* --- Quien entra a que --------------------------------------------------
     ANTES DE LEER ESTO: la app NO tiene login. Se entra tocando un nombre en
     una lista, sin clave. Cualquier candado que se ponga aca es de madera:
     evita el error honesto -que un mozo toque los pagos sin querer- y no
     detiene a nadie que quiera entrar como Nelly. Esta escrito en la
     pantalla de bloqueo con todas las letras, para que nadie confunda esto
     con seguridad.

     Tres valores y nada mas:
       'edita'  entra y puede tocar todo lo de esa pantalla
       've'     entra, mira, y lo que cambia plata o estado esta apagado
       'no'     no entra

     'sin' es el que todavia no toco su nombre en la portada. No se lo trata
     como intruso: se lo manda a decir quien es, que es lo unico que le
     falta.                                                                */
  /* Encargada (Betty de maniana, Cintia de noche) administra todo el local:
     mismas puertas que la duenia. La unica que NO tiene es tecnico.html,
     que es el panel interno de David para prender y apagar funciones.

     Mantenimiento (Lautaro) no toca la operacion: entra a sus anotaciones
     y mira el salon para saber que mesa hay que limpiar. Nada mas.       */
  /* El portero sale de la MISMA matriz que los menus (ver MATRIZ, arriba).
     Se arma aca en vez de escribirse a mano justamente para que no puedan
     decir cosas distintas: si un modulo no esta en la lista del rol, ni
     aparece el boton ni deja entrar escribiendo la direccion.

     Las catorce pantallas llaman a guardaDeSeccion() arriba de todo, asi que
     con esto alcanza para cerrar la puerta de atras del navegador.       */
  var PERMISOS = (function () {
    var m = {};
    Object.keys(MODULOS).forEach(function (url) {
      m[url] = {};
      Object.keys(MATRIZ).forEach(function (rol) {
        m[url][rol] = (MATRIZ[rol].indexOf(url) !== -1) ? 'edita' : 'no';
      });
    });
    return m;
  })();

  /* Adentro de carta-fotos conviven dos trabajos distintos: marcar lo que se
     termino -lo hace la cocina todo el tiempo- y tocar precios y fotos, que
     es de la duenia. Por eso una regla por pantalla no alcanza y hay tres
     mas finas para ese pedazo.                                            */
  var PERMISOS_FINOS = {
    /* La carta es la unica pantalla con dos trabajos de dos puestos: la
       cocina entra a marcar lo que se acabo, la duenia a poner precios y
       fotos. Por eso la regla por pantalla no alcanza y hay tres finas.
       La encargada NO toca precios: eso quedo de la duenia.            */
    'carta.precios':  { Duenio: 'edita', Encargada: 'no', Mozo: 'no', Caja: 'no', Cocina: 'no',    Mantenimiento: 'no' },
    'carta.fotos':    { Duenio: 'edita', Encargada: 'no', Mozo: 'no', Caja: 'no', Cocina: 'no',    Mantenimiento: 'no' },
    /* Lo unico que se toca ahi adentro, y solo la cocina. */
    'carta.agotados': { Duenio: 'edita', Encargada: 'no', Mozo: 'no', Caja: 'no', Cocina: 'edita', Mantenimiento: 'no' }
  };

  /* --- El taller: la puerta de atras de David -----------------------------
     Todo lo de arriba ordena el trabajo del LOCAL. Esto es otra cosa: es la
     llave del que construye el sistema, para poder entrar a diseno, al panel
     tecnico y a cualquier pantalla sin tener que cambiarse el puesto ni
     tocarle los permisos al equipo.

     Se prende en taller.html, que no figura en ningun menu de ningun rol.
     Mientras esta prendido, permisoDe() devuelve 'edita' para todo y arriba
     de la pantalla queda una cinta que lo dice, para que nadie -ni el mismo
     David- se olvide de que esta viendo mas de lo que ve el equipo.

     Que tan fuerte es: lo mismo que el resto de esta app. La clave viaja
     hasheada y no se lee del codigo, pero el que sepa escribir una linea en
     la consola del navegador entra igual. Filtra al curioso, no al que
     sabe. Para que fuera un candado de verdad hace falta Supabase Auth.  */
  var TALLER_KEY = 'lp_modo_taller';

  function tallerPrendido() {
    try { return localStorage.getItem(TALLER_KEY) === '1'; } catch (e) { return false; }
  }

  function prenderTaller() {
    try { localStorage.setItem(TALLER_KEY, '1'); } catch (e) {}
  }

  function apagarTaller() {
    try { localStorage.removeItem(TALLER_KEY); } catch (e) {}
  }

  /* El sha-256 de lo que se tipeo, igual que scripts/hash-taller.js. */
  function hashTaller(texto) {
    if (!global.crypto || !global.crypto.subtle) {
      return Promise.reject(new Error('Este navegador no puede comprobar la clave.'));
    }
    var bytes = new TextEncoder().encode(String(texto));
    return global.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      var a = Array.prototype.slice.call(new Uint8Array(buf));
      return a.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }

  function esLocal() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '' || /^192\.168\./.test(h);
  }

  /* Resuelve 'ok' | 'mal' | 'sin-clave'. En localhost entra sin clave: es la
     maquina donde se programa y pedirla ahi solo molesta. */
  function abrirTaller(clave) {
    /* trim por si el hash llego con un salto o un espacio pegado. */
    var esperado = String((CFG && CFG.TALLER_HASH) || '').trim().toLowerCase();
    if (!esperado) {
      if (esLocal()) { prenderTaller(); return Promise.resolve('ok'); }
      return Promise.resolve('sin-clave');
    }
    return hashTaller(clave).then(function (h) {
      if (String(h).trim().toLowerCase() !== esperado) return 'mal';
      prenderTaller();
      return 'ok';
    });
  }

  /* La cinta de arriba. Se pinta en TODA pantalla mientras el taller este
     prendido, y el boton la apaga. Sin esto es facil quedarse adentro del
     modo y creer que el mozo ve lo mismo que vos. */
  function cintaTaller() {
    if (!tallerPrendido() || !document.body) return;
    if (document.getElementById('cintaTaller')) return;
    var d = document.createElement('div');
    d.id = 'cintaTaller';
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'background:#7b2d12;color:#fff;font:600 13px/1.3 system-ui,sans-serif;' +
      'padding:8px 12px;display:flex;gap:10px;align-items:center;' +
      'justify-content:center;box-shadow:0 -2px 10px rgba(0,0,0,.35)';
    var t = document.createElement('span');
    t.textContent = 'MODO TALLER — estás viendo todas las pantallas';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = 'Salir del taller';
    b.style.cssText = 'min-height:32px;padding:0 12px;border-radius:999px;border:0;' +
      'background:#fff;color:#7b2d12;font:600 13px system-ui,sans-serif;cursor:pointer';
    b.addEventListener('click', function () { apagarTaller(); location.reload(); });
    d.appendChild(t); d.appendChild(b);
    document.body.appendChild(d);
  }

  function permisoDe(seccion, rol) {
    /* El taller primero: mientras este prendido, David entra a todo. Va aca
       arriba a proposito, porque este es el unico camino por el que una
       pantalla o un boton preguntan si corresponde. Tocando un solo lugar,
       la puerta de atras no puede quedar a medias. */
    if (tallerPrendido()) return 'edita';
    var fila = PERMISOS[seccion] || PERMISOS_FINOS[seccion];
    if (!fila) return 'edita';                    // pantalla sin regla: se ve
    if (!rol) return 'sin';
    return fila[rol] || 'no';
  }

  function puedeEditar(seccion) {
    var yo = quienSoy();
    return permisoDe(seccion, yo && yo.rol) === 'edita';
  }

  function puedeVer(seccion) {
    var p = permisoDe(seccion, (quienSoy() || {}).rol);
    return p === 'edita' || p === 've';
  }

  /* El portero de la pantalla. Se llama arriba de todo, antes de pintar.
     Devuelve 'edita' o 've' y, si no corresponde, pinta el cartel y devuelve
     'no' para que la pantalla se frene sola.

     No hay puerta de atras a proposito: si hiciera falta una, seria mentira
     que existe el candado.                                                */
  function guardaDeSeccion(seccion) {
    var yo = quienSoy();
    var p = permisoDe(seccion, yo && yo.rol);
    if (p === 'edita') return p;
    if (p === 've') {
      /* Solo mirar. La clase apaga por CSS todo lo marcado con
         [data-solo-edita] -los botones que cambian plata o estado- y la
         cinta de arriba dice por que, para que nadie crea que se rompio. */
      try {
        document.body.classList.add('solo-mirar');
        var cinta = document.createElement('p');
        cinta.className = 'cinta-mirar';
        cinta.setAttribute('role', 'status');
        cinta.textContent = 'Estás mirando. Desde tu puesto no se toca nada de esta pantalla.';
        var nav = document.querySelector('.nav-fija');
        if (nav && nav.parentNode) nav.parentNode.insertBefore(cinta, nav.nextSibling);
        else document.body.insertBefore(cinta, document.body.firstChild);
      } catch (e) {}
      return p;
    }

    var titulo, cuerpo, boton, href;
    if (p === 'sin') {
      titulo = 'Decí quién sos';
      cuerpo = 'Esta pantalla necesita saber con quién habla para dejar rastro de ' +
               'quién hizo cada cosa. Tocá tu nombre en la portada y volvé.';
      boton = 'Ir a decir quién soy';
      href = './';
    } else {
      titulo = 'Esta pantalla no es de tu puesto';
      cuerpo = esc((yo && yo.nombre) || 'Vos') + ' entró como <b>' +
               esc((yo && yo.nota) || (yo && yo.rol) || 'invitado') +
               '</b>, y esto lo maneja otro puesto. Si lo tenés que usar, pedí que ' +
               'te cambien el puesto en la portada.';
      boton = 'Volver a lo mío';
      href = yo ? pantallaDe(yo.rol) : './';
    }

    try {
      document.title = 'La Positiva - ' + titulo;
      document.body.innerHTML =
        '<div class="wrap" style="max-width:520px;padding-top:64px;text-align:center">' +
          '<p style="font-size:44px;line-height:1;margin:0 0 14px" aria-hidden="true">🔒</p>' +
          '<h1 style="margin:0 0 10px">' + esc(titulo) + '</h1>' +
          '<p style="color:var(--muted);font-size:16px;line-height:1.6;margin:0 0 22px">' +
            cuerpo + '</p>' +
          '<p><a class="btn btn-primary" href="' + esc(href) + '" ' +
            'style="min-height:48px;display:inline-flex;align-items:center;padding:0 22px">' +
            esc(boton) + '</a></p>' +
          '<p style="color:var(--muted);font-size:13px;line-height:1.6;margin-top:28px">' +
            'Esto ordena el trabajo, no protege datos: al sistema se entra ' +
            'tocando un nombre, sin contraseña.</p>' +
        '</div>';
    } catch (e) {}
    return 'no';
  }

  /* --- Notas frecuentes ----------------------------------------------------
     Lo que se repite todos los dias: "sin sal", "bien cocida", "sin cebolla".
     Son COMPARTIDAS por todo el local y no de cada mozo, por tres razones:
     no son de Jonathan, son del bodegon; la que carga uno le sirve al otro
     desde el minuto cero; y como se entra tocando un nombre sin clave, "de
     cada mozo" seria una lista por nombre escrito a mano, que es peor.

     Viven en una sola fila de ajustes separadas por |. Una tabla para nueve
     frases de dos palabras seria una tabla de mas.                        */
  var NOTAS_BASE = ['Sin sal', 'Sin cebolla', 'Bien cocida', 'A punto', 'Jugosa',
                    'Sin picante', 'Sin tacc', 'Para compartir', 'Sin hielo'];

  function limpiarNotas(lista) {
    var vistas = Object.create(null), out = [];
    (lista || []).forEach(function (t) {
      var v = String(t || '').replace(/[|\r\n]+/g, ' ').trim().slice(0, 40);
      if (!v) return;
      var clave = v.toLowerCase();
      if (vistas[clave]) return;
      vistas[clave] = true;
      out.push(v);
    });
    return out.slice(0, 24);          // mas de 24 ya no se leen de un vistazo
  }

  function notasFrecuentes(sb) {
    if (!sb) return Promise.resolve(NOTAS_BASE.slice());
    return ajustes(sb).then(function (m) {
      var crudo = m.notas_frecuentes;
      if (crudo === undefined || crudo === null) return NOTAS_BASE.slice();
      /* Una lista vacia guardada a proposito es una decision, no un error:
         se respeta y no vuelven las de fabrica. */
      return limpiarNotas(String(crudo).split('|'));
    }, function () { return NOTAS_BASE.slice(); });
  }

  function guardarNotasFrecuentes(sb, lista, quien) {
    var limpia = limpiarNotas(lista);
    return guardarAjuste(sb, 'notas_frecuentes', limpia.join('|'), quien)
      .then(function (ok) { return ok ? limpia : null; });
  }

  /* --- Notas de voz --------------------------------------------------------
     Tres capas separadas y en este orden de importancia:

       1. el audio           lo que realmente se dijo
       2. la transcripcion   el texto crudo, sin tocar
       3. el resumen         lo limpio para el cocinero

     La 1 y la 2 se guardan ANTES de pedir la 3. Si Gemini no contesta, no
     hay clave o el celular grabo un formato que no le gusta, la comanda sale
     igual con lo que ya esta guardado. El resumen es lo unico prescindible
     de los tres y se lo trata asi en todo el codigo.

     El resumen NUNCA viaja solo a la cocina: lo revisa y lo corrige el mozo
     antes de mandarlo. Aca no hay nada que mande nada: esto guarda y
     devuelve, la pantalla decide.                                         */

  function blobABase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('No se pudo leer el audio.')); };
      fr.onload = function () {
        var s = String(fr.result || '');
        var coma = s.indexOf(',');
        resolve(coma >= 0 ? s.slice(coma + 1) : '');
      };
      fr.readAsDataURL(blob);
    });
  }

  function extensionDeAudio(tipo) {
    var t = String(tipo || '').toLowerCase();
    if (t.indexOf('webm') !== -1) return 'webm';
    if (t.indexOf('ogg') !== -1) return 'ogg';
    if (t.indexOf('mp4') !== -1 || t.indexOf('m4a') !== -1 || t.indexOf('aac') !== -1) return 'm4a';
    if (t.indexOf('mpeg') !== -1 || t.indexOf('mp3') !== -1) return 'mp3';
    if (t.indexOf('wav') !== -1) return 'wav';
    return 'webm';
  }

  /* Sube el audio al mismo bucket de las fotos. Devuelve { path, url } o
     null: que no se pueda subir NO invalida la nota, solo la deja sin audio
     para escuchar despues.                                                */
  function subirAudio(sb, blob) {
    if (!sb || !blob || !blob.size) return Promise.resolve(null);
    if (blob.size > 5 * 1024 * 1024) return Promise.resolve(null);
    var tipo = (blob.type || 'audio/webm').split(';')[0];
    var path = 'voz/' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) +
               '.' + extensionDeAudio(tipo);
    return sb.storage.from(BUCKET).upload(path, blob, { contentType: tipo, upsert: false })
      .then(function (up) {
        if (up.error) { console.warn('[La Positiva] audio no subido', up.error); return null; }
        var pub = sb.storage.from(BUCKET).getPublicUrl(path);
        var url = pub && pub.data && pub.data.publicUrl;
        return url ? { path: path, url: url, tipo: tipo } : null;
      }, function (e) { console.warn('[La Positiva] audio no subido', e); return null; });
  }

  /* Deja la nota guardada con lo que haya. Nunca rechaza: devuelve la fila o
     null, y el que llama sigue de largo igual.                            */
  function guardarVoz(sb, datos) {
    if (!sb) return Promise.resolve(null);
    datos = datos || {};
    return sb.from(VOZ_TABLE).insert({
      pedido_id: datos.pedido_id || null,
      sesion_id: datos.sesion_id || null,
      mesa: datos.mesa ? String(datos.mesa).slice(0, 20) : null,
      autor: datos.autor ? String(datos.autor).slice(0, 40) : null,
      destino: datos.destino === 'cocina' ? 'cocina' : 'comanda',
      audio_path: datos.audio_path || null,
      audio_url: datos.audio_url || null,
      audio_tipo: datos.audio_tipo || null,
      segundos: numeroOnulo(datos.segundos),
      transcripcion: datos.transcripcion ? String(datos.transcripcion).slice(0, 4000) : null,
      transcripcion_de: datos.transcripcion_de || null,
      resumen: datos.resumen ? String(datos.resumen).slice(0, 400) : null,
      resumen_estado: datos.resumen_estado || 'pendiente',
      resumen_modelo: datos.resumen_modelo || null,
      resumen_motivo: datos.resumen_motivo ? String(datos.resumen_motivo).slice(0, 200) : null,
      texto_usado: datos.texto_usado ? String(datos.texto_usado).slice(0, 500) : null
    }).select().single().then(function (res) {
      if (res.error) { console.warn('[La Positiva] nota de voz no guardada', res.error); return null; }
      return res.data;
    }, function (e) { console.warn('[La Positiva] nota de voz no guardada', e); return null; });
  }

  function actualizarVoz(sb, id, campos) {
    if (!sb || !id) return Promise.resolve(false);
    return sb.from(VOZ_TABLE).update(campos || {}).eq('id', id)
      .then(function (res) { return !res.error; }, function () { return false; });
  }

  /* La comanda todavia no existe cuando el mozo graba: el pedido_id se pega
     despues, cuando el insert del pedido volvio con su id. */
  function ligarVozAPedido(sb, ids, pedidoId) {
    var lista = (ids || []).filter(Boolean);
    if (!sb || !lista.length || !pedidoId) return Promise.resolve(false);
    return sb.from(VOZ_TABLE).update({ pedido_id: pedidoId }).in('id', lista)
      .then(function (res) { return !res.error; }, function () { return false; });
  }

  function vozDePedidos(sb, ids) {
    var lista = (ids || []).filter(Boolean);
    if (!sb || !lista.length) return Promise.resolve({});
    return sb.from(VOZ_TABLE).select('*').in('pedido_id', lista)
      .order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) return {};
        var m = {};
        (res.data || []).forEach(function (v) {
          (m[v.pedido_id] = m[v.pedido_id] || []).push(v);
        });
        return m;
      }, function () { return {}; });
  }

  /* El reloj del lado del celular. La Edge Function ya se corta sola a los
     20 segundos, pero eso NO alcanza: si el telefono pierde la senial en el
     medio, o si leer el audio se traba, la promesa no vuelve nunca y el mozo
     se queda mirando "armando..." para siempre, sin enterarse de que puede
     seguir igual. Paso de verdad en una prueba, no es una precaucion teorica.

     25 segundos: un poco mas que los 20 del servidor, para darle lugar a que
     conteste el primero y diga el motivo de verdad. Vencido el plazo se
     devuelve la forma de siempre, asi la pantalla no aprende un caso nuevo. */
  var ESPERA_RESUMEN = 25000;

  function conReloj(promesa, ms) {
    return new Promise(function (resolve) {
      var listo = false;
      function terminar(r) {
        if (listo) return;
        listo = true;
        clearTimeout(t);
        resolve(r);
      }
      var t = setTimeout(function () {
        terminar({ ok: false, motivo: 'error',
          error: 'El resumen tardó demasiado. Queda el audio y lo que se escuchó.' });
      }, ms);
      promesa.then(terminar, function (e) {
        console.warn('[La Positiva] resumen no pedido', e);
        terminar({ ok: false, motivo: 'error',
          error: humanError(e, 'No pudimos contactar al servidor del resumen.') });
      });
    });
  }

  /* Le pide el resumen a la Edge Function. Misma forma de respuesta que
     avisar() y avisarWhatsapp(): { ok, motivo, ... }. 'sin-clave' NO es un
     error: es el estado normal mientras el local no cargo la clave, y se
     distingue para poder decirlo con esas palabras en pantalla.          */
  function resumirVoz(sb, opts) {
    opts = opts || {};
    if (!sb) {
      return Promise.resolve({ ok: false, motivo: 'sin-cliente',
        error: 'No hay conexión con el sistema.' });
    }
    function pedir(audio64, mime) {
      return sb.functions.invoke('resumir-nota', {
        body: { audio: audio64 || '', mime: mime || '',
                transcripcion: opts.transcripcion || '' }
      }).then(function (res) {
        var d = res.data || {};
        if (res.error && !d.motivo) {
          return { ok: false, motivo: 'error',
            error: humanError(res.error, 'El servidor del resumen no respondió.') };
        }
        return d.ok
          ? { ok: true, motivo: 'ok', transcripcion: d.transcripcion,
              resumen: d.resumen, modelo: d.modelo, tokens: d.tokens }
          : { ok: false, motivo: d.motivo || 'error',
              error: d.error || 'No se pudo resumir.' };
      }, function (e) {
        console.warn('[La Positiva] resumen no pedido', e);
        return { ok: false, motivo: 'error',
          error: humanError(e, 'No pudimos contactar al servidor del resumen.') };
      });
    }

    /* El reloj envuelve TODO, no solo el pedido: leer el audio del celular
       tambien se puede trabar y ahi no hay red de por medio que avise. */
    if (!opts.blob || !opts.blob.size) return conReloj(pedir('', ''), ESPERA_RESUMEN);
    return conReloj(blobABase64(opts.blob).then(function (b64) {
      return pedir(b64, opts.blob.type || '');
    }, function () {
      // Sin poder leer el audio todavia queda el texto: se intenta con eso.
      return pedir('', '');
    }), ESPERA_RESUMEN);
  }

  /* Limpieza a mano desde el panel tecnico. Los audios quedan en un bucket
     PUBLICO, igual que las fotos de los platos: no se guardan para siempre
     "por las dudas".                                                      */
  function borrarVozVieja(sb, dias) {
    if (!sb) return Promise.resolve({ ok: false, motivo: 'No hay conexión.' });
    var d = Number(dias);
    if (!isFinite(d) || d < 1) d = 7;
    var corte = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
    return sb.from(VOZ_TABLE).select('id, audio_path').lt('created_at', corte)
      .then(function (res) {
        if (res.error) { humanError(res.error); return { ok: false, motivo: 'No se pudo leer.' }; }
        var filas = res.data || [];
        if (!filas.length) return { ok: true, borradas: 0 };
        var paths = filas.map(function (f) { return f.audio_path; }).filter(Boolean);
        var ids = filas.map(function (f) { return f.id; });
        var limpieza = paths.length
          ? sb.storage.from(BUCKET).remove(paths).then(null, function () { return null; })
          : Promise.resolve(null);
        return limpieza.then(function () {
          return sb.from(VOZ_TABLE).delete().in('id', ids).then(function (del) {
            if (del.error) { humanError(del.error); return { ok: false, motivo: 'No se pudo borrar.' }; }
            return { ok: true, borradas: ids.length };
          });
        });
      }, function (e) { humanError(e); return { ok: false, motivo: 'No se pudo borrar.' }; });
  }

  global.LP = {
    SUPABASE_URL: SUPABASE_URL,
    SUPABASE_ANON: SUPABASE_ANON,
    TABLE: TABLE,
    PUSH_TABLE: PUSH_TABLE,
    COBROS_TABLE: COBROS_TABLE,
    BUCKET: BUCKET,
    IMG_BASE: IMG_BASE,
    /* Ya NO existe qrActivo(): era "el QR del local" y devolvia el mismo
       codigo para todas las mesas. Se saco del export a proposito, para que
       cualquier pantalla que lo siga llamando falle fuerte y temprano en vez
       de mostrarle a una mesa el QR de otra. */
    qrDeSesion: qrDeSesion,
    qrsDeSesiones: qrsDeSesiones,
    subirQR: subirQR,
    decodificarQR: decodificarQR,
    comoLink: comoLink,
    guardarLink: guardarLink,
    pedirQRaCaja: pedirQRaCaja,
    hayPedidoDeQR: hayPedidoDeQR,
    avisarQuePago: avisarQuePago,
    pagoAvisado: pagoAvisado,
    avisarPagoMesa: avisarPagoMesa,
    MOTIVOS_REVERTIR: MOTIVOS_REVERTIR,
    revertirPago: revertirPago,
    client: client,
    esc: esc,
    sinTildes: sinTildes,
    money: money,
    timeAgo: timeAgo,
    humanError: humanError,
    toast: toast,
    openDialog: openDialog,
    closeDialog: closeDialog,
    isDialogOpen: isDialogOpen,
    ConnBadge: ConnBadge,
    onCleanup: onCleanup,
    Sonador: Sonador,
    registerSW: registerSW,
    VAPID_PUBLIC: VAPID_PUBLIC,
    pushSoportado: pushSoportado,
    esIOS: esIOS,
    esInstalada: esInstalada,
    estadoPush: estadoPush,
    suscribirPush: suscribirPush,
    pushRegistrado: pushRegistrado,
    contarSubs: contarSubs,
    listarSubs: listarSubs,
    borrarSub: borrarSub,
    WA_TABLE: WA_TABLE,
    FOTOS_TABLE: FOTOS_TABLE,
    AGOTADOS_TABLE: AGOTADOS_TABLE,
    AJUSTES_TABLE: AJUSTES_TABLE,
    PRECIOS_TABLE: PRECIOS_TABLE,
    CUBIERTO_ID: CUBIERTO_ID,
    ajustes: ajustes,
    guardarAjuste: guardarAjuste,
    temaGuardado: temaGuardado,
    refrescarTema: refrescarTema,
    guardarTema: guardarTema,
    nombreLocal: nombreLocal,
    importeCubierto: importeCubierto,
    cubiertoParaSesion: cubiertoParaSesion,
    desgloseDeCubiertos: desgloseDeCubiertos,
    tieneCubierto: tieneCubierto,
    NOTA_SERVICIO: NOTA_SERVICIO,
    preciosDePlatos: preciosDePlatos,
    guardarPrecio: guardarPrecio,
    quitarPrecio: quitarPrecio,
    aplicarPrecios: aplicarPrecios,
    platosAgotados: platosAgotados,
    agotarPlato: agotarPlato,
    reponerPlato: reponerPlato,
    agotadosEnElCarrito: agotadosEnElCarrito,
    SESIONES_TABLE: SESIONES_TABLE,
    MESAS_TABLE: MESAS_TABLE,
    mesasDelLocal: mesasDelLocal,
    planoDelSalon: planoDelSalon,
    abrirMesa: abrirMesa,
    /* Lo usaba solo planoDelSalon(); ahora tambien el panel de la duenia y la
       solapa Cobrar del mozo, para que las tres pantallas cuenten "para
       limpiar" con el mismo criterio y no con tres copias del mismo if. */
    estadoReal: estadoReal,
    estadoDeMesa: estadoDeMesa,
    guardarComensales: guardarComensales,
    reservarMesa: reservarMesa,
    NOTAS_TABLE: NOTAS_TABLE,
    PERSONAS_TABLE: PERSONAS_TABLE,
    personas: personas,
    PROPINAS_TABLE: PROPINAS_TABLE,
    VOZ_TABLE: VOZ_TABLE,
    LIBRETA_TABLE: LIBRETA_TABLE,
    TIPOS_LIBRETA: TIPOS_LIBRETA,
    hoyLocalISO: hoyLocalISO,
    libreta: libreta,
    anotar: anotar,
    marcarAnotacion: marcarAnotacion,
    borrarAnotacion: borrarAnotacion,
    FUNCIONES_BASE: FUNCIONES_BASE,
    func: func,
    aplicarFunciones: aplicarFunciones,
    refrescarFunciones: refrescarFunciones,
    guardarFuncion: guardarFuncion,
    nombreDePantalla: nombreDePantalla,
    nombresDePantalla: nombresDePantalla,
    guardarNombrePantalla: guardarNombrePantalla,
    PERMISOS: PERMISOS,
    PERMISOS_FINOS: PERMISOS_FINOS,
    permisoDe: permisoDe,
    puedeEditar: puedeEditar,
    puedeVer: puedeVer,
    guardaDeSeccion: guardaDeSeccion,
    NOTAS_BASE: NOTAS_BASE,
    notasFrecuentes: notasFrecuentes,
    guardarNotasFrecuentes: guardarNotasFrecuentes,
    subirAudio: subirAudio,
    guardarVoz: guardarVoz,
    actualizarVoz: actualizarVoz,
    ligarVozAPedido: ligarVozAPedido,
    vozDePedidos: vozDePedidos,
    resumirVoz: resumirVoz,
    borrarVozVieja: borrarVozVieja,
    mozosActivos: mozosActivos,
    guardarAliasMozo: guardarAliasMozo,
    reportarPropina: reportarPropina,
    confirmarPropina: confirmarPropina,
    cargarPropinaEfectivo: cargarPropinaEfectivo,
    propinasDeMozo: propinasDeMozo,
    quienSoy: quienSoy,
    entrarComo: entrarComo,
    salir: salir,
    pantallaDe: pantallaDe,
    FUNCIONES_POR_ROL: FUNCIONES_POR_ROL,
    funcionesDe: funcionesDe,
    iconoDe: iconoDe,
    ACCESO_RAPIDO: ACCESO_RAPIDO,
    accesoRapido: accesoRapido,
    mostrarQuienSoy: mostrarQuienSoy,
    rotuloDeRol: rotuloDeRol,
    mostrarRol: mostrarRol,
    podarEnlaces: podarEnlaces,
    tallerPrendido: tallerPrendido,
    abrirTaller: abrirTaller,
    apagarTaller: apagarTaller,
    navegacionFija: navegacionFija,
    navDonde: navDonde,
    rolDeAvisos: rolDeAvisos,
    mantenerDespierta: mantenerDespierta,
    pantallaSiempreEncendida: pantallaSiempreEncendida,
    ESTADOS: ESTADOS,
    NO_SE_COBRA: NO_SE_COBRA,
    NO_SE_COBRA_SQL: NO_SE_COBRA_SQL,
    seCobra: seCobra,
    MOTIVOS_SACAR: MOTIVOS_SACAR,
    puedeSacar: puedeSacar,
    lineasDe: lineasDe,
    lineasVivas: lineasVivas,
    lineaSacada: lineaSacada,
    lineasDeComanda: lineasDeComanda,
    importeDeLinea: importeDeLinea,
    cobrable: cobrable,
    pendienteDeDevolver: pendienteDeDevolver,
    sacarPlato: sacarPlato,
    sacarRonda: sacarRonda,
    volverAPoner: volverAPoner,
    marcarDevuelto: marcarDevuelto,
    AVISOS: AVISOS,
    avisarEstado: avisarEstado,
    avisarPago: avisarPago,
    liberarSiPagado: liberarSiPagado,
    cambiarEstado: cambiarEstado,
    aprobarPedido: aprobarPedido,
    rechazarPedido: rechazarPedido,
    tomarPedido: tomarPedido,
    notasDePedido: notasDePedido,
    agregarNota: agregarNota,
    sesionDeMesa: sesionDeMesa,
    cuentaDeSesion: cuentaDeSesion,
    resumirCuenta: resumirCuenta,
    mesasAbiertas: mesasAbiertas,
    agruparPorMesa: agruparPorMesa,
    sesionesPorId: sesionesPorId,
    reavisarMozo: reavisarMozo,
    cerrarSesion: cerrarSesion,
    fotosDePlatos: fotosDePlatos,
    fotoDePlato: fotoDePlato,
    subirFotoPlato: subirFotoPlato,
    borrarFotoPlato: borrarFotoPlato,
    prepararImagen: prepararImagen,
    normalizarTelefono: normalizarTelefono,
    listarWhatsapp: listarWhatsapp,
    agregarWhatsapp: agregarWhatsapp,
    borrarWhatsapp: borrarWhatsapp,
    avisarWhatsapp: avisarWhatsapp,
    describirDispositivo: describirDispositivo,
    avisar: avisar
  };

  /* Decir quien sos no puede depender de que cada pantalla se acuerde de
     pedirlo: se hace desde aca, una vez, para todas. Si la pantalla no
     tiene donde ponerlo, no pasa nada. app.js va con defer, asi que el
     documento ya suele estar armado; el listener cubre el caso contrario. */
  function alArrancar() {
    mostrarQuienSoy();
    try { mostrarRol(); } catch (e) {}
    /* Los interruptores se aplican con la copia local ANTES de pintar, y
       despues se refrescan contra la base. Los dos van envueltos: que un
       interruptor falle no puede tumbar la pantalla. */
    try { aplicarFunciones(); } catch (e) {}
    try { refrescarFunciones(); } catch (e) {}
    /* Envuelta aparte: si armar la barra fallara, quien sos ya se escribio y
       el resto del turno sigue andando. */
    try { navegacionFija(); } catch (e) {}
    /* Y la pastilla de abajo, aparte otra vez y por la misma razon: si
       fallara, la barra de arriba y el resto de la pantalla siguen enteras. */
    try { accesoRapido(); } catch (e) {}
    /* Ultimo: cuando ya estan todos los links en la pagina, incluidos los
       que arma la barra fija y la pastilla de abajo. */
    try { podarEnlaces(); } catch (e) {}
    try { cintaTaller(); } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alArrancar);
  } else {
    alArrancar();
  }

  /* El tema, igual: ninguna pantalla se tiene que acordar de pedirlo. Se
     llama envuelto en try porque una falla aca no puede tumbar el resto de
     app.js, que es lo que hace funcionar el turno. */
  try { refrescarTema(); } catch (e) {}
})(window);
