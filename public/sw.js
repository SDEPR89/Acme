// Kurhona Service Worker — deadline notification scheduler
// Receives a list of { id, title, body, fireAt } from the main thread,
// stores them in a Map keyed by notification id, and fires each one
// via setTimeout when the time arrives.

const scheduledTimers = new Map(); // notificationId → timeoutId

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, notifications } = event.data ?? {};

  if (type === 'SCHEDULE_NOTIFICATIONS') {
    // Cancel all existing timers first — we always receive the full
    // current schedule so a full replace is safe.
    for (const timerId of scheduledTimers.values()) {
      clearTimeout(timerId);
    }
    scheduledTimers.clear();

    const now = Date.now();

    for (const notif of notifications ?? []) {
      const delay = notif.fireAt - now;
      if (delay < 0) continue; // already past — skip

      const timerId = setTimeout(() => {
        self.registration.showNotification(notif.title, {
          body: notif.body,
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: notif.id,          // deduplicates if re-scheduled
          requireInteraction: false,
          data: { url: self.location.origin },
        });
        scheduledTimers.delete(notif.id);
      }, delay);

      scheduledTimers.set(notif.id, timerId);
    }
  }

  if (type === 'CANCEL_ALL') {
    for (const timerId of scheduledTimers.values()) {
      clearTimeout(timerId);
    }
    scheduledTimers.clear();
  }
});

// Clicking a notification focuses the app (or opens a new tab if closed)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? self.location.origin;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
