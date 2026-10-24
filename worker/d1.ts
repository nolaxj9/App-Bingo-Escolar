// Tipos mínimos de Cloudflare D1 (sin depender de @cloudflare/workers-types).

export interface D1Resultado<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...valores: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Resultado<T>>;
  run(): Promise<D1Resultado>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(sentencias: D1PreparedStatement[]): Promise<D1Resultado[]>;
}

/** Lo único que usa el Worker del binding de assets. */
export interface Assets {
  fetch(request: Request): Promise<Response>;
}
