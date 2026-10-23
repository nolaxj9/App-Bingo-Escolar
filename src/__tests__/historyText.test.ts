import { describe, expect, it } from 'vitest';
import { buildHistoryText, formatTime } from '../services/historyText';
import { BALL_COLORS, ballColor } from '../services/ballColor';
import { createGame } from '../services/bingoEngine';

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

describe('historyText', () => {
  it('lista los números en orden de extracción con su hora', () => {
    const g = createGame();
    g.draws = [{ number: 42, at: new Date(2026, 4, 12, 10, 31, 2).getTime() }, { number: 7, at: new Date(2026, 4, 12, 10, 31, 20).getTime() }];
    g.startedAt = g.draws[0].at;
    const text = buildHistoryText(g);
    expect(text).toContain('Bingo Escolar - 12/05/2026');
    expect(text).toContain('Sorteados: 2 de 90');
    expect(text).toContain('1. 42 (10:31:02)');
    expect(text).toContain('2. 7 (10:31:20)');
    expect(text).toContain('Orden de salida: 42, 7');
    expect(text.split('\n').at(-1)).toBe('Bingo Escolar · by Código Austral 2026');
  });
  it('sin sorteos lo dice', () => {
    const t = buildHistoryText(createGame());
    expect(t).toContain('Todavía no salió ningún número.');
    expect(t.endsWith('Bingo Escolar · by Código Austral 2026')).toBe(true);
  });
  it('formatTime usa HH:MM:SS', () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 5, 3).getTime())).toBe('09:05:03');
  });
});

describe('ballColor', () => {
  it('cada color tiene contraste >= 4.5 con texto blanco', () => {
    for (const c of BALL_COLORS) expect(1.05 / (luminance(c) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  it('agrupa por decena', () => {
    expect(ballColor(1)).toBe(ballColor(10));
    expect(ballColor(10)).not.toBe(ballColor(11));
    expect(ballColor(90)).toBe(BALL_COLORS[8]);
  });
});
