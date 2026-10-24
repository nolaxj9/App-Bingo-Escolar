# Arquitectura

Bingo Escolar es una PWA: React 18 + Vite + TypeScript estricto + Tailwind 3. El sorteo es 100 % cliente; desde la v2 un Cloudflare Worker con D1 (`worker/`) atiende solo el acceso pago en `/api/*` (PLAN §12). El plan técnico original está en [PLAN.md](PLAN.md) y es la fuente de verdad de nombres y contratos; este documento describe cómo quedó implementado y los desvíos.

```
Navegador
 ├── React (App.tsx)  ←  hooks: useBingo / useSettings / useSpeech / useOnlineStatus
 │        │                         │            │            │
 │   componentes              services/bingoEngine (funciones puras)
 │                            services/persistence  → localStorage
 │                            services/sound         → Web Audio
 │                            hooks/useSpeech        → SpeechSynthesis
 └── Service worker propio (sw.js) → Cache Storage (solo archivos de la app)
```

## Principios

1. **El estado se deriva de `draws`.** Se guarda solo `{ schema, range, draws[{number, at}], startedAt }`. El número actual, los restantes y el estado (`idle` / `playing` / `finished`) se calculan, así no pueden quedar inconsistentes.
2. **Motor puro.** `src/services/bingoEngine.ts` no usa React ni efectos: `drawNumber` y `undoLast` devuelven un estado nuevo sin mutar el anterior. El azar es inyectable (`RandomInt`) para probarlo.
3. **Voz, sonido y animación son decorativos.** Se disparan después de calcular y guardar el número y dentro de `try/catch`; si fallan o no existen, el sorteo sigue igual.
4. **Sin dependencias de red.** Fuentes con `@fontsource-variable` (woff2 empaquetados), íconos `lucide-react` (SVG en el bundle), sonidos sintetizados.

## Motor del sorteo

- `cryptoRandomInt(n)`: `crypto.getRandomValues` con muestreo por rechazo (se descartan los valores ≥ `floor(2^32 / n) * n`), sin sesgo de módulo. Respaldo a `Math.random` solo si no existe `crypto`.
- `drawNumber` elige uniformemente entre los números **restantes**, así nunca se repite y siempre termina en exactamente `max - min + 1` extracciones.
- `validateRange`: enteros, `min ≥ 1`, `max ≤ 999`, `max > min`, tamaño entre 5 y 300. Devuelve un mensaje en español.
- `isValidGameState` se usa al leer del almacenamiento: schema, rango válido, números enteros dentro del rango, sin repetidos y `at` finito.

## Persistencia

- `localStorage` (síncrono, se guarda antes de que el usuario pueda cerrar la pestaña). Claves `bingo-escolar:game` y `bingo-escolar:settings`, ambas con `schema`.
- `loadGame()` → `{ game, error }`. JSON inválido o partida inconsistente: se **copia** el valor crudo a `bingo-escolar:game:corrupt-<timestamp>`, se arranca una partida nueva y se avisa (`corrupt`). Esquema mayor que el conocido: no se toca ni se pisa (`unsupported`); la app juega en memoria y `useBingo` no escribe esa clave.
- `saveGame()` devuelve `null` o `'quota'` / `'unavailable'`; nunca lanza. Todo acceso a `localStorage` está en `try/catch` (modo privado, bloqueo, cuota llena).
- `StorageWarning` muestra el mensaje correspondiente; la partida sigue funcionando en memoria.
- Una actualización de la app nunca borra la partida: el service worker solo usa Cache Storage. Una migración futura de esquema debe pasar por `migrate()`.
- `useBingo` escucha el evento `storage` para refrescar si otra pestaña cambia la partida (por ejemplo, un proyector en otra ventana de la misma PC).

## Anti doble toque

`useBingo.draw()` toma un cerrojo sincrónico (`useRef<boolean>`, no estado de React, que llega tarde). Mientras está tomado devuelve `null`. Se libera a los 700 ms con animaciones o 300 ms sin ellas; `isDrawing` atenúa el botón (`aria-disabled`, sin perder el foco). El número se muestra **inmediatamente**: la animación no demora el resultado.

## Voz (`useSpeech`)

`supported` exige que existan `speechSynthesis` y `SpeechSynthesisUtterance` (y que no sean `undefined`). Las voces se leen con `getVoices()` y se recargan con `voiceschanged` (en Android llegan tarde). Se filtran las de idioma `es*` y se ordenan es-AR, es-419, es-US, es-MX, es-ES; si no hay ninguna se usa `lang = 'es-AR'` sin voz explícita. `announce` hace `cancel()`, crea el `Utterance` ("¡Salió el número cuarenta y dos!", con `numberToWords`) y llama a `speak`, todo en `try/catch` y sin esperar nada.

## PWA y modo sin conexión

- `public/manifest.webmanifest` (standalone, `start_url: "./"`, íconos 192/512, maskable y SVG). `base: './'` en Vite permite publicar en una subcarpeta (GitHub Pages).
- **Service worker propio** (`serviceWorkerPlugin` en `vite.config.ts`, ≈60 líneas generadas, sin workbox): en `generateBundle` toma los archivos del bundle (JS, CSS, woff2) más los de `public/`, `index.html` y `./`, y emite `sw.js` con `CACHE = 'bingo-escolar-<hash>'` (hash de nombres y contenido) y `ASSETS = [...]`.
  - `install`: `cache.addAll(ASSETS)` + `skipWaiting()`.
  - `activate`: borra las cachés `bingo-escolar-*` viejas + `clients.claim()`.
  - `fetch` (GET del mismo origen): navegaciones → red primero y, sin red, el `index.html` guardado; recursos → caché primero, luego red. Se usa `ignoreVary` porque los scripts de módulo piden con `Origin` y algunos servidores responden `Vary: Origin`.
- `registerSW.ts` registra `./sw.js` solo si `import.meta.env.PROD` y expone `useOfflineReady()` (a partir de `navigator.serviceWorker.ready`) para el cartel de Ajustes.
- Cuando sale una versión nueva, el SW nuevo se instala y toma el control; la página abierta sigue con su código hasta recargar. La partida guardada no se toca.

## Interfaz

- Vistas por estado (`'sorteo' | 'tablero' | 'historial' | 'ajustes'`) y `projector: boolean`, sin react-router. `#proyector` abre el modo proyector (se actualiza con `history.replaceState`).
- `Header` / contenido desplazable / `TabBar` abajo (≥ 60 px). En la pestaña Sorteo los botones quedan fijos abajo (`sticky`), al alcance del pulgar; en ≥ 1024 px el tablero aparece a la derecha.
- Paleta bolilla de bingo: crema `#fffaf2`, rojo `brand-600/700`, amarillo `#facc15`, tinta `#1f2937`, azul noche para el proyector. Bolillas por decena (`ballColor.ts`) con contraste ≥ 4,5:1 con texto blanco (hay una prueba que lo verifica).
- Accesibilidad: objetivos táctiles ≥ 48 px, foco visible, `aria-live="assertive"` ("Salió el 42"), `aria-label` en cada celda del tablero, `role="alertdialog"` con foco inicial en "cancelar" y Escape que cancela, estado de la partida con texto y no solo color.
- Modo proyector: `requestFullscreen` (si falla, sigue sin pantalla completa), Escape y botón "Salir", Espacio/Enter para sacar. Orientación por `landscape:` de Tailwind y variable CSS `--pball`.

## Pruebas

- **Unitarias** (`src/__tests__/`): motor, persistencia (JSON corrupto, cuota, almacenamiento no disponible, esquema futuro), `numberToWords`, `historyText`/`ballColor`, `useBingo` (doble llamada, recarga, error de guardado, evento `storage`), `useSpeech` y `App` completa con Testing Library.
- **E2E** (`scripts/e2e.mjs`): Playwright (`playwright-core`) con el Chromium del sistema contra `vite preview` en un puerto libre; ver [VERIFICACION.md](VERIFICACION.md).
- `scripts/test.sh`: vitest + tsc + build con resumen y código de salida.

## Desvíos respecto del plan

Pequeños ajustes hechos durante la implementación; ninguno cambia los contratos del §3–§6.

1. **`useBingo({ animationsEnabled })`**: el plan lo declara como `useBingo()`; recibe un objeto de opciones opcional porque el cerrojo dura 700 ms o 300 ms según las animaciones (§6) y el hook necesita saberlo.
2. **`Toggle.tsx`** (interruptor reutilizable) se agregó a los componentes; lo usan `VoiceControls` y `SettingsPanel`.
3. **Lista del servicio worker con `ignoreVary` e `ignoreSearch`**: no está en el plan; apareció en la prueba sin conexión (con `vite preview` los scripts de módulo no encontraban su copia por `Vary: Origin`).
4. **Números anteriores**: la fila "Antes" de la pantalla Sorteo muestra los 5 anteriores al actual (el actual ya está en la bolilla grande) y el proyector muestra los 8 anteriores. En pantallas bajas (< 650 px de alto) se oculta la fila "Antes" y la bolilla se achica un poco para que entren estadísticas y botones.
5. **Botones del proyector**: "Salir" y "Sacar" son botones redondos con ícono (con `aria-label`) arriba a los costados del título, para que no tapen el tablero.
6. **Tipos de `vite/client`** se agregaron a `tsconfig.json` para `import.meta.env`.
7. **nginx**: además de la CSP del plan se agregan `Cache-Control: immutable` a `/assets/`, `no-cache` a `index.html`, `sw.js` y el manifiesto (cabeceras repetidas por location porque nginx no hereda `add_header` si el location define alguna).
8. **Dockerfile y `nginx.conf` no se pudieron ejecutar en este entorno** (no hay demonio de Docker): están escritos siguiendo el proyecto de referencia pero **sin probar**. Ver [VERIFICACION.md](VERIFICACION.md).

### Acceso pago (v2, PLAN §12)

9. **Panel con contraseña en vez de Cloudflare Access.** El plan hablado con el dueño proponía proteger `/admin` con Cloudflare Access. Se cambió por una contraseña (`ADMIN_PASSWORD`) y una cookie firmada: Access en `workers.dev` protege el sitio entero (también la app pública) y exige más pasos de configuración.
10. **`/admin/...` redirige a `/admin`** (el Worker atiende `/admin/*` primero): con `base: './'` las rutas relativas de los assets se romperían bajo una subcarpeta.
11. **Métodos no permitidos** responden 405 con `datos_invalidos` (no hay un `CodigoError` propio). `POST /api/admin/logout` no exige sesión ni JSON: siempre borra la cookie.
12. **Intentos fallidos de activación**: cuentan solo el código mal formado (400) y el inexistente (404); vencido, revocado y sin dispositivos no cuentan. En el login, el bloqueo se revisa antes de comparar la contraseña.
13. **Alta de dispositivo atómica**: un solo `INSERT ... WHERE (SELECT COUNT(*)) < max`, sin carrera entre dos activaciones simultáneas.
14. **App**: un permiso con firma o dispositivo incorrecto se descarta al abrir sin ir a la red; uno vencido igual intenta renovarse (puede haberse extendido); la renovación se reintenta con el evento `online`. "Quitar acceso de este dispositivo" no avisa al servidor: el lugar se libera desde el panel.
