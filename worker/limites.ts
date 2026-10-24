// Límite de intentos fallidos por IP (ventanas fijas de 15 minutos, guardadas en D1).
import type { D1Database } from './d1';

export const VENTANA_MS = 15 * 60 * 1000;
export const MAX_ACTIVACIONES_FALLIDAS = 10;
export const MAX_LOGINS_FALLIDOS = 5;

async function sha256Hex(texto: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clave del contador: tipo + hash de la IP (la IP en sí nunca se guarda). */
export async function claveIntentos(tipo: 'act' | 'login', request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  return `${tipo}:${await sha256Hex(ip)}`;
}

/** true si la clave ya llegó al máximo en la ventana actual. */
export async function bloqueado(db: D1Database, clave: string, max: number, ahora: number): Promise<boolean> {
  const fila = await db
    .prepare('SELECT ventana, cantidad FROM intentos WHERE clave = ?')
    .bind(clave)
    .first<{ ventana: number; cantidad: number }>();
  return !!fila && fila.ventana === Math.floor(ahora / VENTANA_MS) && fila.cantidad >= max;
}

/** Suma un intento fallido (reinicia el contador si cambió la ventana). */
export async function registrarFallo(db: D1Database, clave: string, ahora: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO intentos (clave, ventana, cantidad) VALUES (?, ?, 1)
       ON CONFLICT(clave) DO UPDATE SET
         cantidad = CASE WHEN ventana = excluded.ventana THEN cantidad + 1 ELSE 1 END,
         ventana = excluded.ventana`,
    )
    .bind(clave, Math.floor(ahora / VENTANA_MS))
    .run();
}
