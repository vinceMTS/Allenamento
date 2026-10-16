// Fa funzionare l'app senza internet.
// Quando si cambia un file dell'app, aumentare VERSIONE: il telefono scarica la nuova versione.
// La scheda (scheda.json) invece si scarica sempre per prima, se c'è internet.
const VERSIONE = 'allenamento-v1';
const FILE = [
  './',
  'index.html',
  'app.css',
  'js/app.js',
  'js/logica.js',
  'js/dati.js',
  'scheda.json',
  'stampa.html',
  'stampa.js',
  'manifest.webmanifest',
  'icone/icona.svg',
  'icone/icona-192.png',
  'icone/icona-512.png',
  'icone/icona-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSIONE)
      .then((c) => c.addAll(FILE.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith('/scheda.json')) {
    // Prima la rete (con un limite di 4 secondi), poi la copia salvata.
    e.respondWith((async () => {
      const cache = await caches.open(VERSIONE);
      try {
        const risposta = await Promise.race([
          fetch(e.request, { cache: 'no-cache' }),
          new Promise((_, no) => setTimeout(() => no(new Error('lenta')), 4000)),
        ]);
        if (risposta.ok) cache.put('scheda.json', risposta.clone());
        return risposta;
      } catch {
        return (await cache.match('scheda.json')) || Response.error();
      }
    })());
    return;
  }

  // Tutto il resto: prima la copia salvata, poi la rete.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)),
  );
});
