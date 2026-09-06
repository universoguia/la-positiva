self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'La Positiva';
  const options = {
    body: data.body || 'Tenés un aviso nuevo.',
    icon: 'https://la-positiva-phi.vercel.app/lp/bife.jpg',
    badge: 'https://la-positiva-phi.vercel.app/lp/bife.jpg',
    vibrate: [200, 100, 200, 100, 200],
    tag: data.pedidoId ? ('pedido-' + data.pedidoId) : 'la-positiva',
    renotify: true,
    data: { pedidoId: data.pedidoId || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/jonathan.html');
    })
  );
});