/* ============================================
   UTS SOCIAL - SERVICE WORKER
   Version : 1.0.0
   Rôle : Mode hors ligne + cache intelligent
   ============================================ */

const CACHE_NAME = 'uts-social-v1.0.0';

// Fichiers essentiels à mettre en cache dès l'installation
const FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './logo-192.png',
    './logo-512.png',
    './thomas-sankara.jpg'
];

// Domaines à NE PAS intercepter (Firebase, YouTube, Archive.org, Piped gèrent leur propre cache)
const BYPASS_DOMAINS = [
    'firestore.googleapis.com',
    'firebaseapp.com',
    'firebaseio.com',
    'googleapis.com',
    'gstatic.com',
    'youtube.com',
    'ytimg.com',
    'googlevideo.com',
    'archive.org',
    'pipedapi',
    'tailwindcss.com',
    'cdnjs.cloudflare.com',
    'jsdelivr.net'
];

/* ============================================
   1. INSTALLATION
   Met en cache les fichiers de base
   ============================================ */
self.addEventListener('install', (event) => {
    console.log('📦 [SW] Installation en cours...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 [SW] Mise en cache des fichiers de base');
                return cache.addAll(FILES_TO_CACHE).catch((err) => {
                    console.warn('⚠️ [SW] Certains fichiers n\'ont pas pu être cachés:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

/* ============================================
   2. ACTIVATION
   Nettoie les anciens caches et prend le contrôle
   ============================================ */
self.addEventListener('activate', (event) => {
    console.log('🚀 [SW] Activation');
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => {
                            console.log('🗑️ [SW] Suppression ancien cache:', key);
                            return caches.delete(key);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

/* ============================================
   3. INTERCEPTION DES REQUÊTES
   Stratégie adaptée selon le type de ressource
   ============================================ */
self.addEventListener('fetch', (event) => {
    const req = event.request;

    // On ne gère que les GET
    if (req.method !== 'GET') return;

    // Ignorer les domaines Firebase, YouTube, Archive.org... (ils gèrent leur propre cache)
    const url = req.url.toLowerCase();
    if (BYPASS_DOMAINS.some((domain) => url.includes(domain))) {
        return;
    }

    // Ignorer les autres schémas (chrome-extension, etc.)
    if (!url.startsWith('http')) return;

    // === Stratégie A : Navigation (ouverture de l'app) ===
    // Cache-first avec fallback sur index.html
    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((c) => c.put('./index.html', clone));
                    return res;
                })
                .catch(() => {
                    // Hors ligne : on retourne l'index mis en cache
                    return caches.match('./index.html')
                        .then((cached) => cached || caches.match('./'));
                })
        );
        return;
    }

    // === Stratégie B : Images, CSS, JS, polices (Cache-first) ===
    // On sert depuis le cache, puis on met à jour en arrière-plan
    event.respondWith(
        caches.match(req).then((cached) => {
            // Récupération en arrière-plan pour mettre à jour le cache
            const networkFetch = fetch(req)
                .then((res) => {
                    if (res && res.status === 200 && res.type === 'basic') {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
                    }
                    return res;
                })
                .catch(() => null);

            // Si en cache, on retourne direct (rapide, marche hors ligne)
            if (cached) {
                return cached;
            }

            // Sinon on attend le réseau
            return networkFetch.then((res) => {
                if (res) return res;
                // Si vraiment rien, on retourne une image placeholder vide
                if (req.destination === 'image') {
                    return new Response('', { status: 404 });
                }
                return new Response('Hors ligne', { status: 503 });
            });
        })
    );
});

/* ============================================
   4. MESSAGE DEPUIS L'APP
   Permet à l'app de forcer la mise à jour du SW
   ============================================ */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key));
        });
    }
});

/* ============================================
   5. NOTIFICATION DE MISE À JOUR
   ============================================ */
self.addEventListener('activate', () => {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
            client.postMessage({
                type: 'SW_ACTIVATED',
                version: CACHE_NAME
            });
        });
    });
});
