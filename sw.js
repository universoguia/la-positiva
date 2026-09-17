/* ==========================================================================
   La Positiva - service worker
   Solo se ocupa de Web Push y del ciclo de actualizacion. No cachea nada:
   la demo necesita datos frescos de Supabase en cada carga.
   ========================================================================== */

// Actualizacion controlada: la version nueva toma el control enseguida.
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* ------------------------------------------------------------- push ---- */
/* Un tag por pedido Y por tipo de aviso. El tipo sale del titulo, que ya
   viaja en el payload: "Pedido nuevo", "La cocina tomo el pedido", "Pedido
   entregado", "Pago confirmado". */
function tagDelAviso(data, title) {
  var tipo = String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // saca acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'aviso';
  return data.pedidoId ? ('pedido-' + data.pedidoId + '-' + tipo)
                       : ('la-positiva-' + tipo);
}

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  var title = data.title || 'La Positiva';
  /* A donde lleva el aviso. Lo decide quien lo manda: un pedido nuevo tiene
     que abrir el panel de cocina, no la caja. Si el emisor no lo dice se
     mantiene el destino historico para no romper los avisos de pago.     */
  var destino = data.url || 'caja.html';

  /* Un pedido que hay que cocinar no puede desaparecer solo a los pocos
     segundos: queda fijo hasta que alguien lo toque.                     */
  var insistir = data.requireInteraction === true;

  // Icono de marca, no la foto de un plato.
  var options = {
    body: data.body || 'Tenes un aviso nuevo.',
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    vibrate: [200, 100, 200],
    /* El tag agrupa: dos avisos con el MISMO tag se pisan en pantalla. Antes
       todos los avisos de un pedido compartian 'pedido-<id>', asi que "Pago
       confirmado" borraba a "La cocina tomo el pedido" y solo quedaba el
       ultimo. Ahora el tipo de aviso entra en el tag, asi que cada paso deja
       su propia notificacion; y si el MISMO paso se repite, sigue pisandose
       -que es lo que se quiere- en vez de acumular duplicados.          */
    tag: tagDelAviso(data, title),
    renotify: true,
    requireInteraction: insistir,
    data: {
      pedidoId: data.pedidoId || null,
      url: new URL(destino, self.registration.scope).href
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});


/* Que pantalla es una URL, sin el ?mesa=5 ni el #ancla: 'mozo.html'. Comparar
   la URL entera daria falso justo cuando dos ventanas estan en la misma
   pantalla con parametros distintos, que es el caso que mas importa acertar. */
function pantallaDe(url) {
  try {
    return new URL(url, self.registration.scope).pathname.split('/').pop() || '';
  } catch (e) {
    return String(url || '');
  }
}

/* ------------------------------------------------- click en el aviso --- */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) ||
               self.registration.scope;

  /* Cual ventana se usa, y en que orden.

     Antes esto agarraba la PRIMERA ventana que colgara del scope y le hacia
     navigate() sin fijarse cual era. El orden de matchAll no esta garantizado,
     asi que en un local con dos telefonos pasaba esto: el cocinero tocaba su
     aviso y la ventana que se llevaba puesta era la del mozo, con media
     comanda cargada. El mozo perdia el trabajo y no entendia por que.

     Ahora se prueban cuatro caminos, de menos a mas invasivo, y solo se le
     roba una ventana a alguien cuando no queda otra.                      */
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        var mias = list.filter(function (c) {
          return c.url.indexOf(self.registration.scope) === 0 && 'focus' in c;
        });
        if (!mias.length) {
          return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
        }

        var destino = pantallaDe(target);

        /* 1. Ya hay una ventana EN la pantalla del aviso. Se enfoca y listo:
              no se navega nada, asi que no se pierde nada. */
        for (var i = 0; i < mias.length; i++) {
          if (pantallaDe(mias[i].url) === destino) return mias[i].focus();
        }

        /* 2. Hay una ventana en la portada. Esa no tiene trabajo a medias
              -es la pantalla de elegir quien sos-, asi que es la unica que se
              puede navegar sin costo para nadie. */
        for (var j = 0; j < mias.length; j++) {
          var enPortada = pantallaDe(mias[j].url);
          if (enPortada === '' || enPortada === 'index.html') {
            if ('navigate' in mias[j]) {
              return mias[j].navigate(target).then(function (nc) {
                return (nc || mias[j]).focus();
              });
            }
          }
        }

        /* 3. Todas las ventanas estan ocupadas en otra pantalla. Antes que
              robarle una a alguien, se abre una nueva. El click en un aviso
              cuenta como gesto del usuario, asi que openWindow tiene permiso. */
        if (self.clients.openWindow) {
          return self.clients.openWindow(target).then(function (w) {
            /* 4. Ultimo recurso: si el navegador no la dejo abrir -pasa en la
                  app instalada, donde hay una sola ventana- recien ahi se
                  navega la que habia. Es el comportamiento viejo, pero ahora
                  es la excepcion y no la regla. */
            if (w) return w;
            var c = mias[0];
            if ('navigate' in c && c.url !== target) {
              return c.navigate(target).then(function (nc) { return (nc || c).focus(); });
            }
            return c.focus();
          }, function () {
            var c = mias[0];
            if ('navigate' in c && c.url !== target) {
              return c.navigate(target).then(function (nc) { return (nc || c).focus(); });
            }
            return c.focus();
          });
        }

        var ultima = mias[0];
        if ('navigate' in ultima && ultima.url !== target) {
          return ultima.navigate(target).then(function (nc) { return (nc || ultima).focus(); });
        }
        return ultima.focus();
      })
  );
});
