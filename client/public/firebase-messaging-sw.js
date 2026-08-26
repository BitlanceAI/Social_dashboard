/* global importScripts, firebase, clients */
/**
 * Firebase Cloud Messaging service worker.
 *
 * Handles notifications that arrive while the site is closed or backgrounded.
 * Service workers cannot read Vite env vars, so the config is passed as query
 * params when the page registers this file (see src/lib/push.js).
 */

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

// Cloud Messaging needs only these four; authDomain and storageBucket
// belong to Firebase Auth / Storage, which this app does not use.
firebase.initializeApp({
    apiKey: params.get('apiKey'),
    projectId: params.get('projectId'),
    messagingSenderId: params.get('messagingSenderId'),
    appId: params.get('appId'),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    self.registration.showNotification(title || 'Bitlance', {
        body: body || '',
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: { url: (payload.data && payload.data.url) || '/' },
    });
});

// Clicking the notification should focus an existing tab rather than opening
// a duplicate one.
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            for (const client of windows) {
                if (client.url.includes(target) && 'focus' in client) return client.focus();
            }
            return clients.openWindow(target);
        })
    );
});
