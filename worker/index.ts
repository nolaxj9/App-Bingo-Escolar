// Worker de Bingo Escolar: API de acceso pago en /api/*; todo lo demás lo sirven los assets.
import {
  DIAS_POR_CODIGO,
  MAX_DISPOSITIVOS_DEFAULT,
  diasEnMs,
  firmarPermiso,
  generarCodigo,
  hashCodigo,
  importarClavePrivada,
  importarClavePublica,
  normalizarCodigo,
  verificarPermiso,
  type ActivarPedido,
  type Ajustes,
  type ApiError,
  type CodigoError,
  type CrearLicenciaPedido,
  type InfoPublica,
  type LicenciaConCodigo,
  type PermisoRespuesta,
} from '../src/shared/licencia';
import { PASSWORD_MIN, cookieBorrada, crearCookieSesion, passwordCorrecta, sesionValida } from './admin';
import type { Assets, D1Database } from './d1';
import {
  aLicenciaAdmin,
  asegurarEsquema,
  cambiarCodigo,
  cambiarRevocada,
  cambiarVence,
  dispositivoRegistrado,
  guardarAjustes,
  insertarLicencia,
  leerAjustes,
  liberarDispositivos,
  licenciaPorHash,
  licenciaPorId,
  listarLicencias,
  registrarDispositivo,
  tocarDispositivo,
} from './db';
import { MAX_ACTIVACIONES_FALLIDAS, MAX_LOGINS_FALLIDOS, bloqueado, claveIntentos, registrarFallo } from './limites';

export interface Env {
  ASSETS: Assets;
  DB: D1Database;
  /** JWK (JSON) de la clave privada ECDSA P-256 que firma los permisos. */
  LICENSE_PRIVATE_KEY?: string;
  /** Contraseña del panel (mínimo 12 caracteres). */
  ADMIN_PASSWORD?: string;
}

const MAX_CUERPO = 4096;

const ESTADOS: Record<CodigoError, number> = {
  datos_invalidos: 400,
  no_autorizado: 401,
  codigo_revocado: 403,
  codigo_inexistente: 404,
  sin_dispositivos: 409,
  codigo_vencido: 410,
  demasiados_intentos: 429,
  error_interno: 500,
  no_configurado: 503,
};

const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(datos: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(CABECERAS);
  new Headers(extra).forEach((v, k) => headers.append(k, v));
  return new Response(JSON.stringify(datos), { status, headers });
}

/** Error de la API: se corta el pedido y se responde `{ error, mensaje }`. */
class ErrorApi extends Error {
  constructor(
    readonly codigo: CodigoError,
    mensaje: string,
    readonly status = ESTADOS[codigo],
  ) {
    super(mensaje);
  }
}

const falla = (codigo: CodigoError, mensaje: string, status?: number) => new ErrorApi(codigo, mensaje, status);

const MSG = {
  datos: 'Los datos enviados no son válidos. Revisalos e intentá de nuevo.',
  inexistente: 'Ese código no existe. Revisá que esté bien escrito.',
  vencido: 'Ese código ya venció. Pedí uno nuevo para seguir usando el acceso completo.',
  revocado: 'Ese código fue dado de baja. Escribinos para que lo revisemos.',
  dispositivos: (max: number) => `Ese código ya se usó en ${max} dispositivos. Escribinos para liberar uno.`,
  intentos: 'Hiciste demasiados intentos. Esperá unos minutos y probá de nuevo.',
  noAutorizado: 'Tenés que iniciar sesión para entrar al panel.',
  noConfigurado: 'El servicio de acceso todavía no está configurado. Mientras tanto podés usar la versión demo.',
};

// ---------------------------------------------------------------- claves (una vez por isolate)

interface Claves {
  privada: CryptoKey;
  publica: CryptoKey;
}
let clavesCache: { crudo: string; claves: Claves } | null = null;

async function cargarClaves(crudo: string | undefined): Promise<Claves> {
  if (!crudo) throw falla('no_configurado', MSG.noConfigurado);
  if (clavesCache?.crudo === crudo) return clavesCache.claves;
  try {
    const jwk = JSON.parse(crudo) as JsonWebKey;
    const { d: _d, ...resto } = jwk;
    const claves = {
      privada: await importarClavePrivada(jwk),
      publica: await importarClavePublica({ ...resto, key_ops: ['verify'] }),
    };
    clavesCache = { crudo, claves };
    return claves;
  } catch {
    throw falla('no_configurado', MSG.noConfigurado);
  }
}

// ---------------------------------------------------------------- lectura y validación

async function leerJson(request: Request): Promise<Record<string, unknown>> {
  const largo = Number(request.headers.get('Content-Length') ?? 0);
  if (largo > MAX_CUERPO) throw falla('datos_invalidos', MSG.datos);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_CUERPO) throw falla('datos_invalidos', MSG.datos);
  if (bytes.length === 0) return {};
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // cae al error de abajo
  }
  throw falla('datos_invalidos', MSG.datos);
}

const invalido = (campo: string) => falla('datos_invalidos', `${campo} no es válido. Revisalo e intentá de nuevo.`);

function texto(v: unknown, campo: string, min: number, max: number, porDefecto?: string): string {
  if (v === undefined && porDefecto !== undefined) return porDefecto;
  if (typeof v !== 'string') throw invalido(campo);
  const t = v.trim();
  if (t.length < min || t.length > max) throw invalido(campo);
  return t;
}

function entero(v: unknown, campo: string, min: number, max: number, porDefecto?: number): number {
  if (v === undefined && porDefecto !== undefined) return porDefecto;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw invalido(campo);
  return v;
}

function enteroONulo(v: unknown, campo: string, min: number, max: number): number | null {
  return v === undefined || v === null ? null : entero(v, campo, min, max);
}

function validarAjustes(b: Record<string, unknown>, actual: Ajustes): Ajustes {
  let whatsapp = actual.whatsapp;
  if (b.whatsapp !== undefined) {
    if (b.whatsapp === null) whatsapp = null;
    else if (typeof b.whatsapp === 'string' && /^\d{8,15}$/.test(b.whatsapp)) whatsapp = b.whatsapp;
    else throw invalido('El WhatsApp (solo números, con código de país)');
  }
  return {
    precioArs: b.precioArs === undefined ? actual.precioArs : enteroONulo(b.precioArs, 'El precio', 0, 100_000_000),
    comoComprar: b.comoComprar === undefined ? actual.comoComprar : texto(b.comoComprar, 'El texto de cómo comprar', 0, 1000),
    whatsapp,
  };
}

// ---------------------------------------------------------------- público

async function info(env: Env): Promise<Response> {
  const a = await leerAjustes(env.DB);
  const cuerpo: InfoPublica = { ...a, diasPorCodigo: DIAS_POR_CODIGO };
  return json(cuerpo);
}

async function activar(request: Request, env: Env, ahora: number): Promise<Response> {
  const { privada } = await cargarClaves(env.LICENSE_PRIVATE_KEY);
  const clave = await claveIntentos('act', request);
  if (await bloqueado(env.DB, clave, MAX_ACTIVACIONES_FALLIDAS, ahora)) throw falla('demasiados_intentos', MSG.intentos);
  const b = (await leerJson(request)) as Partial<ActivarPedido>;
  const dispositivo = b.dispositivo;
  if (typeof dispositivo !== 'string' || dispositivo.length < 1 || dispositivo.length > 100) throw invalido('El dispositivo');

  const normalizado = typeof b.codigo === 'string' ? normalizarCodigo(b.codigo) : null;
  if (!normalizado) {
    await registrarFallo(env.DB, clave, ahora);
    throw falla('datos_invalidos', 'El código no tiene el formato correcto. Son 12 letras y números, por ejemplo ABCD-EFGH-JKMN.');
  }
  const lic = await licenciaPorHash(env.DB, await hashCodigo(normalizado));
  if (!lic) {
    await registrarFallo(env.DB, clave, ahora);
    throw falla('codigo_inexistente', MSG.inexistente);
  }
  if (lic.revocada != null) throw falla('codigo_revocado', MSG.revocado);
  if (lic.vence <= ahora) throw falla('codigo_vencido', MSG.vencido);
  if (!(await registrarDispositivo(env.DB, lic, dispositivo, ahora))) throw falla('sin_dispositivos', MSG.dispositivos(lic.max_dispositivos));

  const permiso = await firmarPermiso({ v: 1, lid: lic.id, ent: lic.entidad, did: dispositivo, iat: ahora, exp: lic.vence }, privada);
  const cuerpo: PermisoRespuesta = { permiso, entidad: lic.entidad, vence: lic.vence };
  return json(cuerpo);
}

async function renovar(request: Request, env: Env, ahora: number): Promise<Response> {
  const { privada, publica } = await cargarClaves(env.LICENSE_PRIVATE_KEY);
  const b = await leerJson(request);
  const token = b.permiso;
  if (typeof token !== 'string') throw invalido('El permiso');
  // Un permiso vencido sigue sirviendo para renovar: solo importa que la firma sea nuestra.
  const r = await verificarPermiso(token, publica, { ahora: 0 });
  if (!r.ok) throw invalido('El permiso');
  const payload = r.payload;

  const lic = await licenciaPorId(env.DB, payload.lid);
  if (!lic || lic.revocada != null) throw falla('codigo_revocado', MSG.revocado);
  if (!(await dispositivoRegistrado(env.DB, lic.id, payload.did))) {
    throw falla('codigo_revocado', 'Este dispositivo ya no tiene acceso. Activá el código de nuevo.');
  }
  if (lic.vence <= ahora) throw falla('codigo_vencido', MSG.vencido);
  await tocarDispositivo(env.DB, lic.id, payload.did, ahora);
  const nuevo = await firmarPermiso({ v: 1, lid: lic.id, ent: lic.entidad, did: payload.did, iat: ahora, exp: lic.vence }, privada);
  const cuerpo: PermisoRespuesta = { permiso: nuevo, entidad: lic.entidad, vence: lic.vence };
  return json(cuerpo);
}

// ---------------------------------------------------------------- panel

async function login(request: Request, env: Env, ahora: number): Promise<Response> {
  const password = passwordConfigurada(env);
  const clave = await claveIntentos('login', request);
  if (await bloqueado(env.DB, clave, MAX_LOGINS_FALLIDOS, ahora)) throw falla('demasiados_intentos', MSG.intentos);
  const b = await leerJson(request);
  const ingresada = typeof b.password === 'string' ? b.password : '';
  if (!(await passwordCorrecta(ingresada, password))) {
    await registrarFallo(env.DB, clave, ahora);
    throw falla('no_autorizado', 'La contraseña no es correcta.');
  }
  return json({ ok: true }, 200, { 'Set-Cookie': await crearCookieSesion(password, ahora) });
}

function passwordConfigurada(env: Env): string {
  const p = env.ADMIN_PASSWORD;
  if (!p || p.length < PASSWORD_MIN) throw falla('no_configurado', MSG.noConfigurado);
  return p;
}

const LICENCIA_NO_ENCONTRADA = 'No encontramos esa licencia.';

async function licenciaOFalla(env: Env, id: string) {
  const lic = await licenciaPorId(env.DB, id);
  if (!lic) throw falla('codigo_inexistente', LICENCIA_NO_ENCONTRADA);
  return lic;
}

async function conCodigo(env: Env, id: string, ahora: number, codigo: string): Promise<Response> {
  const lic = await licenciaOFalla(env, id);
  const cuerpo: LicenciaConCodigo = { licencia: await aLicenciaAdmin(env.DB, lic, ahora), codigo };
  return json(cuerpo);
}

async function crearLicencia(request: Request, env: Env, ahora: number): Promise<Response> {
  const b = (await leerJson(request)) as Partial<Record<keyof CrearLicenciaPedido, unknown>>;
  const dias = entero(b.dias, 'Los días', 1, 3650, DIAS_POR_CODIGO);
  const id = crypto.randomUUID();
  const codigo = generarCodigo();
  await insertarLicencia(env.DB, {
    id,
    entidad: texto(b.entidad, 'La entidad', 1, 120),
    contacto: texto(b.contacto, 'El contacto', 0, 500, ''),
    notas: texto(b.notas, 'Las notas', 0, 500, ''),
    codigoHash: await hashCodigo(normalizarCodigo(codigo) ?? ''),
    codigoFinal: codigo.slice(-4),
    creada: ahora,
    vence: ahora + diasEnMs(dias),
    maxDispositivos: entero(b.maxDispositivos, 'Los dispositivos', 1, 20, MAX_DISPOSITIVOS_DEFAULT),
    montoArs: enteroONulo(b.montoArs, 'El monto', 0, 100_000_000),
  });
  return conCodigo(env, id, ahora, codigo);
}

async function accionLicencia(accion: string, id: string, request: Request, env: Env, ahora: number): Promise<Response> {
  const lic = await licenciaOFalla(env, id);
  switch (accion) {
    case 'extender': {
      const dias = entero((await leerJson(request)).dias, 'Los días', 1, 3650);
      await cambiarVence(env.DB, id, Math.max(lic.vence, ahora) + diasEnMs(dias));
      break;
    }
    case 'revocar':
      await cambiarRevocada(env.DB, id, ahora);
      break;
    case 'reactivar':
      await cambiarRevocada(env.DB, id, null);
      break;
    case 'liberar-dispositivos':
      await liberarDispositivos(env.DB, id);
      break;
    case 'regenerar-codigo': {
      const codigo = generarCodigo();
      await cambiarCodigo(env.DB, id, await hashCodigo(normalizarCodigo(codigo) ?? ''), codigo.slice(-4));
      return conCodigo(env, id, ahora, codigo);
    }
    default:
      throw falla('codigo_inexistente', 'No existe esa ruta.', 404);
  }
  return json(await aLicenciaAdmin(env.DB, await licenciaOFalla(env, id), ahora));
}

async function admin(request: Request, env: Env, ruta: string, ahora: number): Promise<Response> {
  const metodo = request.method;
  const password = passwordConfigurada(env);
  const esLogout = ruta === '/api/admin/logout';
  const esLogin = ruta === '/api/admin/login';
  if (esLogin && metodo !== 'POST') throw sinMetodo('POST');

  if (esLogout) {
    if (metodo !== 'POST') throw sinMetodo('POST');
    return json({ ok: true }, 200, { 'Set-Cookie': cookieBorrada() });
  }
  if (!esLogin && !(await sesionValida(request, password, ahora))) throw falla('no_autorizado', MSG.noAutorizado);
  if (metodo !== 'GET' && metodo !== 'HEAD' && !/^application\/json\b/i.test(request.headers.get('Content-Type') ?? '')) {
    throw falla('datos_invalidos', 'El pedido tiene que enviarse como JSON.', 415);
  }
  if (esLogin) return login(request, env, ahora);

  if (ruta === '/api/admin/licencias') {
    if (metodo === 'GET') return json(await listarLicencias(env.DB, ahora));
    if (metodo === 'POST') return crearLicencia(request, env, ahora);
    throw sinMetodo('GET, POST');
  }
  if (ruta === '/api/admin/ajustes') {
    if (metodo === 'GET') return json(await leerAjustes(env.DB));
    if (metodo === 'PUT') {
      const nuevos = validarAjustes(await leerJson(request), await leerAjustes(env.DB));
      await guardarAjustes(env.DB, nuevos);
      return json(nuevos);
    }
    throw sinMetodo('GET, PUT');
  }
  const m = /^\/api\/admin\/licencias\/([^/]+)\/([a-z-]+)$/.exec(ruta);
  if (m) {
    if (metodo !== 'POST') throw sinMetodo('POST');
    return accionLicencia(m[2], decodeURIComponent(m[1]), request, env, ahora);
  }
  throw falla('codigo_inexistente', 'No existe esa ruta.', 404);
}

function sinMetodo(permitidos: string) {
  return falla('datos_invalidos', `Método no permitido. Se acepta: ${permitidos}.`, 405);
}

// ---------------------------------------------------------------- router

/** Atiende un pedido. `ahora` se inyecta para poder probar vencimientos. */
export async function manejar(request: Request, env: Env, ahora: number): Promise<Response> {
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/\/+$/, '') || '/';
  // `/admin/...` rompería las rutas relativas de los assets (base './'): todo va a `/admin`.
  if (url.pathname.startsWith('/admin/')) return Response.redirect(`${url.origin}/admin`, 301);
  if (ruta !== '/api' && !ruta.startsWith('/api/')) return env.ASSETS.fetch(request);

  try {
    if (!env.DB) throw falla('no_configurado', MSG.noConfigurado);
    await asegurarEsquema(env.DB);
    const metodo = request.method;
    if (ruta === '/api/info') {
      if (metodo !== 'GET') throw sinMetodo('GET');
      return await info(env);
    }
    if (ruta === '/api/activar' || ruta === '/api/renovar') {
      if (metodo !== 'POST') throw sinMetodo('POST');
      return await (ruta === '/api/activar' ? activar : renovar)(request, env, ahora);
    }
    if (ruta.startsWith('/api/admin/')) return await admin(request, env, ruta, ahora);
    throw falla('codigo_inexistente', 'No existe esa ruta.', 404);
  } catch (e) {
    if (e instanceof ErrorApi) {
      const cuerpo: ApiError = { error: e.codigo, mensaje: e.message };
      return json(cuerpo, e.status);
    }
    console.error('error_interno', e);
    const cuerpo: ApiError = { error: 'error_interno', mensaje: 'Algo salió mal de nuestro lado. Probá de nuevo en unos minutos.' };
    return json(cuerpo, 500);
  }
}

export default {
  fetch: (request: Request, env: Env) => manejar(request, env, Date.now()),
};
