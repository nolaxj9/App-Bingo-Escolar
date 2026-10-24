// D1 falso sobre node:sqlite (en memoria) para probar el Worker sin Cloudflare.
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Resultado } from '../d1';

class Sentencia implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly valores: SQLInputValue[] = [],
  ) {}

  bind(...valores: unknown[]): D1PreparedStatement {
    return new Sentencia(this.db, this.sql, valores as SQLInputValue[]);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.valores) as T | undefined) ?? null;
  }

  async all<T>(): Promise<D1Resultado<T>> {
    const results = this.db.prepare(this.sql).all(...this.valores) as T[];
    return { results, success: true, meta: { changes: 0 } };
  }

  async run(): Promise<D1Resultado> {
    const r = this.db.prepare(this.sql).run(...this.valores);
    return { results: [], success: true, meta: { changes: Number(r.changes) } };
  }
}

export interface FakeD1 extends D1Database {
  /** Acceso directo a SQLite para preparar o inspeccionar datos en las pruebas. */
  sqlite: DatabaseSync;
}

export function crearFakeD1(): FakeD1 {
  const sqlite = new DatabaseSync(':memory:');
  return {
    sqlite,
    prepare: (sql) => new Sentencia(sqlite, sql),
    async batch(sentencias) {
      const out: D1Resultado[] = [];
      sqlite.exec('BEGIN');
      try {
        for (const s of sentencias) out.push(await s.run());
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
      return out;
    },
  };
}
