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
self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}

  var title = data.title || 'La Positiva';
  // Icono de marca, no la foto de un plato.
  var options = {
    body: data.body || 'Tenes un aviso nuevo.',
    icon: new URL('icons/icon-192.png', self.registration.scope).href,
    badge: new URL('icons/icon-192.png', self.registration.scope).href,
    vibrate: [200, 100, 200],
    tag: data.pedidoId ? ('pedido-' + data.pedidoId) : 'la-positiva',
    renotify: true,
    data: {
      pedidoId: data.pedidoId || null,
      url: new URL(data.url || 'caja.html', self.registration.scope).href
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
