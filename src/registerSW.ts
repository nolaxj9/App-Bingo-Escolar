import { useSyncExternalStore } from 'react';

/** Registra el service worker propio (solo en producción) y avisa cuando la app quedó lista sin Internet. */
let offlineReady = false;
const listeners = new Set<() => void>();

function setReady() {
  if (offlineReady) return;
  offlineReady = true;
  listeners.forEach((l) => l());
}

export function registerSW(): void {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const start = () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(setReady)
      .catch(() => {
        /* sin service worker la app sigue funcionando con conexión */
      });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

/** true cuando el service worker está activo y los archivos ya están guardados. */
export function useOfflineReady(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => offlineReady,
    () => false,
  );
}
