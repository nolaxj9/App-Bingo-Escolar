import { describe, expect, it } from 'vitest';
import {
  ALFABETO_CODIGO,
  firmarPermiso,
  formatearCodigo,
  generarCodigo,
  generarParDeClaves,
  hashCodigo,
  importarClavePrivada,
  importarClavePublica,
  normalizarCodigo,
  verificarPermiso,
  type PermisoPayload,
} from '../shared/licencia';

const payload = (p: Partial<PermisoPayload> = {}): PermisoPayload => ({
  v: 1,
  lid: 'l1',
  ent: 'Escuela 12',
  did: 'disp-1',
  iat: 1_000,
  exp: 10_000_000,
  ...p,
});

async function claves() {
  const { publica, privada } = await generarParDeClaves();
  return { pub: await importarClavePublica(publica), priv: await importarClavePrivada(privada) };
}

describe('códigos', () => {
  it('generarCodigo: formato XXXX-XXXX-XXXX con el alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generarCodigo();
      expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      for (const ch of c.replace(/-/g, '')) expect(ALFABETO_CODIGO).toContain(ch);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });

  it('generarCodigo no repite (azar)', () => {
    expect(new Set(Array.from({ length: 100 }, generarCodigo)).size).toBe(100);
  });

  it('normalizarCodigo acepta minúsculas, espacios y guiones', () => {
    expect(normalizarCodigo('abcd-efgh-jkmn')).toBe('ABCDEFGHJKMN');
    expect(normalizarCodigo(' abcd efgh  jkmn ')).toBe('ABCDEFGHJKMN');
    expect(normalizarCodigo('ABCDEFGHJKMN')).toBe('ABCDEFGHJKMN');
    expect(normalizarCodigo('abcd_efgh.jkmn')).toBe('ABCDEFGHJKMN');
  });

  it.each(['', 'ABCD-EFGH', 'ABCD-EFGH-JKMNP', 'ABCD-EFGH-JKM0', 'ABCD-EFGH-JKMI', 'ABCD-EFGH-JK!N'])('normalizarCodigo rechaza %j', (x) => {
    expect(normalizarCodigo(x)).toBeNull();
  });

  it('formatearCodigo y normalizarCodigo son inversos', () => {
    const c = generarCodigo();
    expect(formatearCodigo(normalizarCodigo(c)!)).toBe(c);
  });

  it('hashCodigo es determinístico, hexadecimal de 64 caracteres y distingue códigos', async () => {
    const a = await hashCodigo('ABCDEFGHJKMN');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCodigo('ABCDEFGHJKMN')).toBe(a);
    expect(await hashCodigo('ABCDEFGHJKMP')).not.toBe(a);
  });
});

describe('permiso firmado', () => {
  it('firmar y verificar: ok y devuelve el payload', async () => {
    const { pub, priv } = await claves();
    const token = await firmarPermiso(payload(), priv);
    expect(token).toMatch(/^v1\.[\w-]+\.[\w-]+$/);
    const r = await verificarPermiso(token, pub, { ahora: 5_000, dispositivo: 'disp-1' });
    expect(r).toEqual({ ok: true, payload: payload() });
  });

  it('sin indicar dispositivo solo importa la firma', async () => {
    const { pub, priv } = await claves();
    const token = await firmarPermiso(payload(), priv);
    expect((await verificarPermiso(token, pub, { ahora: 5_000 })).ok).toBe(true);
  });

  it('payload alterado → firma', async () => {
    const { pub, priv } = await claves();
    const token = await firmarPermiso(payload(), priv);
    const [v, , firma] = token.split('.');
    const falso = btoa(JSON.stringify(payload({ exp: 99_999_999_999 }))).replace(/=+$/, '');
    expect(await verificarPermiso(`${v}.${falso}.${firma}`, pub, { ahora: 5_000 })).toEqual({ ok: false, motivo: 'firma' });
  });

  it('firmado con otra clave → firma', async () => {
    const a = await claves();
    const b = await claves();
    const token = await firmarPermiso(payload(), a.priv);
    expect(await verificarPermiso(token, b.pub, { ahora: 5_000 })).toEqual({ ok: false, motivo: 'firma' });
  });

  it('otro dispositivo → dispositivo', async () => {
    const { pub, priv } = await claves();
    const token = await firmarPermiso(payload(), priv);
    expect(await verificarPermiso(token, pub, { ahora: 5_000, dispositivo: 'otro' })).toEqual({ ok: false, motivo: 'dispositivo' });
  });

  it('vencido → vencido (exp <= ahora)', async () => {
    const { pub, priv } = await claves();
    const token = await firmarPermiso(payload({ exp: 6_000 }), priv);
    expect(await verificarPermiso(token, pub, { ahora: 6_000, dispositivo: 'disp-1' })).toEqual({ ok: false, motivo: 'vencido' });
    expect((await verificarPermiso(token, pub, { ahora: 5_999, dispositivo: 'disp-1' })).ok).toBe(true);
  });

  it.each(['', 'basura', 'v1.a.b', 'v2.a.b.c', 'v1..', 'v1.@@.@@', 'x'.repeat(5000)])('basura %j → formato', async (t) => {
    const { pub } = await claves();
    expect(await verificarPermiso(t, pub)).toEqual({ ok: false, motivo: 'formato' });
  });
});
