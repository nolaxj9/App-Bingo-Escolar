import type { DrawEntry, GameState, GameStatus, NumberRange } from '../types/bingo';

export const DEFAULT_RANGE: NumberRange = { min: 1, max: 90 };
export const RANGE_LIMITS = { min: 1, max: 999, minSize: 5, maxSize: 300 } as const;

/** Devuelve un entero aleatorio uniforme en [0, n). */
export type RandomInt = (n: number) => number;

/**
 * Generador basado en crypto.getRandomValues con muestreo por rechazo,
 * para que ningún número quede favorecido (sin sesgo de módulo).
 */
export const cryptoRandomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('n debe ser un entero positivo');
  const c = globalThis.crypto;
  if (!c?.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    c.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
};

/** Valida un rango. Devuelve un mensaje de error comprensible o null si es válido. */
export function validateRange(range: NumberRange): string | null {
  const { min, max } = range;
  if (!Number.isInteger(min) || !Number.isInteger(max)) return 'Los números del rango tienen que ser enteros.';
  if (min < RANGE_LIMITS.min) return `El número inicial tiene que ser ${RANGE_LIMITS.min} o más.`;
  if (max > RANGE_LIMITS.max) return `El número final no puede ser mayor que ${RANGE_LIMITS.max}.`;
  if (max <= min) return 'El número final tiene que ser mayor que el inicial.';
  const size = max - min + 1;
  if (size < RANGE_LIMITS.minSize) return `El rango tiene que tener al menos ${RANGE_LIMITS.minSize} números.`;
  if (size > RANGE_LIMITS.maxSize) return `El rango no puede tener más de ${RANGE_LIMITS.maxSize} números.`;
  return null;
}

export function createGame(range: NumberRange = DEFAULT_RANGE): GameState {
  const error = validateRange(range);
  if (error) throw new RangeError(error);
  return { schema: 1, range: { ...range }, draws: [], startedAt: null };
}

export function totalNumbers(state: GameState): number {
  return state.range.max - state.range.min + 1;
}

export function remainingCount(state: GameState): number {
  return totalNumbers(state) - state.draws.length;
}

export function remainingNumbers(state: GameState): number[] {
  const drawn = new Set(state.draws.map((d) => d.number));
  const out: number[] = [];
  for (let n = state.range.min; n <= state.range.max; n++) if (!drawn.has(n)) out.push(n);
  return out;
}

export function currentNumber(state: GameState): number | null {
  return state.draws.length ? state.draws[state.draws.length - 1].number : null;
}

export function gameStatus(state: GameState): GameStatus {
  if (state.draws.length === 0) return 'idle';
  return remainingCount(state) === 0 ? 'finished' : 'playing';
}

export type DrawResult =
  | { ok: true; state: GameState; number: number }
  | { ok: false; state: GameState; reason: 'finished' };

/** Saca un número que todavía no salió. Nunca modifica el estado recibido. */
export function drawNumber(state: GameState, random: RandomInt = cryptoRandomInt, now = Date.now()): DrawResult {
  const pool = remainingNumbers(state);
  if (pool.length === 0) return { ok: false, state, reason: 'finished' };
  const number = pool[random(pool.length)];
  const entry: DrawEntry = { number, at: now };
  return {
    ok: true,
    number,
    state: { ...state, draws: [...state.draws, entry], startedAt: state.startedAt ?? now },
  };
}

export type UndoResult =
  | { ok: true; state: GameState; number: number }
  | { ok: false; state: GameState; reason: 'empty' };

/** Deshace la última extracción: el número vuelve a estar disponible. */
export function undoLast(state: GameState): UndoResult {
  if (state.draws.length === 0) return { ok: false, state, reason: 'empty' };
  const last = state.draws[state.draws.length - 1];
  const draws = state.draws.slice(0, -1);
  return {
    ok: true,
    number: last.number,
    state: { ...state, draws, startedAt: draws.length ? state.startedAt : null },
  };
}

/**
 * Revisa que un objeto (por ejemplo, leído del almacenamiento) sea una partida
 * íntegra: rango válido, números dentro del rango, sin repetidos.
 */
export function isValidGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GameState>;
  if (v.schema !== 1 || !v.range || !Array.isArray(v.draws)) return false;
  if (validateRange(v.range) !== null) return false;
  if (v.startedAt !== null && typeof v.startedAt !== 'number') return false;
  const seen = new Set<number>();
  for (const d of v.draws) {
    if (!d || typeof d !== 'object') return false;
    if (!Number.isInteger(d.number) || d.number < v.range.min || d.number > v.range.max) return false;
    if (typeof d.at !== 'number' || !Number.isFinite(d.at)) return false;
    if (seen.has(d.number)) return false;
    seen.add(d.number);
  }
  return true;
}
