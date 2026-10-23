/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Lista recursiva de archivos de una carpeta (rutas relativas con "/"). */
function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full).split('\\').join('/')];
  });
}

const HOSTING_CONFIG = new Set(['_headers', '_redirects']);

/**
 * Service worker propio (sin workbox): en el build emite `sw.js` con la lista exacta de
 * archivos del bundle (JS, CSS, fuentes) más los de `public/` y la raíz `./` (que es index.html).
 * El nombre de la caché lleva un hash del contenido: cada versión nueva tiene su propia caché
 * y el `activate` borra las anteriores. El SW solo toca Cache Storage, nunca localStorage.
 */
function serviceWorkerPlugin(): Plugin {
  const publicDir = resolve(import.meta.dirname, 'public');
  return {
    name: 'bingo-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      // Solo "./": Cloudflare redirige /index.html a / y una respuesta redirigida no sirve para navegar.
      const assets = new Set<string>(['./']);
      for (const [file, item] of Object.entries(bundle)) {
        assets.add(file);
        hash.update(file);
        if (item.type === 'chunk') hash.update(item.code);
        else if (typeof item.source === 'string' || item.source instanceof Uint8Array) hash.update(item.source);
      }
      for (const file of walk(publicDir).sort()) {
        // _headers/_redirects son configuración de Cloudflare: el hosting no los sirve.
        if (HOSTING_CONFIG.has(file) || file === 'index.html') continue;
        assets.add(file);
        hash.update(file).update(readFileSync(join(publicDir, file)));
      }
      const list = [...assets].sort();
      const cacheName = `bingo-escolar-${hash.digest('hex').slice(0, 12)}`;
      const source = `// Generado por vite.config.ts (serviceWorkerPlugin). No editar a mano.
const CACHE = ${JSON.stringify(cacheName)};
const ASSETS = ${JSON.stringify(list, null, 2)};
// ignoreVary: los scripts de módulo piden con Origin y algunos servidores responden "Vary: Origin".
const OPTS = { ignoreSearch: true, ignoreVary: true };

// Una respuesta que vino de una redirección no se puede usar para una navegación: se copia limpia.
function clean(res) {
  if (!res || !res.redirected) return res;
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bingo-escolar-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Navegación: red primero; sin red, abre la copia guardada de la app.
    event.respondWith(
      fetch(req).catch(() => caches.match(self.registration.scope, OPTS).then(clean)),
    );
    return;
  }
  // Recursos: caché primero (los archivos con hash no cambian), luego red.
  event.respondWith(caches.match(req, OPTS).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorkerPlugin()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
