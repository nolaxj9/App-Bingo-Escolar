import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAVE_PUBLICA_PRODUCCION } from '../shared/clavePublica';
import { PERMIT_KEY, DEVICE_KEY, activar, borrarPermiso, guardarPermiso, leerPermiso, obtenerDispositivo, obtenerInfo, renovar, verificarGuardado } from '../services/licencia';
import { useLicencia } from '../hooks/useLicencia';
import { DIA, dispositivoDePrueba, firmarDePrueba, instalarPermiso, json, usarClaveDePrueba } from './permisoDePrueba';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await usarClaveDePrueba();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const cuerpo = (llamada = 0) => JSON.parse(fetchMock.mock.calls[llamada][1].body as string);

describe('servicio: dispositivo y permiso guardado', () => {
  it('crea el id una vez y lo conserva', () => {
    const a = obtenerDispositivo();
    expect(a).toMatch(/^[0-9a-f-]{16,}$/);
    expect(localStorage.getItem(DEVICE_KEY)).toBe(a);
    expect(obtenerDispositivo()).toBe(a);
  });

  it('sin almacenamiento usa un id en memoria estable y no lanza', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const a = obtenerDispositivo();
    expect(a.length).toBeGreaterThan(8);
    expect(obtenerDispositivo()).toBe(a);
    expect(leerPermiso()).toBeNull();
    expect(guardarPermiso('x')).toBe(false);
    expect(() => borrarPermiso()).not.toThrow();
  });

  it('guarda, lee y borra el permiso', () => {
    expect(guardarPermiso('v1.a.b')).toBe(true);
    expect(leerPermiso()).toBe('v1.a.b');
    borrarPermiso();
    expect(leerPermiso()).toBeNull();
  });

  it('verifica el permiso guardado sin red: válido, vencido, de otro dispositivo, alterado', async () => {
    expect(await verificarGuardado()).toEqual({ estado: 'sin_permiso' });
    const { payload } = await instalarPermiso();
    expect(await verificarGuardado()).toEqual({ estado: 'valido', payload });
    expect(await verificarGuardado(payload.exp + 1)).toEqual({ estado: 'invalido', motivo: 'vencido' });

    await instalarPermiso({ did: 'otro-dispositivo' });
    expect(await verificarGuardado()).toEqual({ estado: 'invalido', motivo: 'dispositivo' });

    localStorage.setItem(PERMIT_KEY, 'basura');
    expect(await verificarGuardado()).toEqual({ estado: 'invalido', motivo: 'formato' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('usa VITE_LICENSE_PUBLIC_KEY si está y la de producción si no', async () => {
    await instalarPermiso();
    expect((await verificarGuardado()).estado).toBe('valido');
    vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', '');
    expect(await verificarGuardado()).toEqual({ estado: 'invalido', motivo: 'firma' }); // firmado con la de prueba, no con la de producción
    vi.stubEnv('VITE_LICENSE_PUBLIC_KEY', '{no es json');
    expect(await verificarGuardado()).toEqual({ estado: 'invalido', motivo: 'firma' });
    expect(CLAVE_PUBLICA_PRODUCCION.kty).toBe('EC');
  });
});

describe('servicio: API', () => {
  it('activar: normaliza, manda el dispositivo, verifica y guarda el permiso', async () => {
    const { token } = await firmarDePrueba({ did: obtenerDispositivo() });
    fetchMock.mockResolvedValue(json({ permiso: token, entidad: 'Escuela 12', vence: Date.now() + 20 * DIA }));
    const r = await activar('abcd efgh-jkmn');
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/activar', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    expect(cuerpo()).toEqual({ codigo: 'ABCDEFGHJKMN', dispositivo: obtenerDispositivo() });
    expect(leerPermiso()).toBe(token);
  });

  it('activar: código mal formado no llama a la red', async () => {
    expect(await activar('corto')).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('activar: no guarda un permiso firmado para otro dispositivo', async () => {
    const { token } = await firmarDePrueba({ did: 'otro' });
    fetchMock.mockResolvedValue(json({ permiso: token, entidad: 'X', vence: Date.now() + DIA }));
    expect(await activar('ABCD-EFGH-JKMN')).toMatchObject({ ok: false, error: 'error_interno' });
    expect(leerPermiso()).toBeNull();
  });

  it.each([
    [404, 'codigo_inexistente'],
    [410, 'codigo_vencido'],
    [403, 'codigo_revocado'],
    [409, 'sin_dispositivos'],
    [429, 'demasiados_intentos'],
    [503, 'no_configurado'],
  ])('activar: respuesta %i → %s', async (status, error) => {
    fetchMock.mockResolvedValue(json({ error, mensaje: 'ya se usó en 3 dispositivos' }, status));
    expect(await activar('ABCD-EFGH-JKMN')).toEqual({ ok: false, error, mensaje: 'ya se usó en 3 dispositivos', status });
  });

  it('error de red → sin_conexion; cuerpo que no es JSON → error_interno; error desconocido → error_interno', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await activar('ABCD-EFGH-JKMN')).toEqual({ ok: false, error: 'sin_conexion' });
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    expect(await activar('ABCD-EFGH-JKMN')).toMatchObject({ ok: false, error: 'error_interno', status: 502 });
    fetchMock.mockResolvedValue(new Response('<html>ok</html>', { status: 200 }));
    expect(await activar('ABCD-EFGH-JKMN')).toMatchObject({ ok: false, error: 'error_interno' });
    fetchMock.mockResolvedValue(json({ error: 'inventado' }, 400));
    expect(await activar('ABCD-EFGH-JKMN')).toMatchObject({ ok: false, error: 'error_interno' });
  });

  it('renovar: sin permiso no llama; con permiso manda el token y guarda el nuevo', async () => {
    expect(await renovar()).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    const viejo = await instalarPermiso();
    const nuevo = await firmarDePrueba({ exp: Date.now() + 50 * DIA });
    fetchMock.mockResolvedValue(json({ permiso: nuevo.token, entidad: 'Escuela 12', vence: nuevo.payload.exp }));
    const r = await renovar();
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/renovar', expect.anything());
    expect(cuerpo()).toEqual({ permiso: viejo.token });
    expect(leerPermiso()).toBe(nuevo.token);
  });

  it('obtenerInfo: GET /api/info', async () => {
    const info = { precioArs: 7500, comoComprar: 'Alias: bingo.escolar', whatsapp: '5491155551234', diasPorCodigo: 30 };
    fetchMock.mockResolvedValue(json(info));
    expect(await obtenerInfo()).toEqual({ ok: true, datos: info });
    expect(fetchMock).toHaveBeenCalledWith('/api/info', expect.objectContaining({ method: 'GET' }));
  });
});

describe('useLicencia', () => {
  it('sin permiso: pasa de cargando a demo sin llamar a la red', async () => {
    const { result } = renderHook(() => useLicencia());
    expect(result.current.modo).toBe('cargando');
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    expect(result.current.entidad).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permiso válido: completo al instante (offline) y renueva en segundo plano', async () => {
    await instalarPermiso({ ent: 'Escuela 12', exp: Date.now() + 10 * DIA + 1000 });
    const nuevo = await firmarDePrueba({ ent: 'Escuela 12 (ampliada)', exp: Date.now() + 40 * DIA });
    let responder!: () => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((ok) => {
          responder = () => ok(json({ permiso: nuevo.token, entidad: nuevo.payload.ent, vence: nuevo.payload.exp }));
        }),
    );
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('completo'));
    expect(result.current.diasRestantes).toBe(11);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    responder();
    await waitFor(() => expect(result.current.entidad).toBe('Escuela 12 (ampliada)'));
    expect(result.current.diasRestantes).toBe(40);
    expect(leerPermiso()).toBe(nuevo.token);
  });

  it('error de red al renovar: conserva el acceso y el permiso', async () => {
    const { token } = await instalarPermiso();
    fetchMock.mockRejectedValue(new TypeError('offline'));
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('completo'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.modo).toBe('completo');
    expect(leerPermiso()).toBe(token);
  });

  it('error 500 o servidor sin configurar al renovar: conserva el acceso', async () => {
    await instalarPermiso();
    fetchMock.mockResolvedValue(json({ error: 'no_configurado', mensaje: 'x' }, 503));
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.modo).toBe('completo');
  });

  it.each([403, 410])('renovar responde %i: quita el permiso y vuelve a demo', async (status) => {
    await instalarPermiso();
    fetchMock.mockResolvedValue(json({ error: status === 403 ? 'codigo_revocado' : 'codigo_vencido', mensaje: 'x' }, status));
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    expect(leerPermiso()).toBeNull();
  });

  it('permiso vencido: demo, pero se intenta renovar (puede haberse extendido)', async () => {
    await instalarPermiso({ exp: Date.now() - 1000 });
    const nuevo = await firmarDePrueba({ exp: Date.now() + 30 * DIA });
    fetchMock.mockResolvedValue(json({ permiso: nuevo.token, entidad: 'Escuela 12', vence: nuevo.payload.exp }));
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('completo'));
  });

  it('permiso de otro dispositivo o alterado: se descarta sin llamar a la red', async () => {
    await instalarPermiso({ did: 'copiado-de-otro' });
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    expect(leerPermiso()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un permiso que vence con la app abierta pasa a demo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await instalarPermiso({ exp: Date.now() + 90_000 });
      fetchMock.mockRejectedValue(new TypeError('offline'));
      const { result } = renderHook(() => useLicencia());
      await waitFor(() => expect(result.current.modo).toBe('completo'));
      await act(async () => void vi.advanceTimersByTime(60_000));
      expect(result.current.modo).toBe('completo');
      await act(async () => void vi.advanceTimersByTime(60_000));
      expect(result.current.modo).toBe('demo');
    } finally {
      vi.useRealTimers();
    }
  });

  it('activar desbloquea; quitarAcceso borra el permiso', async () => {
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    const { token, payload } = await firmarDePrueba({ did: obtenerDispositivo(), ent: 'Club Sur' });
    fetchMock.mockResolvedValue(json({ permiso: token, entidad: 'Club Sur', vence: payload.exp }));
    let r;
    await act(async () => {
      r = await result.current.activar('ABCD-EFGH-JKMN');
    });
    expect(r).toMatchObject({ ok: true });
    expect(result.current.modo).toBe('completo');
    expect(result.current.entidad).toBe('Club Sur');
    act(() => result.current.quitarAcceso());
    expect(result.current.modo).toBe('demo');
    expect(leerPermiso()).toBeNull();
  });

  it('activar con error devuelve el error y sigue en demo', async () => {
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    fetchMock.mockRejectedValue(new TypeError('offline'));
    let r;
    await act(async () => {
      r = await result.current.activar('ABCD-EFGH-JKMN');
    });
    expect(r).toEqual({ ok: false, error: 'sin_conexion' });
    expect(result.current.modo).toBe('demo');
  });

  it('info se pide una sola vez y se guarda; si falla se puede reintentar', async () => {
    const info = { precioArs: null, comoComprar: 'x', whatsapp: null, diasPorCodigo: 30 };
    const { result } = renderHook(() => useLicencia());
    await waitFor(() => expect(result.current.modo).toBe('demo'));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    act(() => result.current.cargarInfo());
    await waitFor(() => expect(result.current.infoError).toBe('sin_conexion'));
    fetchMock.mockResolvedValue(json(info));
    act(() => result.current.cargarInfo());
    await waitFor(() => expect(result.current.info).toEqual(info));
    expect(result.current.infoError).toBeNull();
    act(() => result.current.cargarInfo());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(dispositivoDePrueba()).toBeTruthy();
  });
});
