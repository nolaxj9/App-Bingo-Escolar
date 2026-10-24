/** Una extracción: el número y el momento (ms desde epoch) en que salió. */
export interface DrawEntry {
  number: number;
  at: number;
}

export interface NumberRange {
  min: number;
  max: number;
}

/**
 * Estado persistible de una partida.
 * El número actual y el estado (sin empezar / en juego / terminada) se derivan
 * de `draws`, así nunca pueden quedar inconsistentes entre sí.
 */
export interface GameState {
  schema: 1;
  range: NumberRange;
  draws: DrawEntry[];
  startedAt: number | null;
}

export type GameStatus = 'idle' | 'playing' | 'finished';

export interface Settings {
  schema: 1;
  voiceEnabled: boolean;
  voiceVolume: number; // 0..1
  voiceURI: string | null; // voz elegida; null = automática
  repeatDigits: boolean; // repetir el número cifra por cifra
  soundEnabled: boolean;
  animationsEnabled: boolean;
}
