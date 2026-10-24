import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGame, DEFAULT_SETTINGS, GAME_KEY, isStorageAvailable, loadGame, loadSettings, sanitizeSettings,
  saveGame, saveSettings, SETTINGS_KEY, storageErrorMessage,
} from '../services/persistence';
import { createGame, drawNumber, isValidGameState } from '../services/bingoEngine';

function played() {
  const r = drawNumber(createGame());
  if (!r.ok) throw new Error('x');
  return r.state;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('persistencia de la partida', () => {
  it('ida y vuelta', () => {
    const g = played();
    expect(saveGame(g)).toBeNull();
    expect(loadGame()).toEqual({ game: g, error: null });
  });

  it('sin nada guardado: game null y sin error', () => {
    expect(loadGame()).toEqual({ game: null, error: null });
  });

  it('clearGame borra la partida', () => {
    saveGame(played());
    expect(clearGame()).toBeNull();
    expect(loadGame().game).toBeNull();
  });

  it('JSON corrupto: guarda copia corrupt-*, devuelve null y error corrupt', () => {
    localStorage.setItem(GAME_KEY, '{no es json');
    expect(loadGame()).toEqual({ game: null, error: 'corrupt' });
    const copies = Object.keys(localStorage).filter((k) => k.startsWith(`${GAME_KEY}:corrupt-`));
    expect(copies).toHaveLength(1);
    expect(localStorage.getItem(copies[0])).toBe('{no es json');
  });

  it('cargas dañadas repetidas: queda una sola copia y con tamaño acotado', () => {
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i < 5; i++) {
      now.mockReturnValue(1000 + i);
      localStorage.setItem(GAME_KEY, 'x'.repeat(200_000));
      expect(loadGame().error).toBe('corrupt');
    }
    now.mockRestore();
    const copies = Object.keys(localStorage).filter((k) => k.startsWith(`${GAME_KEY}:corrupt-`));
    expect(copies).toEqual([`${GAME_KEY}:corrupt-1004`]);
    expect(localStorage.getItem(copies[0])!.length).toBe(100_000);
  });

  it('valores con tipos o números raros se rechazan (NaN, Infinity, decimales, fuera de rango)', () => {
    const base = { schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 3, at: 1 }], startedAt: 1 };
    const cases = [
      { ...base, startedAt: 'ayer' },
      { ...base, draws: [{ number: 3.5, at: 1 }] },
      { ...base, draws: [{ number: 91, at: 1 }] },
      { ...base, draws: [{ number: '3', at: 1 }] },
      { ...base, range: { min: 1, max: 100000 } },
      { ...base, draws: [{ number: 3, at: null }] },
      { ...base, draws: 'muchos' },
    ];
    for (const c of cases) {
      localStorage.setItem(GAME_KEY, JSON.stringify(c));
      expect(loadGame().game).toBeNull();
    }
    // Un "__proto__" dentro del JSON guardado no contamina los objetos de la app.
    localStorage.setItem(GAME_KEY, JSON.stringify(base).replace('{', '{"__proto__":{"contaminado":true},'));
    loadGame();
    expect(({} as Record<string, unknown>).contaminado).toBeUndefined();
    // JSON no admite NaN/Infinity: se prueba directo contra el validador.
    expect(isValidGameState({ ...base, startedAt: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidGameState({ ...base, draws: [{ number: 3, at: Number.NaN }] })).toBe(false);
  });

  it('JSON válido pero partida inconsistente (repetidos): corrupt', () => {
    const bad = { schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 3, at: 1 }, { number: 3, at: 2 }], startedAt: 1 };
    localStorage.setItem(GAME_KEY, JSON.stringify(bad));
    expect(loadGame().error).toBe('corrupt');
  });

  it('esquema futuro: unsupported y no se pisa el valor guardado', () => {
    const future = JSON.stringify({ schema: 2, cosas: 'nuevas' });
    localStorage.setItem(GAME_KEY, future);
    expect(loadGame()).toEqual({ game: null, error: 'unsupported' });
    expect(localStorage.getItem(GAME_KEY)).toBe(future);
  });

  it('setItem que lanza QuotaExceededError: quota', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('lleno', 'QuotaExceededError');
    });
    expect(saveGame(played())).toBe('quota');
    expect(saveSettings(DEFAULT_SETTINGS)).toBe('quota');
  });

  it('localStorage que lanza al acceder: unavailable (sin romper)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('bloqueado', 'SecurityError');
    });
    expect(loadGame()).toEqual({ game: null, error: 'unavailable' });
    expect(saveGame(played())).toBe('unavailable');
    expect(isStorageAvailable()).toBe(false);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('isStorageAvailable es true cuando funciona y no deja residuos', () => {
    expect(isStorageAvailable()).toBe(true);
    expect(localStorage.length).toBe(0);
  });

  it('todos los errores tienen mensaje comprensible', () => {
    for (const e of ['unavailable', 'quota', 'corrupt', 'unsupported'] as const) {
      expect(storageErrorMessage(e).length).toBeGreaterThan(20);
    }
  });
});

describe('ajustes', () => {
  it('por defecto: voz, sonido y animaciones activados, volumen 1', () => {
    expect(loadSettings()).toEqual({ schema: 1, voiceEnabled: true, voiceVolume: 1, voiceURI: null, repeatDigits: true, soundEnabled: true, animationsEnabled: true });
  });
  it('ida y vuelta', () => {
    const s = { ...DEFAULT_SETTINGS, voiceEnabled: false, voiceVolume: 0.4, voiceURI: 'x', soundEnabled: false };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });
  it('sanea valores inválidos y fusiona con defaults', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voiceEnabled: 'sí', voiceVolume: 7, voiceURI: 5, soundEnabled: false }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, voiceVolume: 1, soundEnabled: false });
    expect(sanitizeSettings({ voiceVolume: -2 }).voiceVolume).toBe(0);
    expect(sanitizeSettings({ voiceVolume: NaN }).voiceVolume).toBe(1);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ voiceEnabled: false, voiceVolume: 0.5 }).repeatDigits).toBe(true);
    expect(sanitizeSettings({ repeatDigits: false }).repeatDigits).toBe(false);
    expect(sanitizeSettings({ repeatDigits: 'no' }).repeatDigits).toBe(true);
  });
  it('JSON roto de ajustes: vuelve a los valores por defecto', () => {
    localStorage.setItem(SETTINGS_KEY, '}{');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
