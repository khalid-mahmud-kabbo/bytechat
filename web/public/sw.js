// ByteChat service worker: shows push notifications when the app is closed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    /* ignore */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'ByteChat', {
      body: data.body || '',
      tag: data.tag,
      data: { chatId: data.chatId },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const chatId = event.notification.data && event.notification.data.chatId;
  const url = chatId ? '/chats?c=' + encodeURIComponent(chatId) : '/chats';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) return client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
