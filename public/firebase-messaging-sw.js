// firebase-messaging-sw.js — Backstage Fanverse push notification service worker
// Handles background FCM messages when the app is not in focus.
//
// Config arrives as query params on this script's URL (built in
// requestNotificationPermission in App.jsx) and is read at TOP LEVEL.
// This matters: service workers are terminated when idle and revived by the next
// push event, and a revived worker never re-receives the one-time postMessage the
// page sent at registration time. Initializing inside a `message` listener left
// every revived worker with no onBackgroundMessage handler, so FCM accepted the
// push (delivered:N) and the device silently showed nothing.
//
// Version must match the `firebase` package used by the app bundle — a page on
// v12 talking to a worker on v10 can disagree about payload shape.

importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

// Take over as soon as a new version installs. An installed PWA is almost never
// fully closed, so without this an updated worker sits in "waiting" indefinitely
// and the device keeps running whatever it cached weeks ago.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey:            params.get('apiKey'),
  authDomain:        params.get('authDomain'),
  projectId:         params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId:             params.get('appId'),
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    const app = firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging(app);

    messaging.onBackgroundMessage((payload) => {
      // A payload carrying a `notification` block is displayed by the Firebase SDK
      // itself before this handler runs — drawing our own here would show the same
      // alert twice. Only data-only payloads need us to render.
      if (payload.notification) return;

      const d = payload.data || {};
      self.registration.showNotification(d.title || 'Backstage', {
        body:  d.body || '',
        icon:  '/fanverse-logo.png',
        badge: '/fanverse-logo.png',
        tag:   d.targetModal || d.targetTab || 'backstage-notif',
        data:  {
          targetModal: d.targetModal,
          targetTab:   d.targetTab,
          targetId:    d.targetId,
          origin:      self.location.origin,
        },
      });
    });
  } catch (err) {
    console.warn('[SW] Firebase init failed:', err.message);
  }
}

// Deep-link on notification click — routes into the correct Backstage screen
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Notifications we drew put the routing keys directly on `data`. Ones the Firebase
  // SDK drew (any payload with a `notification` block) wrap the original message
  // under FCM_MSG, so read both or SDK-drawn notifications lose their deep link.
  const raw = event.notification.data || {};
  const fcm = raw.FCM_MSG?.data || {};
  const targetModal = raw.targetModal || fcm.targetModal || '';
  const targetTab   = raw.targetTab   || fcm.targetTab   || '';
  // Fall back before use: `origin` is absent on SDK-drawn notifications, and
  // startsWith(undefined) below would never match, always opening a new window.
  const origin = raw.origin || self.location.origin;
  const dest   = targetModal || targetTab || '';
  const url    = `${origin}?notif=${dest}`;

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
