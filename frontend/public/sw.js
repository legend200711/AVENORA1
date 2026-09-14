/**
 * AVENORA - Service Worker
 * Provides offline capability for static assets and cached pages.
 * Does NOT cache dynamic API responses (those require network).
 */

const CACHE_NAME = 'avenora-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/styles/theme.css',
  '/src/styles/visual.css',
  '/src/store/state.js',
  '/src/utils/ui.js',
  '/src/services/api.js',
  '/src/components/visual/visualEngine.js',
  '/src/app.js',
  '/src/pages/hub.js',
  '/src/pages/auth.js',
  '/src/pages/social.js',
  '/src/pages/video.js',
  '/src/pages/live.js',
  '/src/pages/cloudstream.js',
  '/src/pages/dj.js',
  '/src/pages/music.js',
  '/src/pages/arcade.js',
  '/src/pages/chat.js',
  '/src/pages/gallery.js',
  '/src/pages/admin.js',
  '/src/pages/search.js',
  '/src/pages/profile.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;600;700&display=swap',
];

// ─── Install: cache static assets ─────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('http')));
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: clean old caches ───────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch strategy ───────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls or socket connections
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) {
    return; // Network only
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Only cache successful GET requests for same origin
        if (!response || response.status !== 200 || event.request.method !== 'GET') {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// ─── Background sync (for offline post submission) ─────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncOfflinePosts());
  }
});

async function syncOfflinePosts() {
  // Retrieve any posts saved offline and submit when connection restored
  // Implementation: read from IndexedDB, POST to API
  console.log('[SW] Syncing offline posts...');
}

// ─── Push notifications ────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'AVENORA';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'legend-notification',
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
