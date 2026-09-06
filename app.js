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
  var SESIONES_TABLE = CFG.SESIONES_TABLE || 'la_positiva_sesiones';
  var NOTAS_TABLE = CFG.NOTAS_TABLE || 'la_positiva_notas';
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
    if (!sb) {
      return Promise.resolve({ ok: false, config: false, codigo: 'sin-cliente',
        motivo: 'No hay conexion con el sistema.' });
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
    if (!sb) return Promise.resolve({ ok: false, motivo: 'No hay conexion con el sistema.' });
    var tel = normalizarTelefono(telefono);
    if (!tel) {
      return Promise.resolve({
        ok: false,
        motivo: 'El numero tiene que ir en formato internacional, con el codigo de pais. ' +
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
            return { ok: false, motivo: 'Ese numero ya estaba cargado para ' + rol + '.' };
          }
          humanError(res.error);
          return { ok: false, motivo: 'No pudimos guardar el numero.' };
        }
        return { ok: true, fila: res.data };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No pudimos guardar el numero.' };
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
    if (!sb) {
      return Promise.resolve({ ok: false, codigo: 'sin-cliente',
        motivo: 'No hay conexion con el sistema.' });
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

  /* --- Flujo del pedido ---------------------------------------------------
     El pedido del comensal NO va derecho a la cocina: primero lo aprueba el
     mozo. Asi el mozo puede agregar lo que el comensal dijo de palabra y no
     cargo en la carta, y frenar lo que no corresponda.

       Por aprobar -> En cocina -> Cocinando -> Listo -> Entregado
            \-> Rechazado

     'En cocina' es "la comanda llego"; 'Cocinando' es "la estan haciendo".
     Son cosas distintas y es justo lo que el mozo necesita distinguir.   */

  var ESTADOS = ['Por aprobar', 'En cocina', 'Cocinando', 'Listo', 'Entregado'];

  /* Quien se entera de cada paso. Esta tabla es la UNICA fuente: si un estado
     esta aca, avisa; si no, no. Antes cada pantalla decidia por su cuenta y
     por eso habia pasos mudos.                                           */
  var AVISOS = {
    'Por aprobar': { a: 'Mozo',   titulo: 'Pedido para aprobar',
                     url: 'mozo.html',   insistir: true },
    'En cocina':   { a: 'Cocina', titulo: 'Comanda nueva',
                     url: 'cocina.html', insistir: true },
    'Cocinando':   { a: 'Mozo',   titulo: 'La cocina lo esta cocinando',
                     url: 'mozo.html',   insistir: false },
    'Listo':       { a: 'Mozo',   titulo: 'Listo para llevar a la mesa',
                     url: 'mozo.html',   insistir: true },
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

    var cuerpo = pedido.mesa + ' - ' + money(pedido.total) +
                 (pedido.cliente ? ' - ' + pedido.cliente : '') +
                 (extra ? '\n' + extra : '');

    /* La comanda tambien sale por WhatsApp, si el local cargo un numero.
       Va aparte del push a proposito: que Twilio falle no puede tocar el
       aviso que ya funciona.                                             */
    if (pedido.estado === 'En cocina') {
      var detalle = (pedido.lines || []).map(function (l) {
        return l.qty + 'x ' + l.name;
      }).join(', ');
      avisarWhatsapp(sb, {
        rol: 'Cocina',
        texto: 'Comanda de ' + pedido.mesa + '\n' + detalle +
               '\nTotal: ' + money(pedido.total) +
               (pedido.detalle_comensal ? '\nOJO: ' + pedido.detalle_comensal : '')
      });
    }

    return avisar(sb, cfg.a, cfg.titulo, cuerpo, pedido.id, cfg.url, cfg.insistir)
      .then(function (r) {
        if (!r.ok && r.codigo !== 'sin-destinos') {
          console.warn('[La Positiva] aviso de "' + pedido.estado + '" no llego a ' +
                       cfg.a + ': ' + (r.motivo || 'motivo desconocido'));
        }
        return r;
      });
  }

  /* Cambia el estado y avisa. Todas las pantallas pasan por aca para que
     ninguna transicion quede sin su notificacion.                        */
  function cambiarEstado(sb, id, nuevo, campos) {
    if (!sb || !id) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexion con el sistema.' });
    }
    var parche = { estado: nuevo, updated_at: new Date().toISOString() };
    for (var k in (campos || {})) {
      if (Object.prototype.hasOwnProperty.call(campos, k)) parche[k] = campos[k];
    }

    return sb.from(TABLE).update(parche).eq('id', id).select().single()
      .then(function (res) {
        if (res.error || !res.data) {
          humanError(res.error);
          return { ok: false, motivo: 'No se pudo cambiar el estado. Proba de nuevo.' };
        }
        avisarEstado(sb, res.data);          // sin await: no frena la pantalla
        return { ok: true, pedido: res.data };
      }, function (e) {
        humanError(e);
        return { ok: false, motivo: 'No se pudo cambiar el estado. Proba de nuevo.' };
      });
  }

  /* El mozo manda la comanda a la cocina. */
  function aprobarPedido(sb, id, quien, detalle) {
    return cambiarEstado(sb, id, 'En cocina', {
      aprobado_por: (quien || 'Mozo').slice(0, 40),
      aprobado_en: new Date().toISOString(),
      detalle_comensal: (detalle || '').slice(0, 500) || null
    });
  }

  function rechazarPedido(sb, id, quien, motivo) {
    return cambiarEstado(sb, id, 'Rechazado', {
      aprobado_por: (quien || 'Mozo').slice(0, 40),
      rechazado_motivo: (motivo || '').slice(0, 200) || null
    });
  }

  /* Un solo boton en la cocina: la recibieron Y la estan haciendo. */
  function tomarPedido(sb, id) {
    return cambiarEstado(sb, id, 'Cocinando', { tomado_en: new Date().toISOString() });
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
      return Promise.resolve({ ok: false, motivo: 'Escribi algo antes de mandar.' });
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
  function resumirCuenta(pedidos) {
    var total = 0, pagado = 0, sinEntregar = 0;
    pedidos.forEach(function (p) {
      var t = Number(p.total) || 0;
      total += t;
      if (p.pagado) pagado += t;
      if (p.estado !== 'Entregado') sinEntregar++;
    });
    return {
      pedidos: pedidos,
      rondas: pedidos.length,
      total: total,
      pagado: pagado,
      debe: Math.max(0, total - pagado),
      sinEntregar: sinEntregar
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

  /* Cierra la cuenta. La mesa queda libre y el proximo pedido abre una nueva. */
  function cerrarSesion(sb, id, quien) {
    if (!sb || !id) return Promise.resolve(false);
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
    if (propias && propias[plato.id]) return propias[plato.id];
    return plato.photo ? (IMG_BASE + plato.photo) : null;
  }

  /* Sube la foto y la deja asociada al plato.
     Resuelve { ok, motivo, url }.                                         */
  function subirFotoPlato(sb, platoId, file, quien) {
    if (!sb) {
      return Promise.resolve({ ok: false, motivo: 'No hay conexion con el sistema.' });
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
                  'En el iPhone: Ajustes > Camara > Formatos > "Mas compatible", ' +
                  'y sacala de nuevo. O mandatela por WhatsApp y guarda esa copia.'
        };
      }
      if (blob.size > 5 * 1024 * 1024) {
        return { ok: false, motivo: 'La imagen sigue pesando mas de 5 MB.' };
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
      return { ok: false, motivo: 'No pudimos subir la foto. Proba de nuevo.' };
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
    pushRegistrado: pushRegistrado,
    contarSubs: contarSubs,
    listarSubs: listarSubs,
    borrarSub: borrarSub,
    WA_TABLE: WA_TABLE,
    FOTOS_TABLE: FOTOS_TABLE,
    SESIONES_TABLE: SESIONES_TABLE,
    NOTAS_TABLE: NOTAS_TABLE,
    ESTADOS: ESTADOS,
    AVISOS: AVISOS,
    avisarEstado: avisarEstado,
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
})(window);
