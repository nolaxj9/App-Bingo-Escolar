# Seguridad

Revisión hecha el 23/10/2026. Bingo Escolar es una página estática sin servidor propio, sin cuentas, sin datos personales y sin conexión a servicios externos: la superficie de ataque es chica, pero se revisó completa.

## Modelo de amenazas

| Qué se protege | Contra qué |
|---|---|
| Que el sorteo sea justo e impredecible | Números favorecidos, repetidos o adivinables |
| Que la partida no se pierda ni se corrompa | Datos guardados dañados o manipulados, toques dobles, actualizaciones de la app |
| El navegador de quien la usa | Inyección de código (XSS), páginas que la metan en un iframe, carga de recursos de terceros |
| La cadena de construcción | Dependencias con vulnerabilidades conocidas |

Fuera de alcance: alguien con acceso físico al celular puede editar el almacenamiento del navegador y cambiar la partida (no hay servidor que la valide). Para un bingo escolar es aceptable; no se usa con dinero.

## Controles

**Sorteo.** `crypto.getRandomValues` con muestreo por rechazo (sin sesgo de módulo); se elige solo entre los números restantes, así no puede repetirse. Probado: 90 sorteos únicos, uniformidad (chi-cuadrado) y que un doble toque no saque dos números.

**Datos guardados (`localStorage`).** Todo lo leído se valida antes de usarse (`isValidGameState`, `sanitizeSettings`): esquema, rango válido, enteros dentro del rango, sin repetidos, números finitos. Un valor dañado se descarta y se conserva **una sola** copia acotada a 100 000 caracteres (antes se acumulaba una copia por cada carga). Un `"__proto__"` en el JSON no contamina objetos. Los errores de almacenamiento (modo incógnito, cuota llena) muestran un aviso y la app sigue en memoria. No se guarda información personal.

**Inyección de código (XSS).** React escapa todo el texto; el código no usa `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` ni `window.open`. Lo único que viene de afuera es el `#proyector` de la URL, que solo se compara. El texto que se copia o comparte se arma solo con números y horas.

**Cabeceras HTTP** (`public/_headers` para Cloudflare y `nginx.conf` para Docker):
- `Content-Security-Policy`: solo recursos del propio sitio; sin scripts en línea ni `eval` (`script-src 'self'`), estilos solo del sitio salvo atributos `style` (`style-src-attr 'unsafe-inline'`, que usa React para tamaños y colores), `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `frame-ancestors 'none'` y `upgrade-insecure-requests`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy` y `Cross-Origin-Resource-Policy: same-origin`, `Strict-Transport-Security` (en Cloudflare).
- `Permissions-Policy`: cámara, micrófono, ubicación, sensores, pagos, USB, etc. apagados; solo pantalla completa (modo proyector), pantalla encendida y audio para el propio sitio.

**Service worker.** Solo atiende pedidos `GET` del mismo origen; guarda únicamente la lista fija de archivos del build (no guarda respuestas arbitrarias, así no se puede "envenenar" la caché); cada versión tiene su caché y borra las anteriores; nunca toca `localStorage`. No guarda `_headers` ni respuestas redirigidas.

**Dependencias.** Versiones exactas con `package-lock.json` y `npm ci`. Sin dependencias de terceros en tiempo de ejecución salvo React, lucide-react y las fuentes.

## Resultados de la revisión (ejecutado)

| Prueba | Resultado |
|---|---|
| `npm audit` (todas las dependencias) antes | 6 (3 altas, 3 moderadas), todas en herramientas de desarrollo: `sharp` vía `wrangler`/`miniflare` (alta) y `postcss-selector-parser` vía Tailwind 3 (moderada) |
| Corrección | `wrangler` 4.148.0 → 4.149.0; `overrides` de `postcss-selector-parser` a 7.1.6 (el CSS generado es idéntico byte a byte) |
| `npm audit` después | **0 vulnerabilidades** (también `--omit=dev`: 0) |
| Búsqueda de patrones peligrosos en `src/` | ninguno |
| Cabeceras con `wrangler dev` (`curl -I /`) | todas presentes |
| Chromium contra `wrangler dev` | script inyectado en la página: **bloqueado**; `fetch` a otro sitio: **bloqueado**; imagen externa: **bloqueada**; la app dentro de un iframe de otro sitio: **bloqueada** |
| Unitarias de datos manipulados | JSON roto, repetidos, decimales, fuera de rango, tipos incorrectos, `NaN`/`Infinity`, `__proto__`, copias repetidas: todos rechazados |
| E2E completo con las cabeceras nuevas | 58/58 PASS sin errores de consola (ni violaciones de CSP) |

## Riesgos residuales

- Quien tenga el celular en la mano puede modificar la partida desde las herramientas del navegador.
- `style-src-attr 'unsafe-inline'` permite atributos `style`; no permite scripts. Es lo mismo que usa Austral Hospital Smart.
- El servidor de desarrollo (`npm run dev -- --host`) queda visible en la red local: usarlo solo para probar, no en el evento.
- El Dockerfile/nginx no se pudo ejecutar en este entorno (ver VERIFICACION.md).
