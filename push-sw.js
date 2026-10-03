// Push only: no fetch handler, offline cache or stored authentication tokens.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
const safeTarget = value => typeof value === 'string' && /^\/#(?:notifiche|privata-[\w-]+)$/.test(value) ? value : '/#notifiche';
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { /* Display a safe fallback. */ }
  event.waitUntil(self.registration.showNotification('BuyYourShare', {
    body: typeof data.body === 'string' ? data.body.slice(0, 180) : 'Hai un nuovo promemoria nel marketplace.',
    icon: '/push-icon-192.png', badge: '/push-icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag : 'bys-reminder',
    data: { url: safeTarget(data.url) }, renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(safeTarget(event.notification.data?.url), self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => new URL(c.url).origin === self.location.origin);
    if (client) { await client.navigate(url); return client.focus(); }
    return self.clients.openWindow(url);
  })());
});
