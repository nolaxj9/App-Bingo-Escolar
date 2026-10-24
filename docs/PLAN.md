# Bingo Escolar — Plan técnico de implementación

Documento de arquitectura. Es la fuente de verdad para nombres, contratos y decisiones.
Si una implementación necesita apartarse, se documenta en `docs/ARCHITECTURE.md`, sección
"Desvíos respecto del plan".

Sigue el mismo método que Austral Hospital Smart (React + Vite + TypeScript estricto + Tailwind 3,
versiones exactas, Vitest + Testing Library, `scripts/test.sh`, `Makefile`, Dockerfile con nginx
endurecido, documentación en español en `docs/`). Diferencia principal: **no hay backend**. Es una
PWA 100 % cliente que funciona sin Internet después de la primera carga.

Sin apuestas, pagos ni dinero. Sin datos personales. Sin servicios externos.

## 1. Estructura del repositorio

```
bingo-escolar/
├── package.json  package-lock.json   # versiones exactas (sin ^ ni ~)
├── index.html                        # lang="es-AR", theme-color, link al manifiesto, apple-touch-icon
├── vite.config.ts                    # react() + plugin propio `serviceWorkerPlugin` (ver §7) + config de vitest
├── tsconfig.json  tailwind.config.js  postcss.config.js
├── Dockerfile  nginx.conf  .dockerignore  .gitignore
├── Makefile                          # dev, build, preview, test, e2e, icons, docker
├── README.md                         # español, mismo formato que Hospital Smart
├── docs/  PLAN.md ARCHITECTURE.md VERIFICACION.md TROUBLESHOOTING.md USO.md
├── scripts/
│   ├── test.sh                       # vitest + tsc + build; exit≠0 si algo falla; imprime resumen
│   ├── e2e.mjs                       # recorrido en Chromium real con Playwright (ver §10)
│   └── generate-icons.mjs            # rasteriza public/icons/icon.svg a PNG con Chromium (se corre a mano)
├── public/
│   ├── manifest.webmanifest
│   └── icons/ icon.svg icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png
└── src/
    ├── main.tsx  App.tsx  index.css  test-setup.ts  registerSW.ts
    ├── types/bingo.ts
    ├── services/   bingoEngine.ts  persistence.ts  numberToWords.ts  sound.ts  historyText.ts  ballColor.ts
    ├── hooks/      useBingo.ts  useSettings.ts  useSpeech.ts  useOnlineStatus.ts
    ├── context/    ToastContext.tsx
    ├── components/ Ball.tsx CurrentNumber.tsx DrawButton.tsx GameStats.tsx NumberBoard.tsx
    │               DrawHistory.tsx ConfirmDialog.tsx VoiceControls.tsx SettingsPanel.tsx
    │               ProjectorView.tsx TabBar.tsx Header.tsx StorageWarning.tsx
    └── __tests__/  bingoEngine.test.ts persistence.test.ts numberToWords.test.ts historyText.test.ts
                    useBingo.test.tsx app.test.tsx speech.test.tsx
```

No se usa react-router: hay 4 pestañas y un modo proyector, que se manejan con estado
(`view: 'sorteo' | 'tablero' | 'historial' | 'ajustes'`) y `projector: boolean`.
El modo proyector también se abre con `#proyector` en la URL (útil para una segunda ventana).

## 2. Versiones (fijas, iguales a Hospital Smart)

react 18.3.1, react-dom 18.3.1, lucide-react 0.468.0, @fontsource-variable/figtree 5.1.1,
@fontsource-variable/bricolage-grotesque 5.1.0 (fuentes empaquetadas: funcionan sin Internet).
Dev: vite 8.3.5, @vitejs/plugin-react 6.1.2, typescript 5.6.3, tailwindcss 3.4.19, postcss 8.5.31,
autoprefixer 10.6.1, vitest 5.0.5, jsdom 30.1.3, @testing-library/react 16.1.0,
@testing-library/jest-dom 6.6.3, @testing-library/user-event 14.5.2, @types/* como en Hospital Smart.
Para `scripts/e2e.mjs` y `generate-icons.mjs`: `playwright-core` (dev, versión exacta) usando el
Chromium del sistema (`CHROMIUM_PATH` o `/opt/pw-browsers/chromium-*/chrome-linux64/chrome`).
**No** se usa vite-plugin-pwa ni workbox: el service worker es propio (≈60 líneas, §7).

## 3. Modelo de datos (`src/types/bingo.ts`, ya escrito)

```ts
interface DrawEntry { number: number; at: number }          // at = Date.now()
interface NumberRange { min: number; max: number }
interface GameState { schema: 1; range: NumberRange; draws: DrawEntry[]; startedAt: number | null }
type GameStatus = 'idle' | 'playing' | 'finished';
interface Settings { schema: 1; voiceEnabled: boolean; voiceVolume: number; voiceURI: string | null;
                     soundEnabled: boolean; animationsEnabled: boolean }
```

Decisión clave: **el número actual, los restantes y el estado se derivan de `draws`**; no se
guardan por separado, así no pueden quedar inconsistentes.

Settings por defecto: voz activada, volumen 1, voz automática, sonido activado, animaciones activadas.

## 4. Motor del sorteo (`src/services/bingoEngine.ts`, ya escrito)

Funciones puras, sin React, sin efectos:

| Función | Contrato |
|---|---|
| `cryptoRandomInt(n)` | entero uniforme en [0,n) con `crypto.getRandomValues` y muestreo por rechazo (sin sesgo de módulo). Respaldo `Math.random` solo si no existe `crypto`. |
| `validateRange(range)` | `string` con mensaje en español, o `null`. Enteros, min ≥ 1, max ≤ 999, max > min, tamaño 5..300. |
| `createGame(range = {1,90})` | lanza `RangeError` si el rango es inválido. |
| `drawNumber(state, random?, now?)` | elige uniformemente entre los **restantes**. `{ok:true,state,number}` o `{ok:false,state,reason:'finished'}`. No muta. |
| `undoLast(state)` | `{ok:true,state,number}` o `{ok:false,reason:'empty'}`. |
| `remainingNumbers / remainingCount / totalNumbers / currentNumber / gameStatus` | derivados. |
| `isValidGameState(x)` | valida algo leído del almacenamiento: schema, rango válido, números enteros dentro del rango, sin repetidos, `at` finito. |

## 5. Persistencia (`src/services/persistence.ts`)

- `localStorage` (sincrónico: se guarda **antes** de que el usuario pueda cerrar la pestaña).
  IndexedDB no aporta nada para <10 KB de datos.
- Claves: `bingo-escolar:game` y `bingo-escolar:settings`. Cada valor lleva `schema`.
- `loadGame(): { game: GameState | null; error: StorageError | null }`
  - JSON inválido o `isValidGameState` falso → se **copia** el valor crudo a
    `bingo-escolar:game:corrupt-<timestamp>` (no se pierde), se devuelve `game: null` y error `'corrupt'`.
  - `schema` desconocido mayor (versión futura) → no se pisa: error `'unsupported'`, la app arranca en memoria.
- `saveGame(state): StorageError | null`, `clearGame()`, `loadSettings()` (fusiona con defaults y
  sanea cada campo), `saveSettings()`.
- `StorageError = 'unavailable' | 'quota' | 'corrupt' | 'unsupported'`. Toda llamada a `localStorage`
  va en try/catch (modo privado, almacenamiento bloqueado, cuota llena, `SecurityError`).
- `isStorageAvailable()` prueba escribir/borrar una clave.
- Una actualización de la app **nunca** borra la partida: el service worker solo toca Cache Storage,
  y una migración de esquema futura debe ser explícita (`migrate(raw)` en persistence.ts).
- Sincronización entre pestañas: `useBingo` escucha el evento `storage` y recarga el estado si
  cambia `bingo-escolar:game` (permite una ventana de proyector en la misma PC).

## 6. Hooks

### `useBingo()` → estado + acciones
```ts
{ game, status, current, drawnCount, remaining, total, lastDrawnAt,
  draw(): number | null, undo(): number | null, reset(range?: NumberRange): void,
  isDrawing: boolean, storageError: StorageError | null }
```
- **Anti doble toque**: `draw` usa un `useRef<boolean>` como cerrojo sincrónico (no estado de React,
  que llega tarde). Se toma el cerrojo, se calcula, se guarda, se libera tras
  `animationsEnabled ? 700 : 300` ms. Mientras está tomado, `draw()` devuelve `null` sin hacer nada.
  `isDrawing` deshabilita el botón visualmente.
- Cada cambio se persiste inmediatamente (`saveGame`); si falla, `storageError` se expone y la app
  sigue funcionando en memoria.
- `reset` y `undo` solo se llaman después de confirmar (la confirmación es de la UI).
- `draw` en estado `finished` no hace nada y devuelve `null`.

### `useSettings()` → `[settings, update(partial)]`, persistido.

### `useSpeech({enabled, volume, voiceURI})`
- `supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window`.
- Voces: `speechSynthesis.getVoices()` + evento `voiceschanged` (las voces cargan asíncronas en Android).
  Se filtran las que tienen `lang` que empieza con `es`. Orden de preferencia: es-AR, es-419, es-US,
  es-MX, es-ES, cualquier es-*. Si no hay ninguna en español, se usa `lang='es-AR'` sin voz explícita.
- `announce(n)`: `cancel()` lo anterior, `new SpeechSynthesisUtterance('¡Salió el número ' + numberToWords(n) + '!')`,
  `lang`, `voice`, `volume`, `rate 0.95`. Todo en try/catch; errores en `onerror` se ignoran.
  **Nunca** bloquea ni demora el sorteo (fire-and-forget).
- `test()` para el botón "Probar voz". Devuelve `{ supported, voices, spanishVoices, announce, test }`.

### `useOnlineStatus()` → `navigator.onLine` + eventos (solo informativo).

## 7. PWA y funcionamiento sin conexión

- `public/manifest.webmanifest`: name "Bingo Escolar", short_name "Bingo", lang es-AR, display
  standalone, start_url "./", scope "./", background_color y theme_color de la paleta, íconos
  192/512 PNG + maskable 512 + SVG.
- `base: './'` en Vite, para poder publicar en una subcarpeta (GitHub Pages).
- **Service worker propio** generado en el build por `serviceWorkerPlugin` (en `vite.config.ts`):
  en `generateBundle` toma la lista de archivos del bundle (JS, CSS, fuentes woff2) más los de
  `public/` (manifest, íconos) y `./` + `index.html`, y emite `sw.js` con:
  - `const CACHE = 'bingo-escolar-<hash de la lista>'` y `const ASSETS = [...]`.
  - `install`: `caches.open(CACHE).addAll(ASSETS)` + `skipWaiting()`.
  - `activate`: borra cachés `bingo-escolar-*` distintos de `CACHE` + `clients.claim()`.
  - `fetch` (solo GET mismo origen): navegaciones → red con fallback a `index.html` cacheado
    (si no hay red, abre igual); recursos → caché primero, luego red.
  - No toca `localStorage`: actualizar la app nunca borra la partida.
- `src/registerSW.ts`: registra `./sw.js` solo en producción (`import.meta.env.PROD`) y si
  `'serviceWorker' in navigator`. Expone si la app ya quedó lista offline
  (`navigator.serviceWorker.ready`) para mostrar "Lista para usar sin Internet" en Ajustes.
- Sin recursos remotos: fuentes vía @fontsource (empaquetadas), íconos lucide (SVG en el bundle),
  sonidos sintetizados con Web Audio (sin archivos).

## 8. Interfaz

Español de Argentina, voseo ("Sacá", "Tocá", "¿Querés…?"). Una mano: acciones abajo.

**Paleta** (Tailwind `theme.extend.colors`): fondo crema `#fffaf2`; marca rojo-bolilla
`brand-600 #dc2626`/`brand-700 #b91c1c` (texto blanco ≥ 4.5:1); acento amarillo `#facc15`;
tinta `#1f2937`. Bolillas coloreadas por decena (`ballColor.ts`: 10 colores alegres con contraste
AA para el número sobre el círculo blanco interno). Fuentes: Figtree (texto), Bricolage (títulos y
números). Números con `tabular-nums`.

**Layout móvil** (≥ 320 px): `Header` (nombre + estado + botón proyector) / contenido / `TabBar` fija
abajo con 4 pestañas (Sorteo, Tablero, Historial, Ajustes; íconos lucide + texto, alto ≥ 56 px).
Escritorio (≥ 1024 px): pantalla Sorteo en dos columnas (bolilla + botón | tablero), pestañas arriba
o abajo igual.

**Sorteo**: `CurrentNumber` (bolilla enorme: `min(60vw, 42vh)`, número en `clamp`), texto "Esperando
el primer número" si no hay; `GameStats` (Sorteados N · Restantes M · de T); estado
("Lista para empezar" / "En juego" / "¡Sorteo terminado!"); últimos 5 números en bolillas chicas;
`DrawButton` "SACAR NÚMERO" a todo el ancho, alto ≥ 72 px, abajo; fila secundaria con
"Deshacer" (deshabilitado si no hay sorteos) y "Nueva partida". Al terminar: banner
"¡Salieron todos los números! El sorteo terminó." y el botón principal se deshabilita con texto
"SORTEO TERMINADO".

**Tablero** (`NumberBoard`): grilla de 10 columnas; celdas cuadradas; 3 estados: disponible (gris
claro, número gris oscuro), sorteado (color de su bolilla, número blanco/negro con contraste),
último (anillo amarillo grueso + escala 1.1 + `aria-current`). Cada celda tiene `aria-label`
("42, sorteado"). Leyenda arriba. En 360 px de ancho entran 10 columnas de ~32 px.

**Historial** (`DrawHistory`): lista en orden inverso (último arriba, destacado) con "N.º de orden",
bolilla, hora `HH:MM:SS` (es-AR). Botones "Copiar" (Clipboard API → respaldo textarea +
`execCommand`) y "Compartir" (solo si existe `navigator.share`). Texto generado por
`historyText.ts`: título, fecha, cantidad y la lista en orden de extracción.

**Ajustes** (`SettingsPanel` + `VoiceControls`): rango (dos inputs numéricos + "Aplicar", con
`validateRange`; si hay partida en curso, confirmación "Para cambiar el rango hay que empezar una
partida nueva. Se borran los N números sorteados."); voz on/off, volumen (range 0–100), selector de
voz en español (solo si hay voces), "Probar voz", aviso "Este navegador no puede leer en voz alta"
si no hay soporte; sonidos on/off; animaciones on/off; botón "Abrir modo proyector"; estado offline
("Lista para usar sin Internet" / "Todavía no está guardada para usar sin Internet"); versión.

**Modo proyector** (`ProjectorView`): pantalla completa (intenta `requestFullscreen`, sin fallar si
no se puede), fondo oscuro azul noche para contraste en proyector, número actual gigante, últimos 8
números, tablero completo compacto, contador "Sorteados 23 de 90", nombre "Bingo Escolar". Sin
pestañas ni controles secundarios: solo un botón discreto "Salir" (y Escape) y un botón "Sacar"
discreto; atajos de teclado Espacio/Enter para sacar. Horizontal: número a la izquierda, tablero a
la derecha. Vertical: apilado.

**ConfirmDialog**: modal propio (`role="alertdialog"`, `aria-modal`, foco en el botón de cancelar,
Escape cancela), título, explicación, botón de peligro rojo con texto específico ("Sí, deshacer el
42", "Sí, empezar de nuevo"). Toques fuera no confirman.

**Toasts** (`ToastContext`): "Copiado", errores de almacenamiento, "Se deshizo el 42".

**StorageWarning**: banner si `storageError` (mensajes: "No se puede guardar en este dispositivo
(¿modo incógnito?). La partida funciona, pero se pierde si cerrás la página.", etc.).

**Animación**: al salir un número, la bolilla entra con escala+rotación ≈ 450 ms (CSS keyframes).
Desactivable en Ajustes y respetando `prefers-reduced-motion`. El número se muestra
**inmediatamente** (la animación es decorativa, no demora el resultado).

**Sonido** (`sound.ts`): "pop" corto con Web Audio (oscilador + envolvente, ~150 ms). `AudioContext`
creado perezosamente en el primer gesto; `resume()`; todo en try/catch: si el navegador lo bloquea,
no pasa nada.

## 9. Accesibilidad y rendimiento
Objetivos táctiles ≥ 48 px; foco visible; `aria-live="assertive"` con "Salió el 42" para lectores
de pantalla; contraste AA. Bundle inicial < 200 KB gzip. Sin imágenes remotas.

## 10. Pruebas

**Unitarias (Vitest, `src/__tests__/`)**, mínimo:
- motor: primer sorteo; 10 consecutivos; 90 sin repetidos y cubre todo el rango; último número;
  sacar sin restantes → `finished`; deshacer uno; deshacer varios; deshacer vacío; reinicio;
  validación de rangos; `isValidGameState` rechaza duplicados/fuera de rango; uniformidad
  aproximada de `cryptoRandomInt` (chi-cuadrado laxo); `drawNumber` no muta la entrada.
- persistencia: ida y vuelta; JSON corrupto → respaldo `corrupt-*` y `null`; `setItem` que lanza
  `QuotaExceededError` → `'quota'`; `localStorage` que lanza al acceder → `'unavailable'`;
  settings saneados.
- numberToWords: 1, 15, 16, 21, 22, 30, 42, 99, 100, 101, 999 en español correcto
  ("veintiuno", "veintidós", "cuarenta y dos", "cien", "ciento uno").
- useBingo: doble llamada rápida a `draw` → un solo número; recarga (remontar) recupera la partida.
- App (Testing Library): flujo sacar → tablero marcado → historial → deshacer con confirmación →
  reiniciar con confirmación; voz desactivada no llama a speechSynthesis; sin speechSynthesis no
  rompe; cambio de rango con partida en curso pide confirmación.

**E2E (`scripts/e2e.mjs`, Playwright + Chromium real contra `vite preview`)**: viewport 390×844 y
1366×768; screenshots en `docs/screenshots/`; sacar 90 números haciendo clic rápido (doble clic)
y verificar 90 únicos; recargar y verificar que se recupera; abrir proyector; **offline**: cargar,
esperar `serviceWorker.ready`, `context.setOffline(true)`, recargar y verificar que la app abre y
sortea; sin errores de consola. El script imprime un resumen PASS/FAIL y sale ≠0 si algo falla.

## 11. Despliegue
- `npm run build` → `dist/` estático. Servible por cualquier hosting estático con HTTPS
  (GitHub Pages, Netlify, Cloudflare Pages) o por el Dockerfile (nginx sin privilegios, puerto
  8080, CSP estricta: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'`,
  `sw.js` y `index.html` sin caché HTTP).
- El service worker requiere HTTPS o `localhost`. Para probar desde el celular en la red local,
  `npm run dev -- --host` sirve para usar la app, pero la instalación offline necesita HTTPS
  (documentar en USO.md).

## 12. Acceso pago para entidades (v2, fase 1: códigos manuales)

Decidido con el dueño el 24/10/2026: USD 5 = **30 días** de acceso; **modo demo gratis** limitado;
**3 dispositivos** por código; códigos **creados a mano** desde un panel (la entidad paga por
Mercado Pago o transferencia y recibe el código por WhatsApp). Fase 2 (Checkout Pro de Mercado
Pago con webhook) queda fuera de este cambio. Se vende una licencia de uso del software: la app
sigue sin manejar apuestas, dinero ni premios.

### 12.1 Piezas

```
src/shared/licencia.ts      contrato compartido (constantes, códigos, permiso firmado, tipos de la API) — ya escrito
src/shared/clavePublica.ts  clave pública ECDSA P-256 de producción (la privada solo en Cloudflare)
worker/                     Cloudflare Worker: API en /api/*; el resto lo sirven los assets como hoy
  index.ts                  router (fetch handler), respuestas JSON, cabeceras de seguridad
  db.ts                     esquema (CREATE TABLE IF NOT EXISTS al primer uso) + consultas
  admin.ts                  sesión del panel (cookie firmada con HMAC)
  limites.ts                límite de intentos por IP
  d1.ts                     tipos mínimos de D1 (sin dependencias nuevas)
  __tests__/                Vitest en entorno node, D1 falso sobre node:sqlite
src/services/licencia.ts    id de dispositivo, guardar/leer permiso, verificar offline, activar/renovar
src/hooks/useLicencia.ts    estado { modo: 'cargando'|'demo'|'completo', entidad, vence, ... }
src/components/Activacion.tsx   pantalla/diálogo "Activar acceso completo" + "Cómo comprar"
src/components/DemoAviso.tsx    aviso de demo (bolillas restantes) y cartel "DEMO" en el proyector
src/admin/                  panel de administración (se carga con import() solo en /admin)
```

`wrangler.jsonc`: `main: "worker/index.ts"`, `assets.binding: "ASSETS"`,
`assets.run_worker_first: ["/api/*"]`, D1 `binding: "DB"`. Secretos: `LICENSE_PRIVATE_KEY` (JWK
JSON de la clave privada), `ADMIN_PASSWORD` (≥ 12 caracteres). Si falta alguno, la API responde
`503 no_configurado` y la app sigue en demo (nunca se rompe el sorteo).

### 12.2 Base D1 (se crea sola con `CREATE TABLE IF NOT EXISTS`)

```sql
licencias(id TEXT PK, entidad TEXT, contacto TEXT, notas TEXT, codigo_hash TEXT UNIQUE,
          codigo_final TEXT, creada INTEGER, vence INTEGER, max_dispositivos INTEGER,
          revocada INTEGER NULL, monto_ars INTEGER NULL)
dispositivos(licencia_id TEXT, dispositivo TEXT, primera INTEGER, ultima INTEGER,
             PRIMARY KEY(licencia_id, dispositivo))
intentos(clave TEXT PK, ventana INTEGER, cantidad INTEGER)
ajustes(clave TEXT PK, valor TEXT)       -- precioArs, comoComprar, whatsapp
```

Tiempos en ms desde epoch. El código nunca se guarda: solo `hashCodigo()` y los últimos 4.

### 12.3 API (JSON; errores `ApiError` con los códigos HTTP de `CodigoError`)

| Método y ruta | Qué hace |
|---|---|
| `GET /api/info` | `InfoPublica` (precio, cómo comprar, WhatsApp, 30 días) |
| `POST /api/activar` `ActivarPedido` | normaliza y hashea el código; 404 si no existe, 403 revocado, 410 vencido; registra el dispositivo (si ya estaba, ok; si hay `max_dispositivos` distintos, 409); responde `PermisoRespuesta` con permiso firmado `exp = vence` |
| `POST /api/renovar` `RenovarPedido` | verifica la firma (sin exigir que no esté vencido), relee la licencia: si se extendió devuelve permiso nuevo; 403 si se revocó o se liberaron sus dispositivos, 410 si venció |
| `POST /api/admin/login` `{password}` | compara en tiempo constante; cookie `bingo_admin` HttpOnly, Secure, SameSite=Strict, Path=/api/admin, 12 h, firmada HMAC con una clave derivada de `ADMIN_PASSWORD` |
| `POST /api/admin/logout` | borra la cookie |
| `GET /api/admin/licencias` | `LicenciaAdmin[]` (más nuevas primero) |
| `POST /api/admin/licencias` `CrearLicenciaPedido` | crea con código nuevo → `LicenciaConCodigo` (el código se ve una sola vez) |
| `POST /api/admin/licencias/:id/extender` `{dias}` | `vence = max(vence, ahora) + dias` |
| `POST /api/admin/licencias/:id/revocar` y `/reactivar` | marca/desmarca `revocada` |
| `POST /api/admin/licencias/:id/liberar-dispositivos` | borra sus dispositivos |
| `POST /api/admin/licencias/:id/regenerar-codigo` | código nuevo (el viejo deja de servir) → `LicenciaConCodigo` |
| `GET` / `PUT /api/admin/ajustes` | `Ajustes` |

Límites: activar 10 intentos fallidos por IP cada 15 min (429); login 5 por IP cada 15 min.
La IP sale de `CF-Connecting-IP` y se guarda hasheada. Cuerpos > 4 KB → 400. Las rutas
`/api/admin/*` con métodos que cambian datos exigen `Content-Type: application/json` (protección
CSRF junto con SameSite=Strict). Todas las respuestas de la API: `Cache-Control: no-store`.

### 12.4 App

- `bingo-escolar:dispositivo`: UUID (`crypto.randomUUID`) creado una vez. `bingo-escolar:permiso`:
  el token. Se borran con "Quitar acceso de este dispositivo" en Ajustes.
- Al abrir: verifica el permiso **offline** con la clave pública (firma, dispositivo, vencimiento).
  Válido → modo completo. Si hay Internet, llama a `/api/renovar` en segundo plano (refleja
  extensiones y revocaciones). Un error de red nunca quita el acceso; solo 403/410 lo quitan.
- **Demo**: sin permiso válido se pueden sacar `DEMO_MAX_BOLILLAS` (15) números por partida. Se
  ve un aviso "Versión demo: te quedan N bolillas" y en el proyector un cartel "DEMO". Al llegar al
  límite, el botón de sacar se reemplaza por "Activar acceso completo". Deshacer y nueva partida
  siguen andando. El límite se aplica en `App`, no en el motor.
- Pantalla de activación: campo de código (acepta minúsculas, espacios y guiones), mensajes claros
  por cada error, sección "Cómo comprar" con precio, texto y botón de WhatsApp (de `/api/info`).
  Sin Internet: "Para activar necesitás Internet una sola vez".
- Ajustes muestra "Acceso completo · {entidad} · vence el {fecha}" y avisa cuando faltan ≤ 5 días.
- `/admin`: se detecta por `location.pathname` en `main.tsx` y se carga `src/admin/` con
  `import()`. Login con contraseña, lista de licencias con estado, crear (entidad, contacto, notas,
  días = 30, dispositivos = 3, monto), y acciones extender/revocar/reactivar/liberar/regenerar.
  Al crear muestra el código grande con botones "Copiar" y "Mandar por WhatsApp".
- El service worker nunca cachea `/api/*` (ya ignora lo que no es GET; además se excluye `/api/`).

### 12.5 Pruebas

- Unitarias: `src/shared/licencia` (códigos, normalizar, firmar/verificar, firma alterada,
  dispositivo distinto, vencido); Worker con D1 falso (cada endpoint y cada error, límite de
  intentos, cookie de admin, 503 sin secretos); `useLicencia`/App (demo corta en 15, activar
  desbloquea, permiso vencido vuelve a demo, error de red no quita acceso).
- E2E: con `E2E_SERVER=cloudflare` (`wrangler dev` con D1 local y `.dev.vars` de prueba
  generado por el script): crear licencia desde `/admin`, activarla en otro contexto, sortear más de
  15, cortar Internet, recargar y seguir en modo completo. Con `vite preview` (sin API) los pasos
  existentes usan un permiso firmado por el script con una clave de prueba
  (`VITE_LICENSE_PUBLIC_KEY` en el build de e2e).
