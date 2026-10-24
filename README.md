# Bingo Escolar

Aplicación web **sin conexión** (PWA) para sacar los números del bingo en el aula: una bolilla enorme en pantalla, un botón grande para sacar el número, tablero, historial, voz que canta el número y modo proyector. Todo corre en el navegador del celular, la tablet o la computadora; no hay servidor ni cuentas.

> ## Aviso importante
>
> - **Es solo un sorteador de números** para juegos de aula. No incluye apuestas, premios en dinero, pagos ni compras.
> - **No guarda datos personales.** Lo único que se guarda (en el propio dispositivo, en `localStorage`) es el rango, los números que salieron con su hora y los ajustes. No se envía nada a ningún lado.
> - No usa servicios externos: ni fuentes, ni imágenes, ni sonidos remotos. Todo viaja empaquetado con la app.
> - Es un proyecto educativo sin garantías. La voz depende de las voces instaladas en cada dispositivo (ver Limitaciones).

## Qué funciona

- **Sorteo**: rango 1–90 por defecto (configurable de 1 a 999, entre 5 y 300 números), sin repetidos dentro de una partida, con generador criptográfico (`crypto.getRandomValues`) y muestreo por rechazo (sin sesgo). Detecta cuando salieron todos y muestra "¡Salieron todos los números! El sorteo terminó."
- **Pantalla principal**: nombre "Bingo Escolar", bolilla gigante con el número actual, botón enorme **SACAR NÚMERO** al alcance del pulgar, contadores (sorteados, restantes, total), estado de la partida y los últimos números. Los toques rápidos o dobles no sacan dos números.
- **Tablero** con tres estados (disponible, sorteado, último), responsive, cómodo en celulares de 320 px.
- **Historial** con orden, hora y último destacado; se actualiza solo; **copiar** al portapapeles y **compartir** si el dispositivo lo permite.
- **Deshacer** el último número (con confirmación) y **nueva partida** (con confirmación que explica qué se borra).
- **Voz** con SpeechSynthesis ("¡Salió el número cuarenta y dos!"): se activa o desactiva, volumen, elección de voz en español si hay, botón "Probar voz". Repite el número cifra por cifra, como un cantor de bingo ("treinta y seis… tres, seis"), y se puede apagar en Ajustes. Nunca frena el sorteo y no rompe si el navegador no la soporta.
- **Sonidos** sintetizados con Web Audio (sin archivos) y **animación** de la bolilla, ambos opcionales; respeta `prefers-reduced-motion`.
- **Modo proyector**: número gigante, últimos 8 números, tablero completo y contador, sobre fondo oscuro, sin controles secundarios; vertical y horizontal. Se abre con el botón o con la URL `#proyector`.
- **Autoguardado** en `localStorage` y recuperación al recargar. Un aviso claro si el dispositivo no permite guardar (modo incógnito, cuota llena). Actualizar la app nunca borra una partida guardada.
- **Sin Internet**: manifiesto, service worker propio y caché de todos los archivos; se instala como app en Android, iPhone y escritorio.
- **Firma**: "by Código Austral · 2026" discreta en la pantalla principal, el modo proyector (esquina inferior), Ajustes ("Acerca de") y al final del historial copiado; sale de una sola constante en `src/services/brand.ts`.
- **Ajustes**: rango (cambiarlo con una partida en curso pide confirmación porque empieza una nueva), voz, sonidos, animaciones, modo proyector y estado "Lista para usar sin Internet".
- **Pruebas automatizadas**: unitarias (Vitest + Testing Library) y recorrido completo en Chromium real con Playwright, incluido el modo sin conexión.

## Requisitos

- **Para usar la app**: cualquier navegador moderno (Chrome/Edge/Firefox/Safari recientes). Para instalarla y usarla sin Internet hace falta abrirla una vez con conexión desde una dirección `https://` o `localhost`.
- **Para desarrollar**: Node 22 con npm.
- **Para el e2e y para regenerar los íconos**: un Chromium instalado (el script busca `CHROMIUM_PATH` o `/opt/pw-browsers/chromium-*/chrome-linux64/chrome`; no descarga navegadores).
- **Para la imagen Docker** (opcional): Docker.

## Inicio rápido

```bash
npm ci               # instala las dependencias exactas del package-lock.json
npm run dev          # servidor de desarrollo en http://localhost:5173
npm run build        # genera dist/ (incluye sw.js con la lista de archivos)
npm run preview      # sirve dist/ en http://localhost:4173 (para probar el modo sin conexión)
npm test             # pruebas unitarias
npm run e2e          # recorrido en Chromium real (necesita dist/; lo construye si falta)
```

Luego abrí **http://localhost:5173** (desarrollo) o **http://localhost:4173** (build). El service worker solo se registra en el build de producción (`npm run preview`), no en `npm run dev`.

Paso a paso para celulares, instalación y publicación: [docs/USO.md](docs/USO.md).

## Comandos

Todos se ejecutan desde la raíz del repositorio.

| Comando | Qué hace |
|---|---|
| `npm ci` / `make install` | Instala las dependencias exactas. |
| `npm run dev` / `make dev` | Servidor de desarrollo con `--host` (accesible desde la red local). |
| `npm run build` / `make build` | `tsc --noEmit` y build de producción en `dist/`, con `sw.js` generado. |
| `npm run preview` / `make preview` | Sirve `dist/` con `vite preview --host`. |
| `npm test` | Vitest (unitarias y de componentes). |
| `npm run lint` | Chequeo de tipos (`tsc --noEmit`). |
| `npm run e2e` / `make e2e` | Recorrido completo en Chromium contra `vite preview` (arranca y apaga el servidor solo), con capturas en `docs/screenshots/`. Sale con código distinto de cero si algo falla. |
| `npm run e2e:cloudflare` | El mismo recorrido, pero sirviendo `dist/` con `wrangler dev` (motor de Cloudflare, aplica `_headers`). |
| `npm run cf:dev` | Build + `wrangler dev`: la app como la serviría Cloudflare, en `http://localhost:8787`. |
| `npm run cf:deploy` | Build + `wrangler deploy` a Cloudflare (antes, una vez: `npx wrangler login`). Ver [docs/USO.md](docs/USO.md#cloudflare-recomendado). |
| `npm run icons` / `make icons` | Regenera los PNG de `public/icons/` a partir de `icon.svg` con Chromium. |
| `./scripts/test.sh` / `make test` | Vitest + tsc + build, con resumen y código de salida; con `--e2e` suma el recorrido en Chromium. |
| `make docker` / `make docker-run` | Construye la imagen (nginx sin privilegios) y la ejecuta en `http://localhost:8080`. |

## Estructura del repositorio

```
bingo-escolar/
├── index.html  vite.config.ts  tailwind.config.js  postcss.config.js  tsconfig.json
├── package.json  package-lock.json     # versiones exactas, sin ^ ni ~
├── Dockerfile  nginx.conf  .dockerignore  Makefile
├── docs/                    # PLAN, ARCHITECTURE, USO, TROUBLESHOOTING, VERIFICACION, screenshots/
├── scripts/                 # test.sh, e2e.mjs, generate-icons.mjs
├── public/                  # manifest.webmanifest e icons/ (SVG y PNG)
└── src/
    ├── main.tsx  App.tsx  index.css  registerSW.ts  test-setup.ts
    ├── types/bingo.ts
    ├── services/            # bingoEngine, persistence, numberToWords, sound, historyText, ballColor
    ├── hooks/               # useBingo, useSettings, useSpeech, useOnlineStatus
    ├── context/ToastContext.tsx
    ├── components/          # Ball, CurrentNumber, DrawButton, GameStats, NumberBoard, DrawHistory,
    │                        # ConfirmDialog, VoiceControls, Toggle, SettingsPanel, ProjectorView,
    │                        # TabBar, Header, StorageWarning
    └── __tests__/           # engine, persistence, numberToWords, historyText, useBingo, app, speech
```

## Documentación

- [docs/PLAN.md](docs/PLAN.md): plan técnico original (fuente de verdad de nombres y contratos).
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): componentes, modelo de datos, persistencia, voz, PWA y desvíos respecto del plan.
- [docs/USO.md](docs/USO.md): cómo correrla, probarla desde el celular, instalarla, usarla sin Internet, modo proyector y publicarla.
- [docs/VERIFICACION.md](docs/VERIFICACION.md): qué se ejecutó y qué resultados se observaron.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md): errores frecuentes y soluciones.
- [docs/SECURITY.md](docs/SECURITY.md): modelo de amenazas, controles, resultados de la revisión de seguridad y riesgos residuales.

## Limitaciones

- **Las voces dependen del dispositivo.** Si no hay una voz en español instalada se usa la predeterminada (puede sonar con otro acento) y en algunos navegadores no hay voz alguna: el sorteo funciona igual, sin sonido. En iPhone/iPad el audio y la voz solo arrancan después de un toque y el modo silencio puede callarlos.
- **El modo proyector en otro dispositivo no se sincroniza**: cada dispositivo guarda su propia partida. Sirve la misma pestaña/PC (ventana aparte con `#proyector`, que se actualiza sola) o espejar la pantalla (cable, Chromecast, "compartir pantalla").
- **El uso sin Internet hay que verificarlo en el navegador de destino**: se probó en Chromium. Necesita HTTPS o `localhost` y una primera carga con conexión; Safari puede borrar los datos de un sitio que no se usa durante días.
- Sin modo "sincronizar entre aulas", sin cartones de bingo ni verificación de líneas: solo sortea números.
- Si se borran los datos del sitio en el navegador, se pierde la partida guardada (no hay copia en ningún servidor).
