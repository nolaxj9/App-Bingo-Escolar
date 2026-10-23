# Cómo usar Bingo Escolar

## 1. Correrla en tu computadora

Necesitás Node 22 y npm.

```bash
npm ci
npm run dev        # desarrollo: http://localhost:5173
```

Para probarla tal como se publica (con service worker y sin conexión):

```bash
npm run build
npm run preview    # http://localhost:4173
```

El service worker **solo se registra en el build** (`npm run preview`), no en `npm run dev`.

## 2. Probarla desde un celular en la misma red (Wi-Fi)

1. En la computadora: `npm run dev` (ya usa `--host`) o `npm run preview`.
2. Averiguá la IP de la computadora (`ip addr` en Linux, `ipconfig` en Windows, Preferencias de Red en macOS), por ejemplo `192.168.1.20`.
3. En el celular, conectado al mismo Wi-Fi, abrí `http://192.168.1.20:5173` (o `:4173`).

Con esto podés **usar** la app. Pero un navegador solo permite service workers (y por lo tanto "instalar" y usar sin Internet) en `https://` o en `localhost`; una dirección `http://192.168...` no califica. Para probar la instalación en el celular hace falta HTTPS: publicala (sección 6) o usá un túnel HTTPS. En Chrome de escritorio, `localhost` sí funciona sin HTTPS.

Si no abre desde el celular: revisá el firewall de la computadora y que ambos estén en la misma red (algunas redes de escuelas aíslan los dispositivos entre sí).

## 3. Instalarla como app

Abrí la dirección **con Internet** al menos una vez (para que se guarden los archivos). Después:

- **Android (Chrome)**: menú ⋮ → "Instalar app" (o "Agregar a la pantalla principal"). Queda un ícono "Bingo" que abre sin barra del navegador.
- **iPhone / iPad (Safari)**: botón Compartir → "Agregar a pantalla de inicio".
- **Escritorio (Chrome o Edge)**: ícono de instalar en la barra de direcciones (o menú → "Instalar Bingo Escolar").

## 4. Usarla sin Internet

1. Abrí la app una vez con conexión (en una dirección `https://` o `localhost`).
2. Entrá a **Ajustes**: tiene que decir **"Lista para usar sin Internet"**. Si dice "Todavía no está guardada…", esperá unos segundos con conexión y recargá.
3. Desde ahí, aunque no haya red, la app abre y funciona igual, y la partida en curso se conserva. Arriba aparece "Sin Internet" como aviso.

Conviene probarlo en el aula **antes** del día de uso: poné el celular en modo avión, cerrá la app y volvé a abrirla. Si el navegador limpia los datos del sitio, hay que volver a abrirla una vez con conexión.

## 5. Jugar

- **SACAR NÚMERO** saca un número que todavía no salió. Se muestra en la bolilla grande y se lee en voz alta (si está activada).
- **Tablero**: todos los números; el último tiene un aro amarillo. **Historial**: en qué orden y a qué hora salió cada uno; podés copiarlo o compartirlo.
- **Deshacer** quita el último número (pide confirmación) y vuelve a estar disponible. **Nueva partida** borra todo (pide confirmación).
- **Ajustes**: rango de números (por defecto 1 a 90), voz y volumen, sonidos, animaciones. Si cambiás el rango con una partida en curso, la app avisa que hay que empezar una nueva.

### Modo proyector

Botón con el ícono de pantalla (arriba a la derecha) o **Ajustes → Abrir modo proyector**. Muestra el número gigante, los últimos 8, el tablero y "Sorteados N de 90" sobre fondo oscuro, sin pestañas.

- **Salir**: botón ✕ arriba a la izquierda o tecla **Escape**.
- **Sacar un número**: botón del dado arriba a la derecha, o teclas **Espacio** / **Enter**.
- Funciona en vertical y en horizontal. Intenta usar pantalla completa.
- También se abre con la dirección `…/#proyector`.
- Para proyectar: conectá la computadora al proyector/tele y abrí el modo proyector, o espejá el celular (cable, Chromecast, "compartir pantalla"). **Otro dispositivo no se sincroniza**: cada uno guarda su propia partida. En la misma computadora, una segunda ventana con `#proyector` sí se actualiza sola.

## 6. Publicarla en Internet

`npm run build` genera la carpeta `dist/`, que es un sitio estático: se puede subir a cualquier hosting con HTTPS. Como usa `base: './'`, funciona también en una subcarpeta.

### GitHub Pages
1. Subí el repositorio a GitHub.
2. En una rama, construí y publicá `dist/`: la forma simple es el flujo oficial de Pages con GitHub Actions ("Settings → Pages → Source: GitHub Actions") y un workflow que haga `npm ci && npm run build` y suba `dist/` con `actions/upload-pages-artifact` y `actions/deploy-pages`.
3. La app queda en `https://<usuario>.github.io/<repositorio>/`.

### Netlify
1. "Add new site → Import an existing project" y elegí el repositorio.
2. Build command: `npm run build`. Publish directory: `dist`.
3. Alternativa sin Git: arrastrá la carpeta `dist/` a https://app.netlify.com/drop.

### Cloudflare Pages
1. "Workers & Pages → Create → Pages → Connect to Git".
2. Framework preset: ninguno. Build command: `npm run build`. Build output directory: `dist`.

### Docker (servidor propio)
```bash
docker build -t bingo-escolar .
docker run --rm -p 8080:8080 bingo-escolar     # http://localhost:8080
```
La imagen usa nginx sin privilegios (puerto 8080) con CSP estricta. Para uso fuera de `localhost` ponele HTTPS adelante (un proxy inverso como Caddy, Traefik o el balanceador del proveedor); sin HTTPS el service worker no se registra.
> Nota: el Dockerfile y `nginx.conf` se escribieron siguiendo el proyecto de referencia, pero no se pudieron ejecutar en el entorno donde se desarrolló (ver [VERIFICACION.md](VERIFICACION.md)).

Después de publicar: abrí la dirección, esperá a ver "Lista para usar sin Internet" en Ajustes y probá el modo avión.

### Actualizaciones
Al publicar una versión nueva, el service worker se instala con una caché nueva y borra la anterior. La página abierta sigue con la versión vieja hasta que se la recarga o se vuelve a abrir. La partida guardada **no se borra** al actualizar.
