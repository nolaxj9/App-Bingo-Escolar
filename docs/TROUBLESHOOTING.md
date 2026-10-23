# Solución de problemas

Todos los comandos se ejecutan desde la raíz del repositorio.

## No arranca `npm run dev` / `npm ci`

- "npm: command not found": instalá Node 22 (incluye npm).
- `npm ci` falla por versión de Node o por red: usá Node 22 y revisá el proxy (`npm config get proxy`). `npm ci` instala exactamente lo que dice `package-lock.json`.
- "Port 5173 is already in use": cerrá el otro proceso o corré `npm run dev -- --port 5180`.

## No puedo abrir la app desde el celular

- Usá la IP de la computadora, no `localhost` (`http://192.168.x.x:5173`).
- Celular y computadora tienen que estar en la misma red Wi-Fi; algunas redes escolares aíslan los dispositivos ("aislamiento de cliente").
- El firewall de la computadora puede bloquear el puerto 5173 / 4173.

## No dice "Lista para usar sin Internet" / no se instala

- Hace falta `https://` o `localhost`. Con `http://192.168…` el navegador no registra el service worker (es una regla del navegador, no un error de la app).
- En `npm run dev` el service worker **no** se registra (solo en el build). Probá con `npm run build && npm run preview`.
- Abrí la app con conexión y esperá unos segundos; después recargá. Si sigue igual, en Chrome: DevTools → Application → Service Workers.
- Para empezar de cero: DevTools → Application → Storage → "Clear site data" (**esto borra también la partida guardada**).

## La app no se actualiza después de publicar una versión nueva

Cerrá todas las pestañas/ventanas de la app y volvé a abrirla (o recargá dos veces). El service worker nuevo se instala y toma el control; la página abierta sigue con el código viejo hasta recargar. En el servidor, `sw.js` e `index.html` no tienen que cachearse (el `nginx.conf` ya lo hace; en otros hostings revisá las cabeceras `Cache-Control`).

## "No se puede guardar en este dispositivo…"

El navegador no permite escribir en `localStorage`: modo incógnito/privado, "bloquear datos de sitios" o almacenamiento lleno. La partida funciona, pero se pierde al cerrar la página. Abrí la app en una ventana normal, permití los datos del sitio o liberá espacio. Si dice "No hay lugar para guardar", liberá espacio en el dispositivo.

## "La partida guardada estaba dañada"

Se detectó un dato inválido. La app empezó una partida nueva y guardó una copia del dato dañado bajo una clave `bingo-escolar:game:corrupt-<fecha>` (se ve en DevTools → Application → Local Storage).

## "La partida guardada es de una versión más nueva"

Abriste una versión vieja de la app sobre datos de una versión más nueva. No se tocan; actualizá la app para recuperarlos. Mientras tanto la partida corre sin guardarse.

## No suena la voz

- Mirá **Ajustes → Voz**: tiene que estar activada y con volumen mayor que 0. "Probar voz" confirma si funciona.
- Si dice "Este navegador no puede leer en voz alta", el navegador no tiene SpeechSynthesis. El sorteo sigue andando sin voz.
- Si no hay voces en español instaladas, se usa la voz predeterminada. En Android: Ajustes → Sistema → Idioma → Salida de texto a voz. En Windows/macOS: instalá una voz en español en la configuración de voz del sistema.
- En iPhone/iPad la voz y el sonido arrancan recién después de un toque; el interruptor de silencio puede callarlos. En algunos navegadores de Linux no hay voces.
- Volumen del dispositivo en cero o "No molestar".

## No suena el "pop"

Activá **Ajustes → Sonidos**. Los navegadores bloquean el audio hasta el primer toque del usuario; si sigue sin sonar, el dispositivo está en silencio o el navegador lo bloquea (el sorteo funciona igual).

## El botón no responde por un instante

Es a propósito: después de cada número hay una pausa de menos de 1 segundo (0,7 s con animaciones, 0,3 s sin ellas) que evita que un doble toque saque dos números.

## El modo proyector no entra en pantalla completa

Algunos navegadores (por ejemplo Safari en iPhone) no permiten pantalla completa; el modo proyector funciona igual. Usá F11 en la computadora. Si se abre con `#proyector` directo desde la dirección, el navegador pide un toque para la pantalla completa: la app no puede forzarla.

## El proyector en otro dispositivo no muestra lo mismo

Cada dispositivo guarda su propia partida; no se sincronizan. Proyectá el mismo dispositivo en el que sacás los números (espejado de pantalla, cable o Chromecast) o usá una segunda ventana en la misma computadora con `…/#proyector`.

## Los tests o el e2e fallan

- `npm test` falla con errores de `localStorage`: confirmá Node 22 y `npm ci`.
- `npm run e2e` dice que no encuentra el navegador: definí `CHROMIUM_PATH=/ruta/al/chrome`. El script no descarga navegadores.
- El e2e usa `dist/`; si cambiaste el código corré `npm run build` antes.
- Si quedó un `vite preview` colgado de una corrida cancelada, buscá y cerrá el proceso (`pkill -f "vite.js preview"`).
- `npm run icons` necesita el mismo Chromium que el e2e.

## Docker

- `docker build` falla bajando imágenes o paquetes: revisá el proxy/red del host (en redes con proxy corporativo hay que dar los certificados al builder).
- "permission denied" con el puerto: la imagen escucha en 8080 sin privilegios; mapealo con `-p 8080:8080`.
