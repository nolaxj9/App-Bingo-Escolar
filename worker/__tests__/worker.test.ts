// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  diasEnMs,
  generarParDeClaves,
  hashCodigo,
  importarClavePublica,
  normalizarCodigo,
  verificarPermiso,
  type ApiError,
  type LicenciaAdmin,
  type LicenciaConCodigo,
  type PermisoRespuesta,
} from '../../src/shared/licencia';
import { manejar, type Env } from '../index';
import { crearFakeD1, type FakeD1 } from './fakeD1';

const T0 = Date.UTC(2026, 9, 24, 12, 0, 0);
const PASSWORD = 'contraseña-larga-123';
const DISP = 'dispositivo-1';

let publica: JsonWebKey;
let privada: JsonWebKey;
let ahora: number;
let db: FakeD1;
let env: Env;

beforeAll(async () => {
  ({ publica, privada } = await generarParDeClaves());
});

beforeEach(() => {
  ahora = T0;
  db = crearFakeD1();
  env = {
    ASSETS: { fetch: async () => new Response('estatico', { status: 200 }) },
    DB: db,
    LICENSE_PRIVATE_KEY: JSON.stringify(privada),
    ADMIN_PASSWORD: PASSWORD,
  };
});

interface Opciones {
  metodo?: string;
  cuerpo?: unknown;
  cookie?: string;
  ip?: string;
  tipo?: string | null;
  env?: Env;
}

async function llamar(ruta: string, o: Opciones = {}) {
  const headers = new Headers();
  const metodo = o.metodo ?? (o.cuerpo !== undefined ? 'POST' : 'GET');
  if (o.tipo !== null && (o.cuerpo !== undefined || metodo !== 'GET')) headers.set('Content-Type', o.tipo ?? 'application/json');
  if (o.cookie) headers.set('Cookie', o.cookie);
  if (o.ip) headers.set('CF-Connecting-IP', o.ip);
  const body = o.cuerpo === undefined ? undefined : typeof o.cuerpo === 'string' ? o.cuerpo : JSON.stringify(o.cuerpo);
  const res = await manejar(new Request(`https://bingo.test${ruta}`, { method: metodo, headers, body }), o.env ?? env, ahora);
  const texto = await res.text();
  return { res, status: res.status, datos: (texto ? JSON.parse(texto) : null) as unknown };
}

const comoError = (d: unknown) => d as ApiError;

async function loguear(): Promise<string> {
  const { res } = await llamar('/api/admin/login', { cuerpo: { password: PASSWORD } });
  return res.headers.get('Set-Cookie')!.split(';')[0];
}

async function crear(cookie: string, extra: Record<string, unknown> = {}) {
  const r = await llamar('/api/admin/licencias', { cuerpo: { entidad: 'Escuela 1', ...extra }, cookie });
  return r.datos as LicenciaConCodigo;
}

async function activar(codigo: string, dispositivo = DISP, ip?: string) {
  return llamar('/api/activar', { cuerpo: { codigo, dispositivo }, ip });
}

describe('rutas generales', () => {
  it('delega lo que no es /api a los assets', async () => {
    const r = await manejar(new Request('https://bingo.test/index.html'), env, ahora);
    expect(await r.text()).toBe('estatico');
  });

  it('ruta /api desconocida: 404 JSON con cabeceras de seguridad', async () => {
    const { res, status, datos } = await llamar('/api/nada');
    expect(status).toBe(404);
    expect(comoError(datos).error).toBe('codigo_inexistente');
    expect(res.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('método no permitido: 405', async () => {
    expect((await llamar('/api/activar', { metodo: 'GET' })).status).toBe(405);
  });

  it('crea las tablas solas', async () => {
    await llamar('/api/info');
    const t = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    expect(t.map((x) => x.name).sort()).toEqual(['ajustes', 'dispositivos', 'intentos', 'licencias']);
  });

  it('error inesperado: 500 error_interno', async () => {
    const roto: Env = { ...env, DB: { ...db, batch: async () => { throw new Error('boom'); }, prepare: db.prepare.bind(db) } };
    const { status, datos } = await llamar('/api/info', { env: roto });
    expect(status).toBe(500);
    expect(comoError(datos).error).toBe('error_interno');
  });
});

describe('GET /api/info', () => {
  it('devuelve valores por defecto y funciona solo con la base', async () => {
    const solo: Env = { ...env, LICENSE_PRIVATE_KEY: undefined, ADMIN_PASSWORD: undefined };
    const { status, datos } = await llamar('/api/info', { env: solo });
    expect(status).toBe(200);
    expect(datos).toEqual({ precioArs: null, comoComprar: '', whatsapp: null, diasPorCodigo: 30 });
  });

  it('503 sin base', async () => {
    const { status, datos } = await llamar('/api/info', { env: { ...env, DB: undefined as never } });
    expect(status).toBe(503);
    expect(comoError(datos).error).toBe('no_configurado');
  });
});

describe('503 sin secretos', () => {
  it('activar y renovar sin clave privada', async () => {
    const sin: Env = { ...env, LICENSE_PRIVATE_KEY: undefined };
    for (const ruta of ['/api/activar', '/api/renovar']) {
      const r = await llamar(ruta, { cuerpo: {}, env: sin });
      expect(r.status).toBe(503);
      expect(comoError(r.datos).error).toBe('no_configurado');
    }
  });

  it('clave privada ilegible', async () => {
    const r = await llamar('/api/activar', { cuerpo: {}, env: { ...env, LICENSE_PRIVATE_KEY: 'no-es-json' } });
    expect(r.status).toBe(503);
  });

  it('panel sin contraseña o con una de menos de 12 caracteres', async () => {
    for (const pw of [undefined, 'corta']) {
      const e: Env = { ...env, ADMIN_PASSWORD: pw };
      expect((await llamar('/api/admin/login', { cuerpo: { password: 'corta' }, env: e })).status).toBe(503);
      expect((await llamar('/api/admin/licencias', { env: e })).status).toBe(503);
    }
  });
});

describe('panel: sesión', () => {
  it('login correcto da cookie con los atributos pedidos', async () => {
    const { res, status } = await llamar('/api/admin/login', { cuerpo: { password: PASSWORD } });
    expect(status).toBe(200);
    const c = res.headers.get('Set-Cookie')!;
    expect(c).toMatch(/^bingo_admin=\d+\.[0-9a-f]{64};/);
    for (const a of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api/admin', 'Max-Age=43200']) expect(c).toContain(a);
  });

  it('contraseña incorrecta: 401', async () => {
    const r = await llamar('/api/admin/login', { cuerpo: { password: 'otra-contraseña-larga' } });
    expect(r.status).toBe(401);
    expect(comoError(r.datos).error).toBe('no_autorizado');
    expect((await llamar('/api/admin/login', { cuerpo: {} })).status).toBe(401);
  });

  it('login exige JSON (415)', async () => {
    const r = await llamar('/api/admin/login', { cuerpo: 'password=x', tipo: 'text/plain' });
    expect(r.status).toBe(415);
    expect(comoError(r.datos).error).toBe('datos_invalidos');
  });

  it('5 logins fallidos por IP bloquean el sexto, aunque sea correcto (429)', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await llamar('/api/admin/login', { cuerpo: { password: 'mala-mala-mala' }, ip: '1.1.1.1' })).status).toBe(401);
    }
    const r = await llamar('/api/admin/login', { cuerpo: { password: PASSWORD }, ip: '1.1.1.1' });
    expect(r.status).toBe(429);
    expect(comoError(r.datos).error).toBe('demasiados_intentos');
    // otra IP no se ve afectada; y pasada la ventana se libera
    expect((await llamar('/api/admin/login', { cuerpo: { password: PASSWORD }, ip: '2.2.2.2' })).status).toBe(200);
    ahora += 15 * 60 * 1000;
    expect((await llamar('/api/admin/login', { cuerpo: { password: PASSWORD }, ip: '1.1.1.1' })).status).toBe(200);
  });

  it('sin cookie, cookie falsificada o vencida: 401', async () => {
    const buena = await loguear();
    expect((await llamar('/api/admin/licencias')).status).toBe(401);
    const [venc, firma] = buena.split('=')[1].split('.');
    const falsa = `bingo_admin=${Number(venc) + 1000}.${firma}`;
    expect((await llamar('/api/admin/licencias', { cookie: falsa })).status).toBe(401);
    expect((await llamar('/api/admin/licencias', { cookie: `bingo_admin=${venc}.zz` })).status).toBe(401);
    expect((await llamar('/api/admin/licencias', { cookie: 'bingo_admin=basura' })).status).toBe(401);
    expect((await llamar('/api/admin/licencias', { cookie: buena })).status).toBe(200);
    ahora += 12 * 60 * 60 * 1000;
    const r = await llamar('/api/admin/licencias', { cookie: buena });
    expect(r.status).toBe(401);
    expect(comoError(r.datos).error).toBe('no_autorizado');
  });

  it('cookie firmada con otra contraseña no sirve', async () => {
    const buena = await loguear();
    const otro: Env = { ...env, ADMIN_PASSWORD: 'otra-contraseña-larga' };
    expect((await llamar('/api/admin/licencias', { cookie: buena, env: otro })).status).toBe(401);
  });

  it('logout borra la cookie', async () => {
    const { res, status } = await llamar('/api/admin/logout', { cuerpo: {} });
    expect(status).toBe(200);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });

  it('los pedidos que cambian datos exigen JSON (415) pero primero sesión (401)', async () => {
    const cookie = await loguear();
    expect((await llamar('/api/admin/licencias', { cuerpo: '{}', tipo: 'text/plain', cookie })).status).toBe(415);
    expect((await llamar('/api/admin/licencias', { cuerpo: '{}', tipo: 'text/plain' })).status).toBe(401);
    expect((await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo: '{}', tipo: 'text/plain', cookie })).status).toBe(415);
  });
});

describe('panel: licencias', () => {
  it('crea con valores por defecto, lista y no expone el código ni su hash', async () => {
    const cookie = await loguear();
    const { licencia, codigo } = await crear(cookie, { contacto: ' Ana ', montoArs: 5000 });
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(licencia).toMatchObject({
      entidad: 'Escuela 1', contacto: 'Ana', notas: '', codigoFinal: codigo.slice(-4), creada: T0,
      vence: T0 + diasEnMs(30), maxDispositivos: 3, dispositivosUsados: 0, revocada: null, montoArs: 5000, estado: 'activa',
    });
    const lista = (await llamar('/api/admin/licencias', { cookie })).datos as LicenciaAdmin[];
    expect(lista).toHaveLength(1);
    expect(JSON.stringify(lista)).not.toContain(codigo);
    expect(JSON.stringify(lista)).not.toContain('hash');
    const fila = db.sqlite.prepare('SELECT codigo_hash FROM licencias').get() as { codigo_hash: string };
    expect(fila.codigo_hash).toBe(await hashCodigo(normalizarCodigo(codigo)!));
  });

  it('lista las más nuevas primero', async () => {
    const cookie = await loguear();
    await crear(cookie, { entidad: 'Vieja' });
    ahora += 1000;
    await crear(cookie, { entidad: 'Nueva' });
    const lista = (await llamar('/api/admin/licencias', { cookie })).datos as LicenciaAdmin[];
    expect(lista.map((l) => l.entidad)).toEqual(['Nueva', 'Vieja']);
  });

  it.each([
    ['entidad vacía', { entidad: '   ' }],
    ['entidad larga', { entidad: 'x'.repeat(121) }],
    ['entidad no texto', { entidad: 5 }],
    ['contacto largo', { contacto: 'x'.repeat(501) }],
    ['notas largas', { notas: 'x'.repeat(501) }],
    ['días 0', { dias: 0 }],
    ['días 3651', { dias: 3651 }],
    ['días decimal', { dias: 1.5 }],
    ['dispositivos 0', { maxDispositivos: 0 }],
    ['dispositivos 21', { maxDispositivos: 21 }],
    ['monto negativo', { montoArs: -1 }],
    ['monto enorme', { montoArs: 100000001 }],
    ['monto decimal', { montoArs: 10.5 }],
  ])('validación: %s → 400', async (_n, extra) => {
    const cookie = await loguear();
    const r = await llamar('/api/admin/licencias', { cuerpo: { entidad: 'Escuela', ...extra }, cookie });
    expect(r.status).toBe(400);
    expect(comoError(r.datos).error).toBe('datos_invalidos');
  });

  it('acepta los límites y monto nulo', async () => {
    const cookie = await loguear();
    const { licencia } = await crear(cookie, { entidad: 'x'.repeat(120), dias: 3650, maxDispositivos: 20, montoArs: null });
    expect(licencia.maxDispositivos).toBe(20);
    expect(licencia.montoArs).toBeNull();
  });

  it('cuerpo mayor a 4 KB o JSON roto: 400', async () => {
    const cookie = await loguear();
    const grande = await llamar('/api/admin/licencias', { cuerpo: { entidad: 'a', notas: 'x'.repeat(5000) }, cookie });
    expect(grande.status).toBe(400);
    expect((await llamar('/api/admin/licencias', { cuerpo: '{roto', cookie })).status).toBe(400);
    expect((await llamar('/api/admin/licencias', { cuerpo: '[1]', cookie })).status).toBe(400);
  });

  it('extender suma desde max(vence, ahora)', async () => {
    const cookie = await loguear();
    const { licencia } = await crear(cookie, { dias: 10 });
    const ext = (await llamar(`/api/admin/licencias/${licencia.id}/extender`, { cuerpo: { dias: 5 }, cookie })).datos as LicenciaAdmin;
    expect(ext.vence).toBe(T0 + diasEnMs(15));
    ahora = T0 + diasEnMs(100); // ya vencida (y la sesión también)
    const cookie2 = await loguear();
    const ext2 = (await llamar(`/api/admin/licencias/${licencia.id}/extender`, { cuerpo: { dias: 30 }, cookie: cookie2 })).datos as LicenciaAdmin;
    expect(ext2.vence).toBe(ahora + diasEnMs(30));
    for (const dias of [0, 3651, 'x', undefined]) {
      expect((await llamar(`/api/admin/licencias/${licencia.id}/extender`, { cuerpo: { dias }, cookie: cookie2 })).status).toBe(400);
    }
  });

  it('revocar, reactivar y estado vencida', async () => {
    const cookie = await loguear();
    const { licencia } = await crear(cookie);
    const rev = (await llamar(`/api/admin/licencias/${licencia.id}/revocar`, { cuerpo: {}, cookie })).datos as LicenciaAdmin;
    expect(rev.estado).toBe('revocada');
    expect(rev.revocada).toBe(T0);
    const rea = (await llamar(`/api/admin/licencias/${licencia.id}/reactivar`, { cuerpo: {}, cookie })).datos as LicenciaAdmin;
    expect(rea.estado).toBe('activa');
    ahora = T0 + diasEnMs(31);
    const lista = (await llamar('/api/admin/licencias', { cookie: await loguear() })).datos as LicenciaAdmin[];
    expect(lista[0].estado).toBe('vencida');
  });

  it('acciones sobre licencia inexistente: 404; acción desconocida: 404', async () => {
    const cookie = await loguear();
    for (const a of ['extender', 'revocar', 'reactivar', 'liberar-dispositivos', 'regenerar-codigo']) {
      const r = await llamar(`/api/admin/licencias/no-existe/${a}`, { cuerpo: { dias: 1 }, cookie });
      expect(r.status).toBe(404);
    }
    const { licencia } = await crear(cookie);
    expect((await llamar(`/api/admin/licencias/${licencia.id}/borrar`, { cuerpo: {}, cookie })).status).toBe(404);
    expect((await llamar(`/api/admin/licencias/${licencia.id}/revocar`, { metodo: 'GET', cookie })).status).toBe(405);
  });

  it('regenerar código: el viejo da 404 y el nuevo activa', async () => {
    const cookie = await loguear();
    const { licencia, codigo } = await crear(cookie);
    const nuevo = (await llamar(`/api/admin/licencias/${licencia.id}/regenerar-codigo`, { cuerpo: {}, cookie })).datos as LicenciaConCodigo;
    expect(nuevo.codigo).not.toBe(codigo);
    expect(nuevo.licencia.codigoFinal).toBe(nuevo.codigo.slice(-4));
    expect((await activar(codigo)).status).toBe(404);
    expect((await activar(nuevo.codigo)).status).toBe(200);
  });
});

describe('panel: ajustes', () => {
  it('GET por defecto, PUT guarda y /api/info lo refleja', async () => {
    const cookie = await loguear();
    expect((await llamar('/api/admin/ajustes', { cookie })).datos).toEqual({ precioArs: null, comoComprar: '', whatsapp: null });
    const nuevos = { precioArs: 7500, comoComprar: 'Alias: bingo.escolar', whatsapp: '5491122334455' };
    const put = await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo: nuevos, cookie });
    expect(put.status).toBe(200);
    expect(put.datos).toEqual(nuevos);
    expect((await llamar('/api/info')).datos).toEqual({ ...nuevos, diasPorCodigo: 30 });
    const nulo = await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo: { precioArs: null, comoComprar: '', whatsapp: null }, cookie });
    expect(nulo.datos).toEqual({ precioArs: null, comoComprar: '', whatsapp: null });
  });

  it.each([
    ['comoComprar largo', { comoComprar: 'x'.repeat(1001) }],
    ['whatsapp con letras', { whatsapp: '54911abc' }],
    ['whatsapp corto', { whatsapp: '1234567' }],
    ['whatsapp largo', { whatsapp: '1234567890123456' }],
    ['whatsapp con +', { whatsapp: '+5491122334455' }],
    ['precio decimal', { precioArs: 1.5 }],
    ['precio negativo', { precioArs: -5 }],
    ['precio texto', { precioArs: '5' }],
  ])('validación: %s → 400', async (_n, cuerpo) => {
    const cookie = await loguear();
    expect((await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo, cookie })).status).toBe(400);
  });

  it('PUT parcial conserva lo demás', async () => {
    const cookie = await loguear();
    await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo: { precioArs: 100, comoComprar: 'a', whatsapp: '12345678' }, cookie });
    const r = await llamar('/api/admin/ajustes', { metodo: 'PUT', cuerpo: { precioArs: 200 }, cookie });
    expect(r.datos).toEqual({ precioArs: 200, comoComprar: 'a', whatsapp: '12345678' });
  });
});

describe('POST /api/activar', () => {
  it('activa y devuelve un permiso verificable con la clave pública', async () => {
    const cookie = await loguear();
    const { licencia, codigo } = await crear(cookie, { entidad: 'Escuela Norte' });
    ahora += 5000;
    const { status, datos } = await activar(codigo.toLowerCase().replace(/-/g, ' '));
    expect(status).toBe(200);
    const p = datos as PermisoRespuesta;
    expect(p).toMatchObject({ entidad: 'Escuela Norte', vence: licencia.vence });
    const pub = await importarClavePublica(publica);
    const r = await verificarPermiso(p.permiso, pub, { ahora, dispositivo: DISP });
    expect(r).toEqual({
      ok: true,
      payload: { v: 1, lid: licencia.id, ent: 'Escuela Norte', did: DISP, iat: ahora, exp: licencia.vence },
    });
    expect(await verificarPermiso(p.permiso, pub, { ahora, dispositivo: 'otro' })).toEqual({ ok: false, motivo: 'dispositivo' });
    expect(await verificarPermiso(p.permiso, pub, { ahora: licencia.vence })).toEqual({ ok: false, motivo: 'vencido' });
  });

  it('formato inválido: 400 datos_invalidos', async () => {
    for (const codigo of ['', 'ABC', 'AAAA-BBBB-0000', 5]) {
      const r = await llamar('/api/activar', { cuerpo: { codigo, dispositivo: DISP } });
      expect(r.status).toBe(400);
      expect(comoError(r.datos).error).toBe('datos_invalidos');
    }
    expect((await llamar('/api/activar', { cuerpo: { codigo: 'ABCD-EFGH-JKMN' } })).status).toBe(400);
    expect((await llamar('/api/activar', { cuerpo: { codigo: 'ABCD-EFGH-JKMN', dispositivo: 'x'.repeat(101) } })).status).toBe(400);
  });

  it('código que no existe: 404', async () => {
    const r = await activar('ABCD-EFGH-JKMN');
    expect(r.status).toBe(404);
    expect(comoError(r.datos).error).toBe('codigo_inexistente');
    expect(comoError(r.datos).mensaje).toMatch(/código/);
  });

  it('revocado: 403; vencido: 410', async () => {
    const cookie = await loguear();
    const { licencia, codigo } = await crear(cookie, { dias: 1 });
    await llamar(`/api/admin/licencias/${licencia.id}/revocar`, { cuerpo: {}, cookie });
    const rev = await activar(codigo);
    expect(rev.status).toBe(403);
    expect(comoError(rev.datos).error).toBe('codigo_revocado');
    await llamar(`/api/admin/licencias/${licencia.id}/reactivar`, { cuerpo: {}, cookie });
    ahora = T0 + diasEnMs(1);
    const venc = await activar(codigo);
    expect(venc.status).toBe(410);
    expect(comoError(venc.datos).error).toBe('codigo_vencido');
  });

  it('límite de dispositivos: 409, pero el mismo dispositivo puede reactivar', async () => {
    const cookie = await loguear();
    const { licencia, codigo } = await crear(cookie, { maxDispositivos: 2 });
    expect((await activar(codigo, 'a')).status).toBe(200);
    expect((await activar(codigo, 'b')).status).toBe(200);
    const c = await activar(codigo, 'c');
    expect(c.status).toBe(409);
    expect(comoError(c.datos).error).toBe('sin_dispositivos');
    ahora += 1000;
    expect((await activar(codigo, 'a')).status).toBe(200);
    const fila = db.sqlite.prepare("SELECT primera, ultima FROM dispositivos WHERE dispositivo = 'a'").get() as { primera: number; ultima: number };
    expect(fila).toEqual({ primera: T0, ultima: T0 + 1000 });
    const lista = (await llamar('/api/admin/licencias', { cookie })).datos as LicenciaAdmin[];
    expect(lista[0].dispositivosUsados).toBe(2);
    // liberar → entra el tercero
    await llamar(`/api/admin/licencias/${licencia.id}/liberar-dispositivos`, { cuerpo: {}, cookie });
    expect((await activar(codigo, 'c')).status).toBe(200);
  });

  it('10 fallos por IP bloquean el siguiente (429), aun con un código bueno', async () => {
    const cookie = await loguear();
    const { codigo } = await crear(cookie);
    for (let i = 0; i < 10; i++) {
      const r = await activar(i % 2 ? 'ABCD-EFGH-JKMN' : 'mal', DISP, '9.9.9.9');
      expect(r.status).toBe(i % 2 ? 404 : 400);
    }
    const r = await activar(codigo, DISP, '9.9.9.9');
    expect(r.status).toBe(429);
    expect(comoError(r.datos).error).toBe('demasiados_intentos');
    expect((await activar(codigo, DISP, '8.8.8.8')).status).toBe(200);
    ahora += 15 * 60 * 1000;
    expect((await activar(codigo, DISP, '9.9.9.9')).status).toBe(200);
  });

  it('los intentos exitosos no suman al límite', async () => {
    const cookie = await loguear();
    const { codigo } = await crear(cookie);
    for (let i = 0; i < 15; i++) expect((await activar(codigo, DISP, '7.7.7.7')).status).toBe(200);
  });

  it('guarda la IP hasheada, nunca en claro', async () => {
    await activar('mal', DISP, '5.5.5.5');
    const filas = db.sqlite.prepare('SELECT clave FROM intentos').all() as { clave: string }[];
    expect(filas).toHaveLength(1);
    expect(filas[0].clave).toMatch(/^act:[0-9a-f]{64}$/);
  });

  it('sin CF-Connecting-IP usa "local"', async () => {
    for (let i = 0; i < 10; i++) await activar('mal');
    expect((await activar('mal')).status).toBe(429);
  });
});

describe('POST /api/renovar', () => {
  async function activada(extra: Record<string, unknown> = {}) {
    const cookie = await loguear();
    const lic = await crear(cookie, extra);
    const p = (await activar(lic.codigo)).datos as PermisoRespuesta;
    return { cookie, lic, permiso: p.permiso };
  }
  const renovar = (permiso: unknown) => llamar('/api/renovar', { cuerpo: { permiso } });

  it('renueva con el mismo vencimiento', async () => {
    const { lic, permiso } = await activada();
    ahora += 60_000;
    const r = await renovar(permiso);
    expect(r.status).toBe(200);
    const p = r.datos as PermisoRespuesta;
    expect(p.vence).toBe(lic.licencia.vence);
    const v = await verificarPermiso(p.permiso, await importarClavePublica(publica), { ahora, dispositivo: DISP });
    expect(v.ok && v.payload.iat).toBe(ahora);
    const fila = db.sqlite.prepare('SELECT ultima FROM dispositivos').get() as { ultima: number };
    expect(fila.ultima).toBe(ahora);
  });

  it('extender da un permiso con vencimiento posterior', async () => {
    const { cookie, lic, permiso } = await activada();
    await llamar(`/api/admin/licencias/${lic.licencia.id}/extender`, { cuerpo: { dias: 30 }, cookie });
    const p = (await renovar(permiso)).datos as PermisoRespuesta;
    expect(p.vence).toBe(lic.licencia.vence + diasEnMs(30));
    const v = await verificarPermiso(p.permiso, await importarClavePublica(publica), { ahora });
    expect(v.ok && v.payload.exp).toBe(p.vence);
  });

  it('acepta un permiso vencido si la licencia se extendió', async () => {
    const { cookie, lic, permiso } = await activada({ dias: 1 });
    ahora = T0 + diasEnMs(2);
    expect((await renovar(permiso)).status).toBe(410);
    expect(cookie).toBeTruthy();
    await llamar(`/api/admin/licencias/${lic.licencia.id}/extender`, { cuerpo: { dias: 30 }, cookie: await loguear() });
    const r = await renovar(permiso);
    expect(r.status).toBe(200);
  });

  it('licencia vencida: 410', async () => {
    const { permiso } = await activada({ dias: 1 });
    ahora = T0 + diasEnMs(1);
    const r = await renovar(permiso);
    expect(r.status).toBe(410);
    expect(comoError(r.datos).error).toBe('codigo_vencido');
  });

  it('revocada: 403; reactivada vuelve a andar', async () => {
    const { cookie, lic, permiso } = await activada();
    await llamar(`/api/admin/licencias/${lic.licencia.id}/revocar`, { cuerpo: {}, cookie });
    const r = await renovar(permiso);
    expect(r.status).toBe(403);
    expect(comoError(r.datos).error).toBe('codigo_revocado');
    await llamar(`/api/admin/licencias/${lic.licencia.id}/reactivar`, { cuerpo: {}, cookie });
    expect((await renovar(permiso)).status).toBe(200);
  });

  it('dispositivos liberados: 403', async () => {
    const { cookie, lic, permiso } = await activada();
    await llamar(`/api/admin/licencias/${lic.licencia.id}/liberar-dispositivos`, { cuerpo: {}, cookie });
    const r = await renovar(permiso);
    expect(r.status).toBe(403);
    expect(comoError(r.datos).error).toBe('codigo_revocado');
  });

  it('licencia inexistente: 403', async () => {
    const { permiso } = await activada();
    db.sqlite.exec('DELETE FROM licencias');
    expect((await renovar(permiso)).status).toBe(403);
  });

  it('token ajeno, alterado, mal formado o sin token: 400', async () => {
    const { permiso } = await activada();
    const otro = await generarParDeClaves();
    const ajeno: Env = { ...env, LICENSE_PRIVATE_KEY: JSON.stringify(otro.privada) };
    expect((await llamar('/api/renovar', { cuerpo: { permiso }, env: ajeno })).status).toBe(400);
    const [v, cuerpo, firma] = permiso.split('.');
    const alterado = `${v}.${btoa(JSON.stringify({ v: 1, lid: 'x', ent: 'x', did: DISP, iat: 0, exp: 9e15 })).replace(/=+$/, '')}.${firma}`;
    expect(cuerpo).toBeTruthy();
    for (const t of [alterado, 'basura', '', 5, undefined]) {
      const r = await renovar(t);
      expect(r.status).toBe(400);
      expect(comoError(r.datos).error).toBe('datos_invalidos');
    }
  });
});
