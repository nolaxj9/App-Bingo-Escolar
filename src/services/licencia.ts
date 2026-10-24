import { CLAVE_PUBLICA_PRODUCCION } from '../shared/clavePublica';
import {
  importarClavePublica,
  normalizarCodigo,
  verificarPermiso,
  type ApiError,
  type CodigoError,
  type InfoPublica,
  type MotivoPermisoInvalido,
  type PermisoPayload,
  type PermisoRespuesta,
} from '../shared/licencia';

export const DEVICE_KEY = 'bingo-escolar:dispositivo';
export const PERMIT_KEY = 'bingo-escolar:permiso';

/** Tiempo máximo de espera de la API: pasado esto se toma como "sin conexión". */
const TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------- dispositivo y permiso guardados

let dispositivoEnMemoria: string | null = null;

function nuevoId(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* sigue con el respaldo */
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Id anónimo de este dispositivo: se crea una vez y se guarda. Si el almacenamiento no está
 * disponible se usa uno en memoria (dura mientras la página esté abierta).
 */
export function obtenerDispositivo(): string {
  try {
    const guardado = localStorage.getItem(DEVICE_KEY);
    if (guardado && guardado.length >= 8 && guardado.length <= 100) return guardado;
    const id = dispositivoEnMemoria ?? nuevoId();
    localStorage.setItem(DEVICE_KEY, id);
    dispositivoEnMemoria = id;
    return id;
  } catch {
    dispositivoEnMemoria ??= nuevoId();
    return dispositivoEnMemoria;
  }
}

export function leerPermiso(): string | null {
  try {
    return localStorage.getItem(PERMIT_KEY);
  } catch {
    return null;
  }
}

/** `false` si no se pudo guardar (el acceso vale igual hasta cerrar la página, pero no en la próxima visita). */
export function guardarPermiso(token: string): boolean {
  try {
    localStorage.setItem(PERMIT_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export function borrarPermiso(): void {
  try {
    localStorage.removeItem(PERMIT_KEY);
  } catch {
    /* ignorar */
  }
}

// ---------------------------------------------------------------- verificación offline

const claves = new Map<string, Promise<CryptoKey>>();

/** JWK público para verificar permisos: `VITE_LICENSE_PUBLIC_KEY` (JSON) si está en el build, si no el de producción. */
function leerJwkPublico(): JsonWebKey {
  const env = import.meta.env.VITE_LICENSE_PUBLIC_KEY;
  if (typeof env === 'string' && env.trim() !== '') {
    try {
      const jwk: unknown = JSON.parse(env);
      if (jwk && typeof jwk === 'object') return jwk as JsonWebKey;
    } catch {
      /* clave mal formada en el build: se usa la de producción */
    }
  }
  return CLAVE_PUBLICA_PRODUCCION;
}

function clavePublica(): Promise<CryptoKey> {
  const jwk = leerJwkPublico();
  const id = JSON.stringify(jwk);
  let p = claves.get(id);
  if (!p) {
    p = importarClavePublica(jwk);
    claves.set(id, p);
    p.catch(() => claves.delete(id));
  }
  return p;
}

export type EstadoPermiso =
  | { estado: 'sin_permiso' }
  | { estado: 'valido'; payload: PermisoPayload }
  | { estado: 'invalido'; motivo: MotivoPermisoInvalido };

/** Verifica el permiso guardado sin Internet: firma, dispositivo y vencimiento. */
export async function verificarGuardado(ahora = Date.now()): Promise<EstadoPermiso> {
  const token = leerPermiso();
  if (!token) return { estado: 'sin_permiso' };
  try {
    const r = await verificarPermiso(token, await clavePublica(), { ahora, dispositivo: obtenerDispositivo() });
    return r.ok ? { estado: 'valido', payload: r.payload } : { estado: 'invalido', motivo: r.motivo };
  } catch {
    return { estado: 'invalido', motivo: 'formato' };
  }
}

// ---------------------------------------------------------------- API

export type ErrorLicencia = CodigoError | 'sin_conexion';
export type Resultado<T> = { ok: true; datos: T } | { ok: false; error: ErrorLicencia; mensaje?: string; status?: number };

const CODIGOS: ReadonlySet<string> = new Set<CodigoError>([
  'datos_invalidos',
  'codigo_inexistente',
  'codigo_vencido',
  'codigo_revocado',
  'sin_dispositivos',
  'demasiados_intentos',
  'no_autorizado',
  'no_configurado',
  'error_interno',
]);

/** Llama a la API y traduce todo fallo a un `Resultado`; nunca lanza. */
async function llamar<T>(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<Resultado<T>> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  let res: Response;
  let texto: string;
  try {
    res = await fetch(ruta, {
      method: metodo,
      headers: cuerpo === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: 'no-store',
      credentials: 'same-origin',
      signal: control.signal,
    });
    texto = await res.text();
  } catch {
    return { ok: false, error: 'sin_conexion' };
  } finally {
    clearTimeout(timer);
  }
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, error: 'error_interno', status: res.status };
  }
  if (!res.ok) {
    const e = json as Partial<ApiError> | null;
    const error = e && typeof e.error === 'string' && CODIGOS.has(e.error) ? (e.error as CodigoError) : 'error_interno';
    return { ok: false, error, mensaje: typeof e?.mensaje === 'string' ? e.mensaje : undefined, status: res.status };
  }
  return { ok: true, datos: json as T };
}

function esPermisoRespuesta(x: unknown): x is PermisoRespuesta {
  const p = x as Partial<PermisoRespuesta> | null;
  return !!p && typeof p.permiso === 'string' && typeof p.entidad === 'string' && typeof p.vence === 'number';
}

/** Un permiso nuevo solo se guarda si la firma y el dispositivo son correctos (aunque el vencimiento sea de otro reloj). */
async function aceptarPermiso(r: Resultado<PermisoRespuesta>): Promise<Resultado<PermisoRespuesta>> {
  if (!r.ok) return r;
  if (!esPermisoRespuesta(r.datos)) return { ok: false, error: 'error_interno' };
  try {
    const v = await verificarPermiso(r.datos.permiso, await clavePublica(), { dispositivo: obtenerDispositivo(), ahora: 0 });
    if (!v.ok) return { ok: false, error: 'error_interno' };
  } catch {
    return { ok: false, error: 'error_interno' };
  }
  guardarPermiso(r.datos.permiso);
  return r;
}

/** Canjea un código por un permiso y lo guarda. Pide Internet una sola vez. */
export async function activar(codigo: string): Promise<Resultado<PermisoRespuesta>> {
  const normalizado = normalizarCodigo(codigo);
  if (!normalizado) return { ok: false, error: 'datos_invalidos' };
  return aceptarPermiso(await llamar<PermisoRespuesta>('POST', '/api/activar', { codigo: normalizado, dispositivo: obtenerDispositivo() }));
}

/** Pide al servidor un permiso al día (refleja extensiones y revocaciones). Sin permiso guardado: `datos_invalidos`. */
export async function renovar(): Promise<Resultado<PermisoRespuesta>> {
  const permiso = leerPermiso();
  if (!permiso) return { ok: false, error: 'datos_invalidos' };
  return aceptarPermiso(await llamar<PermisoRespuesta>('POST', '/api/renovar', { permiso }));
}

export async function obtenerInfo(): Promise<Resultado<InfoPublica>> {
  return llamar<InfoPublica>('GET', '/api/info');
}
