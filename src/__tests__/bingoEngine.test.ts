import { describe, expect, it } from 'vitest';
import {
  createGame, cryptoRandomInt, currentNumber, drawNumber, gameStatus, isValidGameState,
  remainingCount, remainingNumbers, totalNumbers, undoLast, validateRange,
} from '../services/bingoEngine';
import type { GameState } from '../types/bingo';

function drawAll(state: GameState, count: number): GameState {
  let s = state;
  for (let i = 0; i < count; i++) {
    const r = drawNumber(s);
    if (!r.ok) throw new Error('se esperaba poder sacar');
    s = r.state;
  }
  return s;
}

describe('motor del bingo', () => {
  it('arranca con 1-90, sin sorteos y en estado idle', () => {
    const g = createGame();
    expect(g.range).toEqual({ min: 1, max: 90 });
    expect(totalNumbers(g)).toBe(90);
    expect(gameStatus(g)).toBe('idle');
    expect(currentNumber(g)).toBeNull();
  });

  it('primer sorteo: número del rango, guarda hora y pasa a playing', () => {
    const r = drawNumber(createGame(), undefined, 1234);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.number).toBeGreaterThanOrEqual(1);
    expect(r.number).toBeLessThanOrEqual(90);
    expect(r.state.draws).toEqual([{ number: r.number, at: 1234 }]);
    expect(r.state.startedAt).toBe(1234);
    expect(gameStatus(r.state)).toBe('playing');
    expect(remainingCount(r.state)).toBe(89);
  });

  it('10 sorteos consecutivos sin repetir', () => {
    const g = drawAll(createGame(), 10);
    expect(new Set(g.draws.map((d) => d.number)).size).toBe(10);
    expect(remainingNumbers(g)).toHaveLength(80);
  });

  it('90 sorteos: sin repetidos, cubre todo el rango y termina', () => {
    const g = drawAll(createGame(), 90);
    const nums = g.draws.map((d) => d.number).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(gameStatus(g)).toBe('finished');
    expect(remainingCount(g)).toBe(0);
  });

  it('el último número que queda es el que sale', () => {
    const g = drawAll(createGame({ min: 1, max: 5 }), 4);
    const [only] = remainingNumbers(g);
    const r = drawNumber(g);
    expect(r.ok && r.number).toBe(only);
  });

  it('sacar sin números restantes devuelve finished y no cambia el estado', () => {
    const g = drawAll(createGame({ min: 1, max: 5 }), 5);
    const r = drawNumber(g);
    expect(r).toEqual({ ok: false, state: g, reason: 'finished' });
  });

  it('deshacer uno: el número vuelve a estar disponible', () => {
    const g = drawAll(createGame(), 3);
    const last = currentNumber(g)!;
    const r = undoLast(g);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.number).toBe(last);
    expect(r.state.draws).toHaveLength(2);
    expect(remainingNumbers(r.state)).toContain(last);
  });

  it('deshacer varios hasta vaciar: vuelve a idle', () => {
    let g = drawAll(createGame(), 3);
    for (let i = 0; i < 3; i++) {
      const r = undoLast(g);
      if (!r.ok) throw new Error('no debería fallar');
      g = r.state;
    }
    expect(gameStatus(g)).toBe('idle');
    expect(g.startedAt).toBeNull();
  });

  it('deshacer desde terminado vuelve a playing', () => {
    const g = drawAll(createGame({ min: 1, max: 5 }), 5);
    const r = undoLast(g);
    expect(r.ok && gameStatus(r.state)).toBe('playing');
  });

  it('deshacer sin sorteos devuelve empty', () => {
    const g = createGame();
    expect(undoLast(g)).toEqual({ ok: false, state: g, reason: 'empty' });
  });

  it('reinicio: una partida nueva está vacía y admite otro rango', () => {
    const g = createGame({ min: 10, max: 40 });
    expect(g.draws).toEqual([]);
    expect(totalNumbers(g)).toBe(31);
  });

  it('drawNumber y undoLast no mutan la entrada', () => {
    const g = createGame();
    const snapshot = JSON.stringify(g);
    const r = drawNumber(g);
    expect(JSON.stringify(g)).toBe(snapshot);
    if (r.ok) {
      const before = JSON.stringify(r.state);
      undoLast(r.state);
      expect(JSON.stringify(r.state)).toBe(before);
    }
  });

  it('usa el generador inyectado entre los restantes', () => {
    const r = drawNumber(createGame({ min: 1, max: 10 }), () => 0);
    expect(r.ok && r.number).toBe(1);
  });
});

describe('validateRange', () => {
  it('acepta rangos válidos', () => {
    expect(validateRange({ min: 1, max: 90 })).toBeNull();
    expect(validateRange({ min: 1, max: 5 })).toBeNull();
    expect(validateRange({ min: 1, max: 300 })).toBeNull();
    expect(validateRange({ min: 700, max: 999 })).toBeNull();
  });
  it.each([
    [{ min: 1.5, max: 90 }, 'enteros'],
    [{ min: 1, max: NaN }, 'enteros'],
    [{ min: 0, max: 90 }, 'inicial'],
    [{ min: -3, max: 90 }, 'inicial'],
    [{ min: 1, max: 1000 }, 'no puede ser mayor'],
    [{ min: 50, max: 50 }, 'mayor que el inicial'],
    [{ min: 60, max: 10 }, 'mayor que el inicial'],
    [{ min: 1, max: 4 }, 'al menos'],
    [{ min: 1, max: 301 }, 'más de'],
  ])('rechaza %j con mensaje en español', (range, fragment) => {
    expect(validateRange(range)).toContain(fragment);
  });
  it('createGame lanza RangeError con rango inválido', () => {
    expect(() => createGame({ min: 5, max: 1 })).toThrow(RangeError);
  });
});

describe('isValidGameState', () => {
  const ok = (): GameState => ({ schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 5, at: 1 }], startedAt: 1 });
  it('acepta una partida íntegra', () => expect(isValidGameState(ok())).toBe(true));
  it('rechaza repetidos', () => {
    const g = ok();
    g.draws.push({ number: 5, at: 2 });
    expect(isValidGameState(g)).toBe(false);
  });
  it('rechaza números fuera de rango o no enteros', () => {
    expect(isValidGameState({ ...ok(), draws: [{ number: 91, at: 1 }] })).toBe(false);
    expect(isValidGameState({ ...ok(), draws: [{ number: 2.5, at: 1 }] })).toBe(false);
  });
  it('rechaza at no finito, schema desconocido, rango inválido y basura', () => {
    expect(isValidGameState({ ...ok(), draws: [{ number: 1, at: NaN }] })).toBe(false);
    expect(isValidGameState({ ...ok(), schema: 2 })).toBe(false);
    expect(isValidGameState({ ...ok(), range: { min: 5, max: 1 } })).toBe(false);
    expect(isValidGameState(null)).toBe(false);
    expect(isValidGameState('x')).toBe(false);
  });
});

describe('cryptoRandomInt', () => {
  it('queda en [0, n) y rechaza n inválido', () => {
    for (let i = 0; i < 500; i++) {
      const v = cryptoRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    expect(() => cryptoRandomInt(0)).toThrow(RangeError);
    expect(() => cryptoRandomInt(1.5)).toThrow(RangeError);
  });
  it('es aproximadamente uniforme (chi-cuadrado laxo)', () => {
    const n = 10;
    const samples = 20000;
    const counts = new Array(n).fill(0);
    for (let i = 0; i < samples; i++) counts[cryptoRandomInt(n)]++;
    const expected = samples / n;
    const chi = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    // Valor crítico (9 gl) al 0,001 ≈ 27,9: umbral holgado para que no haya falsos positivos.
    expect(chi).toBeLessThan(40);
  });
});
