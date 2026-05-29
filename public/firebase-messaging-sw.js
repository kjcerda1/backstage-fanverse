// firebase-messaging-sw.js — Backstage Fanverse push notification service worker
// Handles background FCM messages when the app is not in focus.
// Config is injected at runtime via postMessage from the main thread.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

let messaging = null;

// Receive Firebase config from the main thread (avoids hardcoding env vars in SW)
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'FIREBASE_CONFIG') return;
  if (messaging) return; // already initialized

  try {
    const app = firebase.initializeApp(event.data.config);
    messaging = firebase.messaging(app);

    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || 'Backstage';
      const body  = payload.notification?.body  || '';
      const { targetModal, targetTab, targetId } = payload.data || {};

      self.registration.showNotification(title, {
        body,
        icon:  '/fanverse-logo.png',
        badge: '/fanverse-logo.png',
        tag:   targetModal || targetTab || 'backstage-notif',
        data:  { targetModal, targetTab, targetId, origin: self.location.origin },
      });
    });
  } catch (err) {
    console.warn('[SW] Firebase init failed:', err.message);
  }
});

// Deep-link on notification click — routes into the correct Backstage screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { targetModal, targetTab, origin } = event.notification.data || {};
  const dest = targetModal || targetTab || '';
  const url  = `${origin || self.location.origin}?notif=${dest}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIF_CLICK', targetModal, targetTab });
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});
