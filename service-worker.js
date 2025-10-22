// A basic service worker for PWA installation and offline support

const CACHE_NAME = 'transcuraboo-cache-v1';
// Note: This list should be expanded to include all critical assets for a full offline experience.
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com',
];

// Install event: cache the essential app shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event: serve cached content when offline
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      })
  );
});
