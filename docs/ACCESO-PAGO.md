# Acceso pago para entidades

Cómo funciona, cómo dejarlo andando en Cloudflare y cómo vender un código. La arquitectura está en
[PLAN.md §12](PLAN.md#12-acceso-pago-para-entidades-v2-fase-1-códigos-manuales).

## Qué ve cada uno

- **Sin código (demo):** la app funciona igual que antes, pero saca como máximo **15 números por
  partida**. Se ve un aviso "Versión demo" y, en el proyector, un cartel **DEMO**. Al llegar al
  límite aparece "Activar acceso completo".
- **Con código:** la entidad lo escribe una vez **con Internet**. Desde ahí tiene la app completa
  durante **30 días**, también **sin conexión**, en hasta **3 dispositivos**. En Ajustes ve a nombre
  de quién está y cuándo vence.
- **Vos (panel `/admin`):** entrás con tu contraseña, creás la entidad y la app te da el código para
  mandar por WhatsApp. Desde ahí también extendés, revocás, liberás dispositivos o generás un
  código nuevo, y cargás el precio y las instrucciones de pago que ve la entidad.

Se vende una licencia de uso del software. La app no maneja apuestas, dinero ni premios.

## Configurar Cloudflare (una sola vez, desde el navegador)

No hace falta instalar nada. Todo es en [dash.cloudflare.com](https://dash.cloudflare.com), con
Google Chrome.

1. **Crear la base de datos.** Menú *Storage & Databases → D1 SQL Database → Create*. Nombre:
   `bingo-escolar`. Copiá el **Database ID** que aparece y pasáselo a quien mantiene el repo para
   ponerlo en `wrangler.jsonc` (reemplaza `PENDIENTE-CREAR-EN-CLOUDFLARE`). Las tablas se crean
   solas la primera vez que alguien usa la API.
2. **Cargar los dos secretos.** *Workers & Pages → bingo-escolar → Settings → Variables and
   Secrets → Add*, tipo **Secret**:
   - `LICENSE_PRIVATE_KEY`: el contenido completo del archivo `LICENSE_PRIVATE_KEY.txt` que se
     entregó aparte (empieza con `{"kty":"EC"`). **No** se sube a GitHub. Después de cargarlo,
     borrá el archivo.
   - `ADMIN_PASSWORD`: la contraseña del panel, de 12 caracteres o más. Inventala vos y guardala en
     un lugar seguro.
3. **Publicar.** Cuando se acepta el cambio en GitHub (`main`), Cloudflare lo publica solo.
4. **Probar.** Abrí `https://bingo-escolar.nolaxj9.workers.dev/admin`, entrá con la contraseña,
   cargá el precio y cómo pagar en *Ajustes de venta*, creá una entidad de prueba y activá el código
   desde otro celular.

Si falta la base o un secreto, la app no se rompe: sigue en modo demo y la activación dice que el
servicio no está configurado.

## Vender un código

1. La entidad te escribe (el botón de WhatsApp de la pantalla de activación lo facilita).
2. Te paga por Mercado Pago o transferencia (lo que hayas puesto en *Cómo comprar*).
3. En `/admin` → *Nueva licencia*: nombre de la entidad, contacto, monto cobrado. Por defecto son
   30 días y 3 dispositivos.
4. Copiá el código (formato `ABCD-EFGH-JKMN`) o tocá *Mandar por WhatsApp*. **El código se ve una
   sola vez**: si se pierde, *Regenerar código* crea uno nuevo y el viejo deja de servir.

Para renovar a la misma entidad: *Extender 30 días*. El celular lo toma solo la próxima vez que abra
la app con Internet.

## Preguntas frecuentes

**¿Funciona sin Internet el día del bingo?** Sí, si se activó antes con Internet. El permiso queda
guardado y firmado en el dispositivo hasta la fecha de vencimiento.

**Revoqué un código y el celular sigue andando.** Si está sin Internet no se entera hasta que se
conecta. Al abrir la app con conexión vuelve a demo.

**Una escuela cambió de celular.** En el panel, *Liberar dispositivos* y que active de nuevo.
"Quitar acceso de este dispositivo" en Ajustes solo borra el permiso de ese celular: el lugar sigue
ocupado hasta que lo liberes.

**¿Y en GitHub Pages, Netlify o Docker?** Ahí no hay API: la app queda siempre en demo. El acceso
pago solo funciona publicada en Cloudflare Workers.

**¿Se puede saltear?** Alguien con conocimientos técnicos y el celular en la mano podría modificar
la app en su navegador; no hay forma de evitarlo en una app que funciona sin Internet. Los códigos
no se pueden adivinar (59 bits de azar y límite de intentos) y no se pueden fabricar permisos sin la
clave privada, que solo está en Cloudflare.
