import type { GameState, Settings } from '../types/bingo';
import { isValidGameState } from './bingoEngine';

export const GAME_KEY = 'bingo-escolar:game';
export const SETTINGS_KEY = 'bingo-escolar:settings';
export const CURRENT_SCHEMA = 1;
/** Una partida válida ocupa < 20 KB; más que esto no se copia entero. */
const MAX_BACKUP_CHARS = 100_000;

export type StorageError = 'unavailable' | 'quota' | 'corrupt' | 'unsupported';

export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  voiceEnabled: true,
  voiceVolume: 1,
  voiceURI: null,
  soundEnabled: true,
  animationsEnabled: true,
};

/** Clasifica una excepción de localStorage: cuota llena o almacenamiento no disponible. */
function classify(err: unknown): StorageError {
  const e = err as { name?: string; code?: number } | null;
  if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014)) {
    return 'quota';
  }
  return 'unavailable';
}

/** Prueba que se pueda escribir y borrar. Nunca lanza. */
export function isStorageAvailable(): boolean {
  try {
    const k = 'bingo-escolar:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * Punto de extensión para migraciones de esquema: hoy solo existe el esquema 1.
 * Una versión futura debe convertir explícitamente el valor viejo; nunca descartarlo.
 */
export function migrate(raw: unknown): unknown {
  return raw;
}

export interface LoadGameResult {
  game: GameState | null;
  error: StorageError | null;
}

export function loadGame(): LoadGameResult {
  let text: string | null;
  try {
    text = localStorage.getItem(GAME_KEY);
  } catch {
    return { game: null, error: 'unavailable' };
  }
  if (text === null) return { game: null, error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  // Versión futura: no se toca ni se pisa; la app arranca en memoria.
  const schema = (parsed as { schema?: unknown } | null | undefined)?.schema;
  if (typeof schema === 'number' && schema > CURRENT_SCHEMA) return { game: null, error: 'unsupported' };

  const migrated = parsed === undefined ? undefined : migrate(parsed);
  if (isValidGameState(migrated)) return { game: migrated, error: null };

  // Dañado: se conserva una copia del valor crudo para no perder nada.
  // Solo la más reciente, para que copias repetidas no llenen el almacenamiento.
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(`${GAME_KEY}:corrupt-`)) localStorage.removeItem(k);
    localStorage.setItem(`${GAME_KEY}:corrupt-${Date.now()}`, text.slice(0, MAX_BACKUP_CHARS));
  } catch {
    /* sin lugar para la copia: se sigue igual */
  }
  return { game: null, error: 'corrupt' };
}

export function saveGame(state: GameState): StorageError | null {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(state));
    return null;
  } catch (err) {
    return classify(err);
  }
}

export function clearGame(): StorageError | null {
  try {
    localStorage.removeItem(GAME_KEY);
    return null;
  } catch (err) {
    return classify(err);
  }
}

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Fusiona con los valores por defecto y sanea cada campo. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const vol = typeof r.voiceVolume === 'number' && Number.isFinite(r.voiceVolume) ? r.voiceVolume : DEFAULT_SETTINGS.voiceVolume;
  return {
    schema: 1,
    voiceEnabled: bool(r.voiceEnabled, DEFAULT_SETTINGS.voiceEnabled),
    voiceVolume: Math.min(1, Math.max(0, vol)),
    voiceURI: typeof r.voiceURI === 'string' && r.voiceURI.length < 500 ? r.voiceURI : null,
    soundEnabled: bool(r.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    animationsEnabled: bool(r.animationsEnabled, DEFAULT_SETTINGS.animationsEnabled),
  };
}

export function loadSettings(): Settings {
  try {
    const text = localStorage.getItem(SETTINGS_KEY);
    if (text === null) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): StorageError | null {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return null;
  } catch (err) {
    return classify(err);
  }
}

/** Mensaje comprensible para cada error de almacenamiento. */
export function storageErrorMessage(error: StorageError): string {
  switch (error) {
    case 'unavailable':
      return 'No se puede guardar en este dispositivo (¿modo incógnito?). La partida funciona, pero se pierde si cerrás la página.';
    case 'quota':
      return 'No hay lugar para guardar la partida en este dispositivo. Seguí jugando, pero liberá espacio: si cerrás la página se pierde.';
    case 'corrupt':
      return 'La partida guardada estaba dañada, así que empezamos una nueva. Guardamos una copia del dato por si hace falta.';
    case 'unsupported':
      return 'La partida guardada es de una versión más nueva de la app. No la tocamos: esta partida se juega sin guardarse.';
  }
}
