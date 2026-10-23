# Verificación realizada (23/10/2026)

Registro de lo que efectivamente se ejecutó. Nada de esta lista es una suposición; lo que **no** se pudo ejecutar está en la última sección.

Entorno: Linux en un contenedor, Node v22.22.0, Chromium del sistema (`/opt/pw-browsers/chromium-1243`) con `playwright-core` 1.63.0.

## Pruebas automatizadas
| Comando | Resultado observado |
|---|---|
| `npx vitest run` (también `npm test`) | `Test Files 7 passed (7)`, `Tests 109 passed (109)`. Por archivo: bingoEngine 30, numberToWords 25, app 17, persistence 14, useBingo 10, speech 8, historyText/ballColor 5 |
| `npx tsc --noEmit` | sin errores (modo estricto, `noUnusedLocals`, `noUnusedParameters`) |
| `npm run build` (`tsc --noEmit && vite build`) | build correcto en ~1 s, 1594 módulos |
| `npm audit --omit=dev` | `found 0 vulnerabilities` |
| `./scripts/test.sh --e2e` | resumen: vitest `PASS`, tsc `PASS`, build `PASS`, e2e `PASS` → `TODO PASÓ`, código de salida 0 |

Qué cubren las unitarias: primer sorteo, 10 y 90 sorteos sin repetidos (cobertura completa del 1 al 90), último número, sacar sin restantes, deshacer uno y varios, deshacer vacío, reinicio, validación de rangos, `isValidGameState` (duplicados, fuera de rango, `at` no finito), uniformidad de `cryptoRandomInt` (chi-cuadrado laxo), `drawNumber` sin mutar; persistencia con JSON corrupto (copia `corrupt-*`), `QuotaExceededError`, `localStorage` que lanza al acceder, esquema futuro; `numberToWords` (1, 15, 16, 21, 22, 30, 42, 99, 100, 101, 999 y más); `useBingo` (doble llamada rápida, liberación del cerrojo, recarga por remontaje, error de guardado, evento `storage`); `useSpeech` (orden de voces, `voiceschanged`, sin voces, sin soporte, excepciones); `App` (flujo completo con confirmaciones, voz activada/desactivada, sin `speechSynthesis`, fin del sorteo, proyector, cambio de rango con confirmación y rangos inválidos).

## Build (`npm run build`)
| Archivo | Tamaño | gzip |
|---|---|---|
| `dist/assets/index-1lyAOwHe.js` | 184,07 kB | 59,49 kB |
| `dist/assets/index-BYsxHV3l.css` | 27,38 kB | 5,69 kB |
| 5 fuentes `.woff2` (figtree latin/latin-ext; bricolage latin/latin-ext/vietnamese) | 8,6 a 41,5 kB c/u | |
| `dist/index.html` | 0,97 kB | 0,45 kB |
| `dist/sw.js` | 1,92 kB | |

Carga inicial de JS + CSS ≈ 65 kB gzip (objetivo del plan: < 200 kB). `dist/sw.js` contiene `CACHE = "bingo-escolar-<hash>"` y `ASSETS` con `./`, los 5 `.woff2`, `index-1lyAOwHe.js`, `index-BYsxHV3l.css`, los íconos PNG/SVG y `manifest.webmanifest` (más `index.html`). El e2e comprobó que todos los archivos listados están en Cache Storage tras la primera carga.

## E2E en Chromium real (`npm run e2e`, 58 comprobaciones)
Contra `vite preview` en un puerto libre (el script lo arranca y lo apaga). Resultado de la corrida final: **58/58 PASS**, código de salida 0. Para cada escenario se verifica además que no haya errores de consola, `pageerror` ni requests fallidos.

| Escenario | Comprobaciones (todas PASS) |
|---|---|
| Móvil 390x844 | pantalla inicial (botón ≥ 72 px, en la zona baja y casi a todo el ancho; bolilla ≥ 55 % del ancho); primer sorteo con animación y guardado; 10 sorteos sin repetidos; tablero con 3 estados (1 último, 9 sorteados, 80 disponibles); historial (último arriba, hora HH:MM:SS); ajustes; proyector vertical (oculta pestañas, "Sorteados 10 de 90", Escape sale) |
| Móvil 320x568 | sin scroll horizontal en sorteo ni tablero; botón dentro de la pantalla |
| Escritorio 1366x768 | sorteo y tablero lado a lado; botón dentro de la pantalla |
| Proyector 844x390 (horizontal) | número ≥ 180 px de alto, tablero a la derecha dentro de la pantalla, 8 últimos números; Espacio saca un número; abre con `#proyector` |
| 90 sorteos | 90 sorteos con doble clic rápido (ningún doble clic sacó 2 números), 90 únicos y cobertura 1–90; al terminar: mensaje "terminó", botón deshabilitado "SORTEO TERMINADO", 0 restantes; intento extra (clic forzado y Enter) no hace nada; recarga conserva la partida terminada |
| Deshacer y reiniciar | deshacer con confirmación (cancelar no cambia nada; confirmar actualiza contador, tablero e historial); varios hasta vaciar (botón queda deshabilitado); nueva partida con confirmación que dice "Se borran los 3 números" |
| Recarga | recupera sorteados, número actual, orden e historial y sigue sin repetir |
| Ajustes | los cambios persisten tras recargar; rango inválido muestra mensaje; cambio de rango sin partida se aplica y con partida pide confirmación explicando la partida nueva (cancelar conserva todo) |
| Voz | activada: habla "¡Salió el número …!"; desactivada: 0 llamadas a `speechSynthesis`; `speechSynthesis` eliminado con `addInitScript`: sortea igual y avisa en Ajustes |
| Almacenamiento con error | `Storage.prototype.setItem` lanza `QuotaExceededError`: aparece el aviso y la app sigue sorteando |
| Copiar historial | "Copiado" y el portapapeles contiene "Sorteados: 3 de 90" y "Orden de salida:" |
| Sin conexión | el service worker queda activo y controlando; los archivos de `sw.js` están en caché; Ajustes dice "Lista para usar sin Internet"; con `context.setOffline(true)` recargar abre la app y conserva la partida; se puede seguir sorteando; una pestaña nueva también abre |

Capturas generadas en `docs/screenshots/`: `main`, `board`, `history`, `settings`, `projector` (vertical), `projector-landscape`, `desktop`, `finished`, `main-320`, `board-320`, `storage-warning`, `offline`. Se revisaron a mano a 320, 390 px, escritorio y proyector; se corrigieron: botones del proyector que tapaban el tablero, contraste del botón "SORTEO TERMINADO", textos que se partían en 320 px y la insignia "Último" del historial.

## Cloudflare (`npm run e2e:cloudflare`, 23/10/2026)
Mismo recorrido de 58 comprobaciones sirviendo `dist/` con `wrangler dev` 4.148.0 (motor local de Cloudflare):
- Primera corrida: **54/58**. Fallaba el uso sin conexión (`net::ERR_FAILED` al recargar sin red): Cloudflare redirige `/index.html` a `/`, el service worker guardaba esa respuesta redirigida y el navegador no la acepta para una navegación.
- Corrección: el service worker ya no guarda `index.html` (solo `./`), limpia cualquier respuesta redirigida antes de usarla y no intenta guardar `_headers`.
- Segunda corrida: **58/58 PASS** con Cloudflare y **58/58 PASS** con `vite preview`.
- `curl -I` contra `wrangler dev`: `/` devuelve CSP, `x-frame-options: DENY`, `nosniff`, `referrer-policy` y `Cache-Control: no-cache`; `/sw.js` con `no-cache`; una ruta inexistente devuelve la app (200, SPA).
- No se publicó en una cuenta real de Cloudflare (no hay credenciales en este entorno).

## Iconos
`npm run icons` generó `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` y `apple-touch-icon.png` desde `public/icons/icon.svg` con el Chromium del sistema; los PNG están versionados.

## Problemas encontrados y corregidos durante la verificación
- Sin conexión, los scripts de módulo no se encontraban en la caché del service worker (la respuesta de `vite preview` trae `Vary: Origin`): se agregó `ignoreVary` al `caches.match`. El e2e lo detectó y ahora pasa.
- En la primera corrida, el modo proyector dejaba la barra de pestañas montada debajo; ahora no se renderiza.

## Lo que NO se ejecutó / límites de esta verificación
- **Dockerfile y `nginx.conf`: no se probaron.** En el entorno no hay demonio de Docker (`failed to connect to the docker API`) ni nginx instalado, así que no se construyó la imagen ni se verificaron las cabeceras. Están escritos siguiendo el proyecto de referencia (Hospital Smart).
- **Solo se probó en Chromium** (escritorio, con emulación de viewport móvil). No se probó en un teléfono Android real, ni en Safari/iPhone, ni en Firefox. La instalación como PWA ("Agregar a pantalla de inicio") no se probó; solo el service worker y el modo sin conexión.
- **La voz real no se escuchó**: el e2e usa un simulacro de `speechSynthesis` para verificar el texto y que no se llame con la voz apagada. Las voces instaladas (y si hay una en español) dependen de cada dispositivo.
- El sonido Web Audio no se verificó auditivamente (solo que no genera errores).
- No se probó la publicación en GitHub Pages, Netlify ni Cloudflare Pages; las instrucciones de `docs/USO.md` son las del procedimiento estándar de cada servicio.
- No se hicieron pruebas de accesibilidad con lector de pantalla; solo se usaron roles/etiquetas ARIA verificados por las pruebas de Testing Library y Playwright.

## Firma "by Código Austral · 2026" (23/10/2026)
Resultados reales de esta corrida:
- `npx vitest run`: `Test Files 7 passed (7)`, `Tests 110 passed (110)` (nueva prueba: la firma aparece en la pantalla principal y en el proyector; el texto del historial termina con "Bingo Escolar · by Código Austral 2026").
- `npx tsc --noEmit`: sin errores. `npm run build`: correcto.
- `npm run e2e`: **58/58 PASS**; `npm run e2e:cloudflare`: **58/58 PASS**. Dentro del recorrido se verifica que la firma sea visible y que su caja no se superponga con el botón SACAR NÚMERO / número actual (móvil 390x844) ni con el número y el tablero (proyector vertical y horizontal 844x390).
- Capturas regeneradas y revisadas a mano: `main.png`, `main-320.png`, `projector.png`, `projector-landscape.png`. En 320x568 la firma se oculta a propósito (alturas menores a 600 px) para no empujar el botón; en 390x844 se ve.
- No se midió el contraste de la firma con una herramienta; se usa ink al 60 % sobre crema y blanco al 50 % sobre fondo oscuro (estimado, no verificado).
