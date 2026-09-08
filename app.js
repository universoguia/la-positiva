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
    Cocina: 'cocina.html'
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
  var FUNCIONES_POR_ROL = {
    Duenio: [
      { url: 'admin.html',       texto: 'C\u00f3mo viene el sal\u00f3n' },
      { url: 'mesas.html',       texto: 'El sal\u00f3n y las cuentas' },
      { url: 'mozo.html',        texto: 'Los pedidos de las mesas' },
      { url: 'cocina.html',      texto: 'Las comandas' },
      { url: 'caja.html',        texto: 'Los pagos' },
      { url: 'cobrar.html',      texto: 'Cobrar con QR' },
      { url: 'carta-fotos.html', texto: 'La carta y lo que se termin\u00f3' },
      { url: 'qr-mesa.html',     texto: 'Los QR de las mesas' }
    ],
    /* El mozo tiene tres caminos, en el orden del servicio: tomar la comanda,
       gestionar las mesas, cobrar. Desde ahi ve todo lo que ya existe:
       aprobado, cocinando, entregado, cobrado. */
    Mozo: [
      { url: 'mozo.html',   texto: 'Tomar comanda' },
      { url: 'mesas.html',  texto: 'Gestionar mesas' },
      { url: 'cobrar.html', texto: 'Cobrar con QR' }
    ],
    Caja: [
      { url: 'caja.html',   texto: 'Los pagos' },
      { url: 'cobrar.html', texto: 'Mostrar el QR de cobro' }
    ],
    Cocina: [
      { url: 'cocina.html',      texto: 'Las comandas' },
      /* Va a la carta entera y NO al filtro de agotados: si preseleccionara
         "solo los que se terminaron", el cocinero caeria en una lista vacia
         justo cuando todavia no marco nada, que es siempre la primera vez. */
      { url: 'carta-fotos.html', texto: 'Marcar lo que se termin\u00f3' }
    ]
  };

  function funcionesDe(rol) { return FUNCIONES_POR_ROL[rol] || []; }

  /* Escribe quien sos en las pantallas que tengan un [data-quien].
     Se llama sola al cargar app.js: asi ninguna pantalla se puede olvidar
     de decirlo, que es lo que pidio el duenio.                          */
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
    var cuerpo = pedido.mesa + ' pago ' + money(cobrable(pedido)) + '. Ya podés seguir.';

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
                  'En el iPhone: Ajustes > Camara > Formatos > "Mas compatible", ' +
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

  function qrActivo(sb) {
    if (!sb) return Promise.resolve(null);
    return sb.from(COBROS_TABLE).select('*')
      .eq('activo', true).order('created_at', { ascending: false })
      .limit(1).maybeSingle()
      .then(function (res) {
        // false = no pudimos consultar. null = no hay QR. No es lo mismo.
        if (res.error) { humanError(res.error); return false; }
        return res.data;
      }, function (e) { humanError(e); return false; });
  }

  function subirQR(sb, file, etiqueta, quien) {
    if (!sb) return Promise.reject(new Error('sin cliente'));
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
    AGOTADOS_TABLE: AGOTADOS_TABLE,
    AJUSTES_TABLE: AJUSTES_TABLE,
    PRECIOS_TABLE: PRECIOS_TABLE,
    CUBIERTO_ID: CUBIERTO_ID,
    ajustes: ajustes,
    guardarAjuste: guardarAjuste,
    importeCubierto: importeCubierto,
    cubiertoParaSesion: cubiertoParaSesion,
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
    estadoDeMesa: estadoDeMesa,
    reservarMesa: reservarMesa,
    NOTAS_TABLE: NOTAS_TABLE,
    PERSONAS_TABLE: PERSONAS_TABLE,
    personas: personas,
    quienSoy: quienSoy,
    entrarComo: entrarComo,
    salir: salir,
    pantallaDe: pantallaDe,
    FUNCIONES_POR_ROL: FUNCIONES_POR_ROL,
    funcionesDe: funcionesDe,
    mostrarQuienSoy: mostrarQuienSoy,
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mostrarQuienSoy);
  } else {
    mostrarQuienSoy();
  }
})(window);
