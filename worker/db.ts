// Esquema D1 (se crea solo) y consultas. Tiempos en ms desde epoch.
import type { Ajustes, LicenciaAdmin } from '../src/shared/licencia';
import type { D1Database } from './d1';

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS licencias (
    id TEXT PRIMARY KEY, entidad TEXT NOT NULL, contacto TEXT NOT NULL DEFAULT '', notas TEXT NOT NULL DEFAULT '',
    codigo_hash TEXT NOT NULL UNIQUE, codigo_final TEXT NOT NULL, creada INTEGER NOT NULL, vence INTEGER NOT NULL,
    max_dispositivos INTEGER NOT NULL, revocada INTEGER, monto_ars INTEGER)`,
  `CREATE TABLE IF NOT EXISTS dispositivos (
    licencia_id TEXT NOT NULL, dispositivo TEXT NOT NULL, primera INTEGER NOT NULL, ultima INTEGER NOT NULL,
    PRIMARY KEY (licencia_id, dispositivo))`,
  `CREATE TABLE IF NOT EXISTS intentos (clave TEXT PRIMARY KEY, ventana INTEGER NOT NULL, cantidad INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)`,
];

// Una sola vez por base y por isolate; si falla se reintenta en el próximo pedido.
const esquemas = new WeakMap<D1Database, Promise<void>>();

export function asegurarEsquema(db: D1Database): Promise<void> {
  let p = esquemas.get(db);
  if (!p) {
    p = db.batch(ESQUEMA.map((s) => db.prepare(s))).then(() => undefined);
    esquemas.set(db, p);
    p.catch(() => esquemas.delete(db));
  }
  return p;
}

export interface FilaLicencia {
  id: string;
  entidad: string;
  contacto: string;
  notas: string;
  codigo_hash: string;
  codigo_final: string;
  creada: number;
  vence: number;
  max_dispositivos: number;
  revocada: number | null;
  monto_ars: number | null;
}

const COLUMNAS = `l.id, l.entidad, l.contacto, l.notas, l.codigo_hash, l.codigo_final, l.creada, l.vence,
  l.max_dispositivos, l.revocada, l.monto_ars`;

export function licenciaPorHash(db: D1Database, hash: string) {
  return db.prepare(`SELECT ${COLUMNAS} FROM licencias l WHERE l.codigo_hash = ?`).bind(hash).first<FilaLicencia>();
}

export function licenciaPorId(db: D1Database, id: string) {
  return db.prepare(`SELECT ${COLUMNAS} FROM licencias l WHERE l.id = ?`).bind(id).first<FilaLicencia>();
}

export async function dispositivosUsados(db: D1Database, licenciaId: string): Promise<number> {
  const f = await db
    .prepare('SELECT COUNT(*) AS n FROM dispositivos WHERE licencia_id = ?')
    .bind(licenciaId)
    .first<{ n: number }>();
  return f?.n ?? 0;
}

export async function dispositivoRegistrado(db: D1Database, licenciaId: string, dispositivo: string) {
  const f = await db
    .prepare('SELECT 1 AS x FROM dispositivos WHERE licencia_id = ? AND dispositivo = ?')
    .bind(licenciaId, dispositivo)
    .first();
  return !!f;
}

export async function tocarDispositivo(db: D1Database, licenciaId: string, dispositivo: string, ahora: number) {
  await db
    .prepare('UPDATE dispositivos SET ultima = ? WHERE licencia_id = ? AND dispositivo = ?')
    .bind(ahora, licenciaId, dispositivo)
    .run();
}

/**
 * Registra el dispositivo si todavía hay lugar (el control y el alta son una sola sentencia).
 * true si quedó registrado (nuevo o ya existente), false si se llegó al máximo.
 */
export async function registrarDispositivo(db: D1Database, lic: FilaLicencia, dispositivo: string, ahora: number) {
  if (await dispositivoRegistrado(db, lic.id, dispositivo)) {
    await tocarDispositivo(db, lic.id, dispositivo, ahora);
    return true;
  }
  const r = await db
    .prepare(
      `INSERT OR IGNORE INTO dispositivos (licencia_id, dispositivo, primera, ultima)
       SELECT ?1, ?2, ?3, ?3 WHERE (SELECT COUNT(*) FROM dispositivos WHERE licencia_id = ?1) < ?4`,
    )
    .bind(lic.id, dispositivo, ahora, lic.max_dispositivos)
    .run();
  if (r.meta.changes > 0) return true;
  return dispositivoRegistrado(db, lic.id, dispositivo);
}

function mapear(f: FilaLicencia, usados: number, ahora: number): LicenciaAdmin {
  return {
    id: f.id,
    entidad: f.entidad,
    contacto: f.contacto,
    notas: f.notas,
    codigoFinal: f.codigo_final,
    creada: f.creada,
    vence: f.vence,
    maxDispositivos: f.max_dispositivos,
    dispositivosUsados: usados,
    revocada: f.revocada,
    montoArs: f.monto_ars,
    estado: f.revocada != null ? 'revocada' : f.vence <= ahora ? 'vencida' : 'activa',
  };
}

export async function aLicenciaAdmin(db: D1Database, f: FilaLicencia, ahora: number): Promise<LicenciaAdmin> {
  return mapear(f, await dispositivosUsados(db, f.id), ahora);
}

export async function listarLicencias(db: D1Database, ahora: number): Promise<LicenciaAdmin[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNAS} FROM licencias l ORDER BY l.creada DESC, l.rowid DESC`)
    .all<FilaLicencia>();
  const { results: cuentas } = await db
    .prepare('SELECT licencia_id, COUNT(*) AS n FROM dispositivos GROUP BY licencia_id')
    .all<{ licencia_id: string; n: number }>();
  const usados = new Map(cuentas.map((c) => [c.licencia_id, c.n]));
  return results.map((f) => mapear(f, usados.get(f.id) ?? 0, ahora));
}

export interface NuevaLicencia {
  id: string;
  entidad: string;
  contacto: string;
  notas: string;
  codigoHash: string;
  codigoFinal: string;
  creada: number;
  vence: number;
  maxDispositivos: number;
  montoArs: number | null;
}

export async function insertarLicencia(db: D1Database, n: NuevaLicencia) {
  await db
    .prepare(
      `INSERT INTO licencias (id, entidad, contacto, notas, codigo_hash, codigo_final, creada, vence, max_dispositivos, revocada, monto_ars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(n.id, n.entidad, n.contacto, n.notas, n.codigoHash, n.codigoFinal, n.creada, n.vence, n.maxDispositivos, n.montoArs)
    .run();
}

export async function cambiarVence(db: D1Database, id: string, vence: number) {
  await db.prepare('UPDATE licencias SET vence = ? WHERE id = ?').bind(vence, id).run();
}

export async function cambiarRevocada(db: D1Database, id: string, revocada: number | null) {
  await db.prepare('UPDATE licencias SET revocada = ? WHERE id = ?').bind(revocada, id).run();
}

export async function liberarDispositivos(db: D1Database, id: string) {
  await db.prepare('DELETE FROM dispositivos WHERE licencia_id = ?').bind(id).run();
}

export async function cambiarCodigo(db: D1Database, id: string, hash: string, final: string) {
  await db.prepare('UPDATE licencias SET codigo_hash = ?, codigo_final = ? WHERE id = ?').bind(hash, final, id).run();
}

// ---------------------------------------------------------------- ajustes

const AJUSTES_BASE: Ajustes = { precioArs: null, comoComprar: '', whatsapp: null };

export async function leerAjustes(db: D1Database): Promise<Ajustes> {
  const { results } = await db.prepare('SELECT clave, valor FROM ajustes').all<{ clave: string; valor: string }>();
  const out: Ajustes = { ...AJUSTES_BASE };
  for (const { clave, valor } of results) {
    try {
      const v: unknown = JSON.parse(valor);
      if (clave === 'precioArs' && (v === null || typeof v === 'number')) out.precioArs = v;
      else if (clave === 'comoComprar' && typeof v === 'string') out.comoComprar = v;
      else if (clave === 'whatsapp' && (v === null || typeof v === 'string')) out.whatsapp = v;
    } catch {
      // valor ilegible: queda el predeterminado
    }
  }
  return out;
}

export async function guardarAjustes(db: D1Database, a: Ajustes) {
  const upsert = 'INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor';
  await db.batch(
    (Object.keys(a) as (keyof Ajustes)[]).map((k) => db.prepare(upsert).bind(k, JSON.stringify(a[k]))),
  );
}
