// Sesión del panel: cookie `bingo_admin=<vence>.<hmac>` firmada con una clave derivada de ADMIN_PASSWORD.

export const COOKIE_ADMIN = 'bingo_admin';
export const SESION_MS = 12 * 60 * 60 * 1000;
export const PASSWORD_MIN = 12;

const enc = new TextEncoder();

async function sha256(texto: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

function bytesDeHex(s: string): Uint8Array | null {
  if (!/^(?:[0-9a-f]{2})+$/.test(s)) return null;
  return Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
}

async function claveHmac(password: string): Promise<CryptoKey> {
  const material = await sha256(`bingo-admin-v1:${password}`);
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Comparación en tiempo constante: se comparan los SHA-256 de ambos textos byte a byte. */
export async function passwordCorrecta(ingresada: string, esperada: string): Promise<boolean> {
  const a = await sha256(ingresada);
  const b = await sha256(esperada);
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i];
  return dif === 0;
}

async function firmar(password: string, vence: number): Promise<string> {
  const firma = await crypto.subtle.sign('HMAC', await claveHmac(password), enc.encode(`admin.${vence}`));
  return hex(new Uint8Array(firma));
}

export async function crearCookieSesion(password: string, ahora: number): Promise<string> {
  const vence = ahora + SESION_MS;
  const valor = `${vence}.${await firmar(password, vence)}`;
  return `${COOKIE_ADMIN}=${valor}; Max-Age=${SESION_MS / 1000}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;
}

export function cookieBorrada(): string {
  return `${COOKIE_ADMIN}=; Max-Age=0; Path=/api/admin; HttpOnly; Secure; SameSite=Strict`;
}

function leerCookie(request: Request, nombre: string): string | null {
  for (const par of (request.headers.get('Cookie') ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0 && par.slice(0, i).trim() === nombre) return par.slice(i + 1).trim();
  }
  return null;
}

/** true si la cookie existe, la firma es válida y no pasó su vencimiento. */
export async function sesionValida(request: Request, password: string, ahora: number): Promise<boolean> {
  const valor = leerCookie(request, COOKIE_ADMIN);
  if (!valor) return false;
  const [vencTxt, firmaHex, resto] = valor.split('.');
  if (resto !== undefined || !firmaHex || !/^\d{1,16}$/.test(vencTxt ?? '')) return false;
  const vence = Number(vencTxt);
  const firma = bytesDeHex(firmaHex);
  if (!firma) return false;
  const ok = await crypto.subtle.verify('HMAC', await claveHmac(password), firma, enc.encode(`admin.${vence}`));
  return ok && vence > ahora;
}
