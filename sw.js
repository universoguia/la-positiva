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

/* ------------------------------------------------- click en el aviso --- */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) ||
               self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        // Si ya hay una ventana de la app abierta, se enfoca esa.
        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {
            if ('navigate' in c && c.url !== target) {
              return c.navigate(target).then(function (nc) { return (nc || c).focus(); });
            }
            return c.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});
