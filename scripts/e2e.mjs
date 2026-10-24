// Recorrido de punta a punta en Chromium real (playwright-core).
// Uso: npm run e2e              -> `vite preview` sin API (modo demo + permisos firmados por el script)
//      npm run e2e:cloudflare   -> `wrangler dev` con D1 local (miniflare) + API real de licencias y panel /admin
// CHROMIUM_PATH opcional. Sale con código != 0 si algo falla.
//
// Preparación (la hace el script solo, sin pasos manuales):
//  1. Genera un par de claves ECDSA P-256 de PRUEBA (la misma lógica que generarParDeClaves).
//  2. Compila la app en `dist-e2e/` con `VITE_LICENSE_PUBLIC_KEY=<pública de prueba>`; `dist/` no se toca.
//  3. Modo cloudflare: arma en una carpeta temporal un wrangler.json (copia de wrangler.jsonc con
//     assets -> dist-e2e y un database_id falso) y un `.dev.vars` con LICENSE_PRIVATE_KEY (privada de
//     prueba) y ADMIN_PASSWORD (al azar). La base D1 local va en `--persist-to <temp>/state`: cada
//     corrida arranca vacía. Nunca se escribe en el `.dev.vars` del repo.
//
// Acceso completo para los pasos que sortean más de 15 números (`licensed: true`, por defecto):
//  - vite preview: el script firma un permiso con la clave privada de prueba y lo siembra en
//    localStorage junto con el id de dispositivo. No hay /api, así que la renovación en segundo plano
//    recibe 404 (no JSON) y la app conserva el acceso (solo 403/410 lo quitan).
//  - cloudflare: al arrancar se crea por la API de administración una licencia "Escuela E2E" con 20
//    dispositivos; el script elige un id de dispositivo, lo activa llamando a
//    /api/activar desde Node y siembra el permiso REAL firmado por el Worker. Así la renovación
//    (/api/renovar) responde 200 y no hay un 403 por una licencia inexistente.
import { chromium } from 'playwright-core';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const shots = join(root, 'docs', 'screenshots');
mkdirSync(shots, { recursive: true });

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1366, height: 768 };
const LANDSCAPE = { width: 844, height: 390 };
const GAME_KEY = 'bingo-escolar:game';
const SETTINGS_KEY = 'bingo-escolar:settings';
const DEVICE_KEY = 'bingo-escolar:dispositivo';
const PERMIT_KEY = 'bingo-escolar:permiso';
const CLOUDFLARE = process.env.E2E_SERVER === 'cloudflare';
const DIST_E2E = 'dist-e2e';

// ---------------------------------------------------------------- utilidades
const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).split('\n')[0] });
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
      const p = join(base, d, 'chrome-linux64', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

// ---------------------------------------------------------------- claves y permisos de prueba
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** Misma lógica que `generarParDeClaves` de src/shared/licencia.ts. */
async function generarClaves() {
  const par = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
  return { publica: await crypto.subtle.exportKey('jwk', par.publicKey), privada: await crypto.subtle.exportKey('jwk', par.privateKey) };
}

/** Permiso `v1.<payload>.<firma>` igual al que firma el Worker (ver firmarPermiso). */
async function firmarPermiso(payload, jwkPrivada) {
  const clave = await crypto.subtle.importKey('jwk', jwkPrivada, ECDSA, false, ['sign']);
  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, new TextEncoder().encode(`v1.${cuerpo}`)));
  return `v1.${cuerpo}.${b64url(firma)}`;
}

// ---------------------------------------------------------------- servidor
function run(cmd, args, env) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`falló: ${cmd} ${args.join(' ')}`);
}

/** Cliente mínimo de la API de administración (cookie de sesión a mano). */
function adminClient(base, password) {
  let cookie = '';
  const call = async (metodo, ruta, cuerpo) => {
    const res = await fetch(base + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${metodo} ${ruta} -> ${res.status} ${JSON.stringify(json)}`);
    return json;
  };
  return {
    login: () => call('POST', '/api/admin/login', { password }),
    crearLicencia: (p) => call('POST', '/api/admin/licencias', p),
    activar: (codigo, dispositivo) => call('POST', '/api/activar', { codigo, dispositivo }),
  };
}

async function startServer() {
  const keys = await generarClaves();
  console.log(`Compilando ${DIST_E2E}/ con la clave pública de PRUEBA...`);
  run(process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', DIST_E2E, '--emptyOutDir'], {
    VITE_LICENSE_PUBLIC_KEY: JSON.stringify(keys.publica),
  });
  const port = await freePort();
  const tmp = CLOUDFLARE ? mkdtempSync(join(tmpdir(), 'bingo-e2e-')) : null;
  let args;
  let adminPassword = null;
  if (CLOUDFLARE) {
    adminPassword = randomBytes(30).toString('base64url').replace(/[-_]/g, 'x').slice(0, 20);
    writeFileSync(join(tmp, '.dev.vars'), `LICENSE_PRIVATE_KEY='${JSON.stringify(keys.privada)}'\nADMIN_PASSWORD=${adminPassword}\n`);
    writeFileSync(
      join(tmp, 'wrangler.json'),
      JSON.stringify({
        name: 'bingo-escolar-e2e',
        compatibility_date: '2026-10-01',
        main: join(root, 'worker', 'index.ts'),
        assets: { directory: join(root, DIST_E2E), binding: 'ASSETS', not_found_handling: 'single-page-application', run_worker_first: ['/api/*', '/admin/*'] },
        d1_databases: [{ binding: 'DB', database_name: 'bingo-escolar', database_id: '00000000-0000-4000-8000-000000000000' }],
      }),
    );
    args = [join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), 'dev', '--config', join(tmp, 'wrangler.json'), '--persist-to', join(tmp, 'state'), '--ip', '127.0.0.1', '--port', String(port)];
  } else {
    args = [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', DIST_E2E, '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
  }
  const child = spawn(process.execPath, args, {
    cwd: tmp ?? root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const url = `http://127.0.0.1:${port}/`;
  for (let i = 0; i < 900; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { child, url, keys, tmp, adminPassword };
    } catch {
      /* todavía no */
    }
    await sleep(100);
  }
  child.kill();
  throw new Error(`${CLOUDFLARE ? 'wrangler dev' : 'vite preview'} no arrancó\n${log.slice(-1500)}`);
}

// ---------------------------------------------------------------- helpers de página
const FAST_SETTINGS = { schema: 1, voiceEnabled: false, voiceVolume: 1, voiceURI: null, soundEnabled: false, animationsEnabled: false };

/** Estado del servidor para los helpers (lo completa main). */
const srv = { keys: null, admin: null, codigoCompleto: null, url: '', permiso: null };

/** Permiso de acceso completo para un dispositivo nuevo: firmado aquí (preview) o emitido por el Worker (cloudflare). */
async function permisoCompleto() {
  // Un solo dispositivo "de prueba" para todos los contextos con acceso completo (cada contexto
  // tiene su propio almacenamiento, así que no se pisan): cuenta como 1 dispositivo de la licencia.
  if (srv.permiso) return srv.permiso;
  const dispositivo = randomUUID();
  if (CLOUDFLARE) {
    const r = await srv.admin.activar(srv.codigoCompleto, dispositivo);
    return (srv.permiso = { dispositivo, permiso: r.permiso });
  }
  const ahora = Date.now();
  const permiso = await firmarPermiso({ v: 1, lid: 'e2e-licencia', ent: 'Escuela E2E', did: dispositivo, iat: ahora, exp: ahora + 30 * 86_400_000 }, srv.keys.privada);
  return (srv.permiso = { dispositivo, permiso });
}

/**
 * Contexto nuevo (almacenamiento limpio). `fast` = sin animaciones/voz/sonido para ir rápido.
 * `licensed` (por defecto sí) siembra un permiso de acceso completo; `licensed: false` = modo demo.
 * `apiOk`: los 4xx de /api/ son esperados en este escenario (no cuentan como error de consola).
 * `sink`: arreglo donde se juntan los errores (para varios contextos en un mismo escenario).
 */
async function newPage(browser, { viewport = MOBILE, fast = true, scale = 1, init, permissions, licensed = true, apiOk = false, sink } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires', permissions });
  if (fast) {
    await context.addInitScript(
      ([k, v]) => {
        try {
          if (!localStorage.getItem(k)) localStorage.setItem(k, v);
        } catch {
          /* almacenamiento bloqueado */
        }
      },
      [SETTINGS_KEY, JSON.stringify(FAST_SETTINGS)],
    );
  }
  if (licensed) {
    const { dispositivo, permiso } = await permisoCompleto();
    await context.addInitScript(
      ([kd, d, kp, p]) => {
        try {
          // Solo la primera vez: si la app borra el permiso (revocado) no se vuelve a sembrar.
          if (!localStorage.getItem(kd)) {
            localStorage.setItem(kd, d);
            localStorage.setItem(kp, p);
          }
        } catch {
          /* almacenamiento bloqueado */
        }
      },
      [DEVICE_KEY, dispositivo, PERMIT_KEY, permiso],
    );
  }
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = sink ?? [];
  // Sin API (vite preview) /api/* da 404: es esperado y la app lo tolera. Solo se filtra eso.
  const apiEsperada = !CLOUDFLARE || apiOk;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (apiEsperada && /Failed to load resource/.test(m.text()) && /\/api\//.test(m.location().url ?? '')) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return { context, page, errors };
}

const drawBtn = (page) => page.getByRole('button', { name: /sacar número|sorteo terminado/i });
const nav = (page, name) => page.getByRole('navigation').getByRole('button', { name });
const drawnCount = async (page) => Number(await page.getByTestId('drawn-count').textContent());
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), GAME_KEY);
const currentNumber = async (page) => Number(await page.getByTestId('current-number').getAttribute('data-number'));

/** Saca un número con un clic y espera a que se refleje y a que el cerrojo se libere. */
async function drawOne(page, settleMs = 340) {
  const before = await drawnCount(page);
  await drawBtn(page).click();
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid=drawn-count]')?.textContent) === n, before + 1);
  await sleep(settleMs);
}
async function drawMany(page, n, settleMs) {
  for (let i = 0; i < n; i++) await drawOne(page, settleMs);
}
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await sleep(600); // termina la animación de la bolilla
  await page.screenshot({ path: join(shots, `${name}.png`) });
}
async function open(page, url) {
  await page.goto(url);
  await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
}

// ---------------------------------------------------------------- escenarios
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function checkCredit(page, others, viewport, where) {
  const credit = page.getByTestId('brand-credit');
  assert(await credit.isVisible(), `${where}: la firma no se ve`);
  assert((await credit.textContent()).includes('by Código Austral · 2026'), `${where}: texto de la firma`);
  const c = await credit.boundingBox();
  assert(c.x >= 0 && c.y >= 0 && c.x + c.width <= viewport.width && c.y + c.height <= viewport.height, `${where}: la firma se sale de la pantalla`);
  for (const [name, loc] of others) {
    const b = await loc.boundingBox();
    assert(!overlaps(c, b), `${where}: la firma se superpone con ${name}`);
  }
}

// ---------------------------------------------------------------- acceso pago (solo cloudflare: API y D1 reales)
const FORMATO_CODIGO = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

async function adminLogin(page, adminUrl, password) {
  await page.goto(adminUrl);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { name: 'Administración · Bingo Escolar' }).waitFor();
}

async function crearEnPanel(page, { entidad, dispositivos }) {
  await page.getByRole('button', { name: 'Nueva licencia' }).click();
  await page.getByLabel('Entidad').fill(entidad);
  if (dispositivos) await page.getByLabel('Dispositivos').fill(String(dispositivos));
  await page.getByRole('button', { name: 'Crear licencia y código' }).click();
  const codigo = (await page.getByTestId('codigo-nuevo').textContent()).trim();
  assert(FORMATO_CODIGO.test(codigo), `código con formato inesperado: ${codigo}`);
  return codigo;
}

async function accesoPago(browser, url, password) {
  const errors = [];
  const abrir = (opts) => newPage(browser, { apiOk: true, sink: errors, ...opts });
  const adminUrl = url + 'admin';
  let codigo = null;

  // ---- panel de administración (móvil)
  {
    const { context, page } = await abrir({ viewport: MOBILE, scale: 2, licensed: false });
    await step('admin: contraseña incorrecta muestra error y la correcta entra', async () => {
      await page.goto(adminUrl);
      await page.getByLabel('Contraseña').fill('contraseña-equivocada-123');
      await page.getByRole('button', { name: 'Ingresar' }).click();
      await page.getByText('Contraseña incorrecta.').waitFor();
      await page.getByLabel('Contraseña').fill(password);
      await page.getByRole('button', { name: 'Ingresar' }).click();
      await page.getByRole('heading', { name: 'Administración · Bingo Escolar' }).waitFor();
    });
    await step('admin: guarda ajustes (precio, cómo comprar, WhatsApp)', async () => {
      await page.getByLabel('Precio (ARS)').fill('5000');
      await page.locator('form[aria-labelledby=ajustes-titulo] textarea').fill('Pagá por Mercado Pago al alias BINGO.ESCOLAR y mandanos el comprobante.');
      await page.getByPlaceholder('5491155551234').fill('5491100000000');
      await page.getByRole('button', { name: 'Guardar ajustes' }).click();
      await page.getByText('Ajustes guardados').waitFor();
    });
    await step('admin: crea la licencia "Escuela de prueba" y muestra el código', async () => {
      codigo = await crearEnPanel(page, { entidad: 'Escuela de prueba' });
      await sleep(400);
      await page.screenshot({ path: join(shots, 'admin-codigo.png') });
      await page.getByRole('button', { name: 'Listo' }).click();
      await page.getByTestId('codigo-nuevo').waitFor({ state: 'detached' });
      const card = page.getByTestId('licencia').filter({ hasText: 'Escuela de prueba' });
      assert(await card.isVisible(), 'la licencia no aparece en la lista');
      eq(await card.getAttribute('data-estado'), 'activa', 'estado');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(shots, 'admin-panel.png') });
    });
    await context.close();
  }

  await step('admin: /admin/ con barra final redirige a /admin y carga', async () => {
    const { context, page } = await abrir({ viewport: MOBILE, licensed: false });
    await page.goto(adminUrl + '/');
    await page.getByRole('heading', { name: 'Administración' }).first().waitFor();
    eq(new URL(page.url()).pathname, '/admin', 'ruta final');
    await context.close();
  });

  // ---- activación en un contexto en demo, y acceso sin Internet
  const activada = await abrir({ viewport: MOBILE, scale: 2 , licensed: false });
  {
    const { context, page } = activada;
    await open(page, url);
    await step('activación: "Cómo comprar" muestra precio, texto y WhatsApp', async () => {
      await drawMany(page, 15);
      await page.getByRole('button', { name: 'Activar acceso completo' }).click();
      const dlg = page.getByRole('dialog');
      await dlg.getByRole('heading', { name: 'Cómo comprar' }).waitFor();
      await dlg.getByTestId('precio').waitFor();
      assert(/5\.?000/.test(await dlg.getByTestId('precio').textContent()), 'el precio 5000 no aparece');
      assert((await dlg.textContent()).includes('alias BINGO.ESCOLAR'), 'falta el texto de cómo comprar');
      const wa = dlg.getByRole('link', { name: /WhatsApp/ });
      assert((await wa.getAttribute('href')).includes('5491100000000'), 'el botón de WhatsApp no apunta al número');
      await page.screenshot({ path: join(shots, 'activacion.png') });
    });
    await step('activación: un código inexistente muestra el error', async () => {
      await page.getByLabel('Código de acceso').fill('ABCD-EFGH-JKMN');
      await page.getByRole('dialog').locator('button[type=submit]').click();
      await page.getByText('No encontramos ese código').waitFor();
      eq(await drawnCount(page), 15, 'sorteados (sigue en demo)');
    });
    await step('activación: el código real en minúsculas y con espacios activa', async () => {
      await page.getByLabel('Código de acceso').fill(codigo.toLowerCase().replaceAll('-', ' '));
      await page.getByRole('dialog').locator('button[type=submit]').click();
      await page.getByText('¡Listo! Acceso completo para Escuela de prueba').waitFor();
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    });
    await step('activación: se sortea más de 15 y Ajustes muestra la entidad', async () => {
      await drawMany(page, 2);
      eq(await drawnCount(page), 17, 'sorteados');
      eq(await page.getByTestId('demo-aviso').count(), 0, 'avisos de demo');
      await nav(page, 'Ajustes').click();
      await page.getByText(/Acceso completo · Escuela de prueba/).waitFor();
      await shot(page, 'acceso-completo');
      await nav(page, 'Sorteo').click();
    });
    await step('offline tras activar: recargar mantiene el acceso completo', async () => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
      await context.setOffline(true);
      await page.reload();
      await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor({ timeout: 10000 });
      eq(await drawnCount(page), 17, 'sorteados tras recargar sin conexión');
      await drawOne(page);
      eq(await drawnCount(page), 18, 'sorteados sin conexión (más de 15)');
      eq(await page.getByTestId('demo-aviso').count(), 0, 'avisos de demo sin conexión');
      await nav(page, 'Ajustes').click();
      await page.getByText(/Acceso completo · Escuela de prueba/).waitFor();
      await nav(page, 'Sorteo').click();
    });
    await step('offline tras activar: una pestaña nueva también tiene acceso completo', async () => {
      const p2 = await context.newPage();
      await p2.goto(url);
      await p2.getByRole('heading', { name: 'Bingo Escolar' }).waitFor({ timeout: 10000 });
      eq(await drawnCount(p2), 18, 'sorteados en pestaña nueva');
      await drawOne(p2);
      eq(await drawnCount(p2), 19, 'sorteados en pestaña nueva sin conexión');
      eq(await p2.getByTestId('demo-aviso').count(), 0, 'avisos de demo en pestaña nueva');
      await p2.close();
    });
    await context.setOffline(false);
    await context.close();
  }

  // ---- límite de dispositivos y revocación
  const unica = await abrir({ viewport: MOBILE, licensed: false });
  const otra = await abrir({ viewport: MOBILE, licensed: false });
  const admin = await abrir({ viewport: MOBILE, licensed: false });
  let codigoUnico = null;
  await adminLogin(admin.page, adminUrl, password);
  await step('dispositivos: licencia de 1 dispositivo se activa en el contexto A', async () => {
    codigoUnico = await crearEnPanel(admin.page, { entidad: 'Escuela de un dispositivo', dispositivos: 1 });
    await admin.page.getByRole('button', { name: 'Listo' }).click();
    await open(unica.page, url);
    await unica.page.getByRole('button', { name: 'Ajustes' }).click();
    await unica.page.getByRole('button', { name: 'Activar acceso completo' }).click();
    await unica.page.getByLabel('Código de acceso').fill(codigoUnico);
    await unica.page.getByRole('dialog').locator('button[type=submit]').click();
    await unica.page.getByText('¡Listo! Acceso completo para Escuela de un dispositivo').waitFor();
  });
  await step('dispositivos: el contexto B recibe el mensaje de límite', async () => {
    await open(otra.page, url);
    await otra.page.getByRole('button', { name: 'Ajustes' }).click();
    await otra.page.getByRole('button', { name: 'Activar acceso completo' }).click();
    await otra.page.getByLabel('Código de acceso').fill(codigoUnico);
    await otra.page.getByRole('dialog').locator('button[type=submit]').click();
    await otra.page.getByText(/ya se usó en 1 dispositivos?/).waitFor();
    await otra.page.screenshot({ path: join(shots, 'activacion-limite.png') });
  });
  await step('revocar: tras revocar en el panel, recargar el contexto A vuelve a demo', async () => {
    const card = admin.page.getByTestId('licencia').filter({ hasText: 'Escuela de un dispositivo' });
    await card.getByRole('button', { name: 'Acciones' }).click();
    await card.getByRole('button', { name: 'Revocar' }).click();
    await admin.page.getByRole('alertdialog').getByRole('button', { name: 'Sí, revocar' }).click();
    await card.and(admin.page.locator('[data-estado=revocada]')).waitFor();
    await unica.page.reload();
    await unica.page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
    await unica.page.getByTestId('demo-aviso').waitFor({ timeout: 10000 });
    eq(await unica.page.evaluate((k) => localStorage.getItem(k), PERMIT_KEY), null, 'permiso guardado tras la revocación');
    await unica.page.getByRole('button', { name: 'Ajustes' }).click();
    eq(await unica.page.getByText(/Acceso completo · /).count(), 0, 'sigue mostrando acceso completo');
  });
  for (const c of [unica, otra, admin]) await c.context.close();

  await step('acceso pago: sin errores de consola', async () => assert(errors.length === 0, errors.join(' | ')));
}

async function main() {
  const { child, url, keys, tmp, adminPassword } = await startServer();
  srv.keys = keys;
  srv.url = url;
  if (CLOUDFLARE) {
    try {
      srv.admin = adminClient(url.replace(/\/$/, ''), adminPassword);
      await srv.admin.login();
      const lic = await srv.admin.crearLicencia({ entidad: 'Escuela E2E', dias: 30, maxDispositivos: 20 });
      srv.codigoCompleto = lic.codigo;
    } catch (e) {
      child.kill();
      if (tmp) rmSync(tmp, { recursive: true, force: true });
      throw e;
    }
  }
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  const scenarios = [];
  const scenario = async (name, opts, fn) => {
    const { context, page, errors } = await newPage(browser, opts);
    await step(`[${name}] recorrido`, () => fn(page, context, errors));
    await step(`[${name}] sin errores de consola`, async () => assert(errors.length === 0, errors.join(' | ')));
    await context.close();
    scenarios.push(name);
  };

  try {
    // ---- 1. Móvil: pantallas, primer sorteo, 10 sorteos
    await scenario('móvil 390x844', { viewport: MOBILE, scale: 2, fast: false }, async (page, _c, _e) => {
      await open(page, url);
      await step('móvil: pantalla inicial y botón grande abajo', async () => {
        eq(await page.title(), 'Bingo Escolar', 'título');
        const b = await drawBtn(page).boundingBox();
        assert(b.height >= 72, `botón de ${b.height}px (< 72)`);
        assert(b.y + b.height > MOBILE.height * 0.6, 'el botón no está en la zona baja (alcance con una mano)');
        assert(b.width >= MOBILE.width * 0.85, 'el botón no ocupa casi todo el ancho');
        eq(await drawnCount(page), 0, 'sorteados');
        assert((await page.getByTestId('remaining-count').textContent()) === '90', 'restantes 90');
        assert(await page.getByText('Lista para empezar').first().isVisible(), 'estado "Lista para empezar"');
        assert(await page.getByTestId('current-empty').isVisible(), 'aviso de primer número');
        assert(await page.getByRole('button', { name: /deshacer/i }).isDisabled(), 'deshacer habilitado sin sorteos');
      });
      await step('móvil: primer sorteo (con animación)', async () => {
        await drawBtn(page).click();
        await page.waitForFunction(() => document.querySelector('[data-testid=drawn-count]')?.textContent === '1');
        const n = await currentNumber(page);
        assert(n >= 1 && n <= 90, `número fuera de rango: ${n}`);
        eq((await stored(page)).draws.length, 1, 'guardado en localStorage');
        const ball = await page.getByTestId('current-number').boundingBox();
        assert(ball.width >= MOBILE.width * 0.55, `bolilla de ${ball.width}px: no es enorme`);
        assert((await page.getByTestId('live').textContent()).includes('Salió el'), 'región aria-live');
        await sleep(800);
      });
      await step('móvil: 10 sorteos sin repetidos', async () => {
        await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SETTINGS_KEY, JSON.stringify(FAST_SETTINGS)]);
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
        await drawMany(page, 9);
        eq(await drawnCount(page), 10, 'sorteados');
        const nums = (await stored(page)).draws.map((d) => d.number);
        eq(new Set(nums).size, 10, 'números únicos');
        assert((await page.getByTestId('remaining-count').textContent()) === '80', 'restantes 80');
        await checkCredit(page, [['el botón SACAR NÚMERO', drawBtn(page)], ['el número actual', page.getByTestId('current-number')]], MOBILE, 'móvil principal');
        await shot(page, 'main');
      });
      await step('móvil: tablero con 3 estados', async () => {
        await nav(page, 'Tablero').click();
        eq(await page.locator('[data-testid=board] [data-state=last]').count(), 1, 'celdas "último"');
        eq(await page.locator('[data-testid=board] [data-state=drawn]').count(), 9, 'celdas "sorteado"');
        eq(await page.locator('[data-testid=board] [data-state=available]').count(), 80, 'celdas "disponible"');
        const cell = await page.locator('[data-testid=board] li').first().boundingBox();
        assert(cell.width >= 28, `celda de ${cell.width}px: muy chica`);
        await shot(page, 'board');
      });
      await step('móvil: historial (orden, hora, copiar)', async () => {
        await nav(page, 'Historial').click();
        const items = page.getByTestId('history-item');
        eq(await items.count(), 10, 'filas del historial');
        const last = (await stored(page)).draws.at(-1).number;
        assert((await items.first().textContent()).includes(`Número ${last}`), 'el último va arriba');
        assert(/\d\d:\d\d:\d\d/.test(await items.first().textContent()), 'hora HH:MM:SS');
        await shot(page, 'history');
      });
      await step('móvil: ajustes', async () => {
        await nav(page, 'Ajustes').click();
        await page.getByRole('heading', { name: 'Rango de números' }).waitFor();
        await shot(page, 'settings');
      });
      await step('móvil: proyector vertical', async () => {
        await page.getByRole('button', { name: 'Modo proyector', exact: true }).click();
        await page.getByTestId('projector').waitFor();
        const n = await page.getByTestId('projector-number').boundingBox();
        assert(n.width >= MOBILE.width * 0.6, `número del proyector de ${n.width}px`);
        assert(!(await nav(page, 'Ajustes').isVisible().catch(() => false)), 'la barra de pestañas sigue visible');
        assert((await page.getByTestId('projector-count').textContent()).includes('Sorteados 10 de 90'), 'contador');
        await checkCredit(page, [['el número', page.getByTestId('projector-number')], ['el tablero', page.getByTestId('projector').getByTestId('board')]], MOBILE, 'proyector vertical');
        await shot(page, 'projector');
        await page.keyboard.press('Escape');
        await page.getByTestId('projector').waitFor({ state: 'detached' });
      });
    });

    // ---- 1b. Pantalla chica (320 px)
    await scenario('móvil 320x568', { viewport: { width: 320, height: 568 }, scale: 2 }, async (page) => {
      await open(page, url);
      await drawMany(page, 6);
      await step('320px: sin scroll horizontal y botón visible', async () => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `scroll horizontal de ${overflow}px`);
        const b = await drawBtn(page).boundingBox();
        assert(b.y + b.height <= 568 && b.y > 0, 'el botón no entra en pantalla');
        await shot(page, 'main-320');
        await nav(page, 'Tablero').click();
        const over2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(over2 <= 0, `tablero con scroll horizontal de ${over2}px`);
        await shot(page, 'board-320');
      });
    });

    // ---- 2. Escritorio
    await scenario('escritorio 1366x768', { viewport: DESKTOP }, async (page) => {
      await open(page, url);
      await drawMany(page, 12);
      await step('escritorio: sorteo y tablero lado a lado', async () => {
        assert(await page.getByTestId('board').isVisible(), 'el tablero no se ve en la pantalla de sorteo');
        const b = await drawBtn(page).boundingBox();
        assert(b.y + b.height <= DESKTOP.height, 'botón fuera de pantalla');
        await shot(page, 'desktop');
      });
    });

    // ---- 3. Proyector horizontal en teléfono
    await scenario('proyector 844x390', { viewport: LANDSCAPE, scale: 2 }, async (page) => {
      await open(page, url);
      await drawMany(page, 15);
      await step('proyector horizontal: número grande, tablero y últimos', async () => {
        await page.getByRole('button', { name: 'Modo proyector', exact: true }).click();
        const n = await page.getByTestId('projector-number').boundingBox();
        assert(n.height >= 180, `número de ${n.height}px de alto en 390 px de pantalla`);
        const projBoard = page.getByTestId('projector').getByTestId('board');
        assert(await projBoard.isVisible(), 'sin tablero');
        const board = await projBoard.boundingBox();
        assert(board.x > n.x + n.width - 5, 'el tablero debería quedar a la derecha del número');
        assert(board.y + board.height <= LANDSCAPE.height + 1, 'el tablero se sale de la pantalla');
        eq(await page.getByRole('list', { name: 'Últimos números' }).locator('li').count(), 8, 'últimos 8');
        await checkCredit(page, [['el número', page.getByTestId('projector-number')], ['el tablero', projBoard]], LANDSCAPE, 'proyector horizontal');
        await shot(page, 'projector-landscape');
      });
      await step('proyector: atajo de teclado Espacio saca un número', async () => {
        await page.locator('body').click({ position: { x: 5, y: 200 } });
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.querySelector('[data-testid=projector-count]')?.textContent?.includes('16 de 90'));
      });
      await step('proyector: se abre con #proyector', async () => {
        await page.goto(url + '#proyector');
        await page.getByTestId('projector').waitFor();
      });
    });

    // ---- 4. 90 números con dobles clics rápidos
    await scenario('90 sorteos', { viewport: MOBILE, scale: 2 }, async (page) => {
      await open(page, url);
      await step('90 sorteos con doble clic rápido: 90 únicos y se termina', async () => {
        let prev = 0;
        for (let i = 0; i < 600 && prev < 90; i++) {
          await drawBtn(page).dblclick({ delay: 20 });
          await sleep(60);
          const now = await drawnCount(page);
          assert(now - prev <= 1, `un doble clic sacó ${now - prev} números`);
          prev = now;
          if (prev < 90) await sleep(280); // deja que termine el cerrojo de 300 ms
        }
        eq(await drawnCount(page), 90, 'sorteados');
        const game = await stored(page);
        const nums = game.draws.map((d) => d.number);
        eq(new Set(nums).size, 90, 'números únicos');
        eq([...nums].sort((a, b) => a - b), Array.from({ length: 90 }, (_, i) => i + 1), 'cobertura 1..90');
      });
      await step('al terminar: mensaje, botón deshabilitado y 0 restantes', async () => {
        assert(await page.getByTestId('finished-banner').isVisible(), 'no aparece el mensaje de fin');
        assert((await page.getByTestId('finished-banner').textContent()).includes('terminó'), 'mensaje "terminó"');
        assert(await drawBtn(page).isDisabled(), 'el botón sigue habilitado');
        assert((await drawBtn(page).textContent()).toLowerCase().includes('sorteo terminado'), 'texto del botón');
        assert((await page.getByTestId('remaining-count').textContent()) === '0', 'restantes 0');
        await shot(page, 'finished');
      });
      await step('un intento extra de sacar no hace nada', async () => {
        await drawBtn(page).click({ force: true, timeout: 3000 }).catch(() => {});
        await page.keyboard.press('Enter');
        await sleep(400);
        eq(await drawnCount(page), 90, 'sorteados tras intento extra');
        eq((await stored(page)).draws.length, 90, 'guardados tras intento extra');
      });
      await step('recarga: la partida terminada se recupera', async () => {
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
        eq(await drawnCount(page), 90, 'sorteados tras recargar');
        assert(await page.getByTestId('finished-banner').isVisible(), 'mensaje de fin tras recargar');
      });
    });

    // ---- 5. Deshacer y reiniciar
    await scenario('deshacer y reiniciar', { viewport: MOBILE }, async (page) => {
      await open(page, url);
      await drawMany(page, 5);
      await step('deshacer uno: pide confirmación, cancelar no cambia nada', async () => {
        await page.getByRole('button', { name: /deshacer/i }).click();
        const dlg = page.getByRole('alertdialog');
        await dlg.waitFor();
        eq(await drawnCount(page), 5, 'sorteados con el diálogo abierto');
        await dlg.getByRole('button', { name: /no, volver/i }).click();
        await dlg.waitFor({ state: 'detached' });
        eq(await drawnCount(page), 5, 'sorteados tras cancelar');
      });
      await step('deshacer uno: confirmar actualiza contador, tablero e historial', async () => {
        const last = (await stored(page)).draws.at(-1).number;
        await page.getByRole('button', { name: /deshacer/i }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: `Sí, deshacer el ${last}` }).click();
        eq(await drawnCount(page), 4, 'sorteados');
        assert((await page.getByTestId('remaining-count').textContent()) === '86', 'restantes 86');
        await nav(page, 'Tablero').click();
        eq(await page.locator('[data-testid=board] [data-state=available]').count(), 86, 'tablero: disponibles');
        assert((await page.locator(`[data-testid=board] [data-n="${last}"]`).getAttribute('data-state')) === 'available', 'el número deshecho vuelve a disponible');
        await nav(page, 'Historial').click();
        eq(await page.getByTestId('history-item').count(), 4, 'historial');
        await nav(page, 'Sorteo').click();
      });
      await step('deshacer varios hasta vaciar: el botón queda deshabilitado', async () => {
        for (let i = 0; i < 4; i++) {
          await page.getByRole('button', { name: /deshacer/i }).click();
          await page.getByRole('alertdialog').getByRole('button', { name: /^sí, deshacer/i }).click();
        }
        eq(await drawnCount(page), 0, 'sorteados');
        assert(await page.getByRole('button', { name: /deshacer/i }).isDisabled(), 'deshacer habilitado con 0 sorteados');
        eq((await stored(page)).draws.length, 0, 'guardado');
      });
      await step('nueva partida: confirmación clara y borra todo', async () => {
        await drawMany(page, 3);
        await page.getByRole('button', { name: /nueva partida/i }).click();
        const dlg = page.getByRole('alertdialog');
        assert((await dlg.textContent()).includes('Se borran los 3 números'), 'el diálogo no explica qué se borra');
        await dlg.getByRole('button', { name: /no, volver/i }).click();
        eq(await drawnCount(page), 3, 'cancelar no reinicia');
        await page.getByRole('button', { name: /nueva partida/i }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: /sí, empezar de nuevo/i }).click();
        eq(await drawnCount(page), 0, 'sorteados tras reiniciar');
        eq((await stored(page)).draws.length, 0, 'guardado tras reiniciar');
        assert(await page.getByText('Lista para empezar').first().isVisible(), 'estado');
      });
    });

    // ---- 6. Recarga y recuperación
    await scenario('recarga', { viewport: MOBILE }, async (page) => {
      await open(page, url);
      await drawMany(page, 7);
      await step('recargar recupera sorteados, actual e historial', async () => {
        const before = (await stored(page)).draws.map((d) => d.number);
        const cur = await currentNumber(page);
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
        eq(await drawnCount(page), 7, 'sorteados');
        eq(await currentNumber(page), cur, 'número actual');
        eq((await stored(page)).draws.map((d) => d.number), before, 'orden');
        await nav(page, 'Historial').click();
        eq(await page.getByTestId('history-item').count(), 7, 'historial');
        await nav(page, 'Sorteo').click();
        await drawOne(page); // se puede seguir jugando sin repetir
        eq(new Set((await stored(page)).draws.map((d) => d.number)).size, 8, 'sin repetidos tras recargar');
      });
    });

    // ---- 7. Ajustes persistentes y cambio de rango
    await scenario('ajustes', { viewport: MOBILE, fast: false }, async (page) => {
      await open(page, url);
      await step('ajustes: los cambios persisten tras recargar', async () => {
        await nav(page, 'Ajustes').click();
        await page.getByRole('switch', { name: /sonidos/i }).click();
        await page.getByRole('switch', { name: /animaciones/i }).click();
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
        await nav(page, 'Ajustes').click();
        eq(await page.getByRole('switch', { name: /sonidos/i }).getAttribute('aria-checked'), 'false', 'sonidos');
        eq(await page.getByRole('switch', { name: /animaciones/i }).getAttribute('aria-checked'), 'false', 'animaciones');
        eq(await page.getByRole('switch', { name: /leer los números/i }).getAttribute('aria-checked'), 'true', 'voz (sigue activada)');
      });
      await step('ajustes: rango inválido muestra mensaje', async () => {
        await page.getByLabel('Hasta').fill('3');
        await page.getByRole('button', { name: /aplicar rango/i }).click();
        assert(await page.getByText(/al menos 5 números/).isVisible(), 'sin mensaje de rango inválido');
      });
      await step('ajustes: rango sin partida se aplica; con partida pide confirmación', async () => {
        await page.getByLabel('Hasta').fill('50');
        await page.getByRole('button', { name: /aplicar rango/i }).click();
        eq((await stored(page)).range, { min: 1, max: 50 }, 'rango guardado');
        await nav(page, 'Sorteo').click();
        await drawMany(page, 2);
        eq((await page.getByTestId('remaining-count').textContent()), '48', 'restantes con rango 1-50');
        await nav(page, 'Ajustes').click();
        await page.getByLabel('Hasta').fill('60');
        await page.getByRole('button', { name: /aplicar rango/i }).click();
        const dlg = page.getByRole('alertdialog');
        const text = await dlg.textContent();
        assert(text.includes('hay que empezar una partida nueva') && text.includes('Se borran los 2 números'), 'explicación del cambio de rango');
        await dlg.getByRole('button', { name: /no, volver/i }).click();
        eq((await stored(page)).draws.length, 2, 'cancelar conserva la partida');
        await page.getByRole('button', { name: /aplicar rango/i }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: /sí, cambiar el rango/i }).click();
        const g = await stored(page);
        eq([g.range, g.draws.length], [{ min: 1, max: 60 }, 0], 'partida nueva con rango 1-60');
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
        eq((await stored(page)).range, { min: 1, max: 60 }, 'rango tras recargar');
      });
    });

    // ---- 8. Voz
    const speechMock = () => {
      window.__spoken = [];
      class U {
        constructor(t) {
          this.text = t;
        }
      }
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: U, configurable: true, writable: true });
      Object.defineProperty(window, 'speechSynthesis', {
        configurable: true,
        value: { speak: (u) => window.__spoken.push(u.text), cancel() {}, getVoices: () => [], addEventListener() {}, removeEventListener() {} },
      });
    };
    await scenario('voz activada', { viewport: MOBILE, fast: false, init: speechMock }, async (page) => {
      await open(page, url);
      await drawBtn(page).click();
      await page.waitForFunction(() => window.__spoken.length === 1);
      const text = await page.evaluate(() => window.__spoken[0]);
      assert(/^¡Salió el número [a-záéíóú ]+!$/.test(text), `texto hablado inesperado: ${text}`);
    });
    await scenario('voz desactivada', { viewport: MOBILE, fast: false, init: speechMock }, async (page) => {
      await open(page, url);
      await nav(page, 'Ajustes').click();
      await page.getByRole('switch', { name: /leer los números/i }).click();
      await nav(page, 'Sorteo').click();
      await drawOne(page, 800);
      eq(await page.evaluate(() => window.__spoken.length), 0, 'llamadas a speechSynthesis con la voz apagada');
      eq(await drawnCount(page), 1, 'sorteados');
    });
    await scenario('sin speechSynthesis', { viewport: MOBILE, fast: false, init: () => {
      delete window.speechSynthesis;
      delete window.SpeechSynthesisUtterance;
    } }, async (page) => {
      await open(page, url);
      eq(await page.evaluate(() => 'speechSynthesis' in window), false, 'speechSynthesis debería no existir');
      await drawOne(page, 800);
      await drawOne(page, 800);
      eq(await drawnCount(page), 2, 'sorteados sin speechSynthesis');
      await nav(page, 'Ajustes').click();
      assert(await page.getByText(/no puede leer en voz alta/i).isVisible(), 'falta el aviso de voz no soportada');
    });

    // ---- 9. Almacenamiento que falla
    await scenario('almacenamiento con error', { viewport: MOBILE, init: () => {
      Storage.prototype.setItem = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      };
    } }, async (page) => {
      await open(page, url);
      await drawOne(page);
      await drawOne(page);
      eq(await drawnCount(page), 2, 'sorteados con el almacenamiento roto');
      assert(await page.getByTestId('storage-warning').isVisible(), 'falta el aviso de almacenamiento');
      assert((await page.getByTestId('storage-warning').textContent()).includes('No hay lugar para guardar'), 'mensaje de cuota');
      await shot(page, 'storage-warning');
    });

    // ---- 10. Copiar historial
    await scenario('copiar historial', { viewport: MOBILE, permissions: ['clipboard-read', 'clipboard-write'] }, async (page) => {
      await open(page, url);
      await drawMany(page, 3);
      await nav(page, 'Historial').click();
      await page.getByRole('button', { name: /copiar/i }).click();
      await page.getByText('Copiado').waitFor();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      assert(clip.includes('Sorteados: 3 de 90') && clip.includes('Orden de salida:'), `portapapeles inesperado: ${clip.slice(0, 60)}`);
    });

    // ---- 11. Sin conexión (service worker)
    await scenario('sin conexión', { viewport: MOBILE, fast: false }, async (page, context) => {
      await open(page, url);
      await step('offline: el service worker queda activo y controlando', async () => {
        await page.evaluate(() => navigator.serviceWorker.ready);
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
      });
      await step('offline: el caché guarda los archivos listados en sw.js', async () => {
        const sw = await (await fetch(url + 'sw.js')).text();
        const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
        assert(assets.some((a) => /^assets\/index-.*\.js$/.test(a)) && assets.some((a) => a.endsWith('.woff2')) && assets.includes('manifest.webmanifest'), 'lista de assets incompleta');
        const cached = await page.evaluate(async () => {
          const keys = await caches.keys();
          const c = await caches.open(keys[0]);
          return (await c.keys()).map((r) => new URL(r.url).pathname.replace(/^\//, ''));
        });
        for (const a of assets) {
          if (a === './') continue;
          assert(cached.includes(a), `falta en caché: ${a}`);
        }
      });
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SETTINGS_KEY, JSON.stringify(FAST_SETTINGS)]);
      await page.reload();
      await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor();
      await drawMany(page, 2);
      const before = (await stored(page)).draws.map((d) => d.number);
      await step('offline: Ajustes dice que está lista para usar sin Internet', async () => {
        await nav(page, 'Ajustes').click();
        await page.getByText('Lista para usar sin Internet').waitFor();
        await nav(page, 'Sorteo').click();
      });
      await context.setOffline(true);
      await step('offline: recargar abre la app y conserva la partida', async () => {
        await page.reload();
        await page.getByRole('heading', { name: 'Bingo Escolar' }).waitFor({ timeout: 10000 });
        eq(await drawnCount(page), 2, 'sorteados tras recargar sin conexión');
        eq((await stored(page)).draws.map((d) => d.number), before, 'partida guardada');
        assert(await page.getByTestId('offline-chip').isVisible(), 'falta el indicador "Sin Internet"');
        await shot(page, 'offline');
      });
      await step('offline: se puede seguir sorteando', async () => {
        await drawOne(page);
        eq(await drawnCount(page), 3, 'sorteados sin conexión');
        eq(new Set((await stored(page)).draws.map((d) => d.number)).size, 3, 'sin repetidos');
      });
      await step('offline: abrir la URL de nuevo (navegación nueva) también funciona', async () => {
        const p2 = await context.newPage();
        await p2.goto(url);
        await p2.getByRole('heading', { name: 'Bingo Escolar' }).waitFor({ timeout: 10000 });
        eq(await drawnCount(p2), 3, 'sorteados en pestaña nueva sin conexión');
        await p2.close();
      });
      await context.setOffline(false);
    });

    // ---- 12. Modo demo (sin permiso): 15 bolillas y se corta
    await scenario('demo', { viewport: MOBILE, scale: 2, licensed: false }, async (page) => {
      await open(page, url);
      await step('demo: sortea 15 y el botón pasa a "Activar acceso completo"', async () => {
        assert(await page.getByTestId('demo-aviso').isVisible(), 'falta el aviso de versión demo');
        await drawMany(page, 15);
        eq(await drawnCount(page), 15, 'sorteados');
        eq(await drawBtn(page).count(), 0, 'botones de sacar número con el límite alcanzado');
        const activar = page.getByRole('button', { name: 'Activar acceso completo' });
        assert(await activar.isVisible(), 'falta el botón "Activar acceso completo"');
        assert((await page.getByTestId('demo-aviso').textContent()).includes('límite de 15'), 'el aviso no habla del límite');
        await shot(page, 'demo-limite');
      });
      await step('demo: no se puede sacar la bolilla 16 (Enter, Espacio, clic)', async () => {
        await page.locator('body').click({ position: { x: 5, y: 200 } });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await sleep(500);
        eq(await drawnCount(page), 15, 'sorteados tras Enter/Espacio');
        eq((await stored(page)).draws.length, 15, 'guardados');
      });
      await step('demo: el proyector muestra DEMO y Espacio no sortea', async () => {
        await page.getByRole('button', { name: 'Modo proyector', exact: true }).click();
        await page.getByTestId('projector').waitFor();
        assert(await page.getByTestId('demo-insignia').isVisible(), 'falta el cartel DEMO en el proyector');
        await page.keyboard.press('Space');
        await sleep(500);
        assert((await page.getByTestId('projector-count').textContent()).includes('15 de 90'), 'el proyector sorteó la 16');
        eq((await stored(page)).draws.length, 15, 'guardados tras Espacio en el proyector');
        await shot(page, 'demo-proyector');
        await page.keyboard.press('Escape');
        await page.getByTestId('projector').waitFor({ state: 'detached' });
      });
      await step('demo: deshacer vuelve a habilitar el sorteo', async () => {
        await page.getByRole('button', { name: /deshacer/i }).click();
        await page.getByRole('alertdialog').getByRole('button', { name: /^sí, deshacer/i }).click();
        await drawOne(page);
        eq(await drawnCount(page), 15, 'sorteados tras deshacer y sacar otra');
      });
    });

    if (CLOUDFLARE) await accesoPago(browser, url, adminPassword);
  } finally {
    await browser.close();
    child.kill();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }

  // ---- resumen
  console.log('\nResultado E2E');
  console.log('-'.repeat(100));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(78)} ${String(r.ms).padStart(6)} ms${r.ok ? '' : `\n      -> ${r.error}`}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log('-'.repeat(100));
  console.log(`${results.length - failed.length}/${results.length} PASS` + (failed.length ? `, ${failed.length} FAIL` : ''));
  console.log(`\nNota: ${DIST_E2E}/ contiene un build de PRUEBA (clave pública de prueba embebida). dist/ no se tocó;`);
  console.log('para desplegar usá siempre `npm run build` (o `npm run cf:deploy`), que genera dist/ con la clave de producción.');
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('Error en el e2e:', e);
  process.exit(1);
});
