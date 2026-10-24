import type { Ajustes, ApiError, CodigoError, CrearLicenciaPedido, LicenciaAdmin, LicenciaConCodigo } from '../shared/licencia';

/** Error de la API del panel. `codigo` es el de `ApiError`, o 'sin_conexion' si no hubo respuesta. */
export class AdminError extends Error {
  constructor(
    public codigo: CodigoError | 'sin_conexion',
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

async function pedir<T>(metodo: 'GET' | 'POST' | 'PUT', ruta: string, cuerpo?: unknown): Promise<T> {
  let res: Response;
  let texto: string;
  try {
    res = await fetch(ruta, {
      method: metodo,
      headers: metodo === 'GET' ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: metodo === 'GET' ? undefined : JSON.stringify(cuerpo ?? {}),
      credentials: 'same-origin',
      cache: 'no-store',
    });
    texto = await res.text();
  } catch {
    throw new AdminError('sin_conexion', 0, 'No hay conexión con el servidor.');
  }
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new AdminError('error_interno', res.status, 'Respuesta inesperada del servidor.');
  }
  if (!res.ok) {
    const e = json as Partial<ApiError> | null;
    throw new AdminError(e?.error ?? 'error_interno', res.status, typeof e?.mensaje === 'string' ? e.mensaje : 'Algo salió mal.');
  }
  return json as T;
}

const L = '/api/admin/licencias';

export const adminApi = {
  login: (password: string) => pedir<unknown>('POST', '/api/admin/login', { password }),
  logout: () => pedir<unknown>('POST', '/api/admin/logout'),
  licencias: () => pedir<LicenciaAdmin[]>('GET', L),
  crear: (p: CrearLicenciaPedido) => pedir<LicenciaConCodigo>('POST', L, p),
  extender: (id: string, dias: number) => pedir<unknown>('POST', `${L}/${encodeURIComponent(id)}/extender`, { dias }),
  revocar: (id: string) => pedir<unknown>('POST', `${L}/${encodeURIComponent(id)}/revocar`),
  reactivar: (id: string) => pedir<unknown>('POST', `${L}/${encodeURIComponent(id)}/reactivar`),
  liberar: (id: string) => pedir<unknown>('POST', `${L}/${encodeURIComponent(id)}/liberar-dispositivos`),
  regenerar: (id: string) => pedir<LicenciaConCodigo>('POST', `${L}/${encodeURIComponent(id)}/regenerar-codigo`),
  ajustes: () => pedir<Ajustes>('GET', '/api/admin/ajustes'),
  guardarAjustes: (a: Ajustes) => pedir<Ajustes>('PUT', '/api/admin/ajustes', a),
};
