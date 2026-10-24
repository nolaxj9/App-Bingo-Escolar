// Contrato compartido entre la app (navegador) y el Worker (servidor) para el acceso pago.
// Solo usa Web Crypto y APIs estándar: corre igual en Chromium, Safari, Firefox y Cloudflare Workers.

/** Días de acceso que compra un código (USD 5). */
export const DIAS_POR_CODIGO = 30;
/** Dispositivos que puede activar un código si el panel no dice otra cosa. */
export const MAX_DISPOSITIVOS_DEFAULT = 3;
/** Sin código, la app sortea como máximo esta cantidad de números por partida. */
export const DEMO_MAX_BOLILLAS = 15;

const DIA_MS = 24 * 60 * 60 * 1000;
export const diasEnMs = (dias: number) => dias * DIA_MS;

// ---------------------------------------------------------------- códigos de acceso

/** Sin 0/O, 1/I/L: se dictan por WhatsApp o teléfono sin confusiones. 31 símbolos × 12 ≈ 59 bits. */
export const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LARGO_CODIGO = 12;

/** Código nuevo con el formato `XXXX-XXXX-XXXX`, con azar criptográfico y sin sesgo. */
export function generarCodigo(): string {
  const n = ALFABETO_CODIGO.length;
  const limite = 256 - (256 % n);
  const out: string[] = [];
  while (out.length < LARGO_CODIGO) {
    const buf = new Uint8Array(LARGO_CODIGO * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limite && out.length < LARGO_CODIGO) out.push(ALFABETO_CODIGO[b % n]);
    }
  }
  return formatearCodigo(out.join(''));
}

/** `abcd efgh-ijkl` → `ABCDEFGHIJKL`, o `null` si no tiene 12 símbolos válidos. */
export function normalizarCodigo(entrada: string): string | null {
  const limpio = entrada.toUpperCase().replace(/[\s\-_.]/g, '');
  if (limpio.length !== LARGO_CODIGO) return null;
  for (const c of limpio) if (!ALFABETO_CODIGO.includes(c)) return null;
  return limpio;
}

export function formatearCodigo(normalizado: string): string {
  return normalizado.match(/.{1,4}/g)?.join('-') ?? normalizado;
}

/** SHA-256 en hexadecimal del código normalizado. Es lo único que se guarda en la base. */
export async function hashCodigo(normalizado: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizado));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- permiso firmado (token)

/** Contenido del permiso que el Worker firma y la app guarda para funcionar sin Internet. */
export interface PermisoPayload {
  v: 1;
  /** id de la licencia en la base */
  lid: string;
  /** nombre de la entidad, para mostrarlo en la app */
  ent: string;
  /** id del dispositivo que lo activó */
  did: string;
  /** emitido (ms desde epoch) */
  iat: number;
  /** vence (ms desde epoch) */
  exp: number;
}

export type MotivoPermisoInvalido = 'formato' | 'firma' | 'vencido' | 'dispositivo';
export type ResultadoPermiso = { ok: true; payload: PermisoPayload } | { ok: false; motivo: MotivoPermisoInvalido };

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const FIRMA = { name: 'ECDSA', hash: 'SHA-256' } as const;

function b64urlDeBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesDeB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function importarClavePublica(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['verify']);
}

export function importarClavePrivada(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['sign']);
}

/** Genera un par de claves nuevo (lo usan el script de claves y las pruebas). */
export async function generarParDeClaves(): Promise<{ publica: JsonWebKey; privada: JsonWebKey }> {
  const par = (await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify'])) as CryptoKeyPair;
  const publica = await crypto.subtle.exportKey('jwk', par.publicKey);
  const privada = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { publica, privada };
}

/** `v1.<payload base64url>.<firma base64url>` */
export async function firmarPermiso(payload: PermisoPayload, clavePrivada: CryptoKey): Promise<string> {
  const cuerpo = b64urlDeBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const datos = new TextEncoder().encode(`v1.${cuerpo}`);
  const firma = new Uint8Array(await crypto.subtle.sign(FIRMA, clavePrivada, datos));
  return `v1.${cuerpo}.${b64urlDeBytes(firma)}`;
}

function esPayload(x: unknown): x is PermisoPayload {
  const p = x as Record<string, unknown> | null;
  return (
    !!p &&
    typeof p === 'object' &&
    p.v === 1 &&
    typeof p.lid === 'string' &&
    typeof p.ent === 'string' &&
    typeof p.did === 'string' &&
    typeof p.iat === 'number' &&
    typeof p.exp === 'number' &&
    Number.isFinite(p.iat) &&
    Number.isFinite(p.exp)
  );
}

/** Lee el payload sin verificar la firma (solo para mostrar datos; nunca para dar acceso). */
export function leerPermisoSinVerificar(token: string): PermisoPayload | null {
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return null;
  const bytes = bytesDeB64url(partes[1]);
  if (!bytes) return null;
  try {
    const p: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return esPayload(p) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Verifica firma, vencimiento y dispositivo. Funciona sin Internet.
 * `dispositivo` se omite en el servidor cuando solo importa la firma.
 */
export async function verificarPermiso(
  token: string,
  clavePublica: CryptoKey,
  { ahora = Date.now(), dispositivo }: { ahora?: number; dispositivo?: string } = {},
): Promise<ResultadoPermiso> {
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, motivo: 'formato' };
  const partes = token.split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return { ok: false, motivo: 'formato' };
  const payload = leerPermisoSinVerificar(token);
  const firma = bytesDeB64url(partes[2]);
  if (!payload || !firma) return { ok: false, motivo: 'formato' };
  let valida = false;
  try {
    valida = await crypto.subtle.verify(FIRMA, clavePublica, firma, new TextEncoder().encode(`v1.${partes[1]}`));
  } catch {
    valida = false;
  }
  if (!valida) return { ok: false, motivo: 'firma' };
  if (dispositivo !== undefined && payload.did !== dispositivo) return { ok: false, motivo: 'dispositivo' };
  if (payload.exp <= ahora) return { ok: false, motivo: 'vencido' };
  return { ok: true, payload };
}

// ---------------------------------------------------------------- API HTTP

/** Respuesta de error de cualquier endpoint: `{ error: CodigoError, mensaje: string }`. */
export type CodigoError =
  | 'datos_invalidos' // 400
  | 'codigo_inexistente' // 404
  | 'codigo_vencido' // 410
  | 'codigo_revocado' // 403
  | 'sin_dispositivos' // 409: ya se usó en el máximo de dispositivos
  | 'demasiados_intentos' // 429
  | 'no_autorizado' // 401 (panel)
  | 'no_configurado' // 503: faltan secretos o base en Cloudflare
  | 'error_interno'; // 500

export interface ApiError {
  error: CodigoError;
  mensaje: string;
}

/** GET /api/info */
export interface InfoPublica {
  precioArs: number | null;
  /** Texto libre: alias, link de pago o WhatsApp. */
  comoComprar: string;
  /** Número de WhatsApp en formato internacional sin "+", o null. */
  whatsapp: string | null;
  diasPorCodigo: number;
}

/** POST /api/activar */
export interface ActivarPedido {
  codigo: string;
  dispositivo: string;
}
/** POST /api/renovar */
export interface RenovarPedido {
  permiso: string;
}
/** Respuesta de activar y renovar. */
export interface PermisoRespuesta {
  permiso: string;
  entidad: string;
  vence: number;
}

/** Licencia tal como la ve el panel de administración (nunca incluye el código ni su hash). */
export interface LicenciaAdmin {
  id: string;
  entidad: string;
  contacto: string;
  notas: string;
  /** Últimos 4 caracteres del código, para reconocerlo. */
  codigoFinal: string;
  creada: number;
  vence: number;
  maxDispositivos: number;
  dispositivosUsados: number;
  revocada: number | null;
  montoArs: number | null;
  estado: 'activa' | 'vencida' | 'revocada';
}

/** POST /api/admin/licencias */
export interface CrearLicenciaPedido {
  entidad: string;
  contacto?: string;
  notas?: string;
  dias?: number;
  maxDispositivos?: number;
  montoArs?: number | null;
}
/** Respuesta de crear y de regenerar código: el código se muestra una sola vez. */
export interface LicenciaConCodigo {
  licencia: LicenciaAdmin;
  codigo: string;
}

/** GET/PUT /api/admin/ajustes */
export interface Ajustes {
  precioArs: number | null;
  comoComprar: string;
  whatsapp: string | null;
}
