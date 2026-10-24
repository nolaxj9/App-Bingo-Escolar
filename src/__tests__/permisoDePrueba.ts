import { vi } from 'vitest';
import {
  firmarPermiso,
  generarParDeClaves,
  importarClavePrivada,
  type PermisoPayload,
} from '../shared/licencia';
import { DEVICE_KEY, PERMIT_KEY } from '../services/licencia';

/** Un par de claves de prueba por archivo de tests (generarlo es lento). */
let par: Promise<{ publica: JsonWebKey; privada: JsonWebKey }> | null = null;
const claves = () => (par ??= generarParDeClaves());

/** Hace que la app verifique permisos con la clave pública de prueba. Llamar en `beforeAll`/`beforeEach`. */
export async function usarClaveDePrueba(): Promise<void> {
  vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', JSON.stringify((await claves()).publica));
}

export const DIA = 24 * 60 * 60 * 1000;

/** Firma un permiso con la clave de prueba. */
export async function firmarDePrueba(p: Partial<PermisoPayload> = {}): Promise<{ token: string; payload: PermisoPayload }> {
  const payload: PermisoPayload = {
    v: 1,
    lid: 'lic-1',
    ent: 'Escuela 12',
    did: p.did ?? dispositivoDePrueba(),
    iat: Date.now() - DIA,
    exp: Date.now() + 20 * DIA,
    ...p,
  };
  const token = await firmarPermiso(payload, await importarClavePrivada((await claves()).privada));
  return { token, payload };
}

export function dispositivoDePrueba(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = 'dispositivo-de-prueba-1';
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/** Deja guardado un permiso válido (o el que se indique) para este dispositivo. */
export async function instalarPermiso(p: Partial<PermisoPayload> = {}): Promise<{ token: string; payload: PermisoPayload }> {
  const r = await firmarDePrueba(p);
  localStorage.setItem(PERMIT_KEY, r.token);
  return r;
}

/** Respuesta JSON falsa para `fetch`. */
export const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
