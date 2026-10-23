import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, GameStatus, NumberRange } from '../types/bingo';
import { createGame, currentNumber, drawNumber, gameStatus, remainingCount, totalNumbers, undoLast } from '../services/bingoEngine';
import { GAME_KEY, loadGame, saveGame, type StorageError } from '../services/persistence';

export interface UseBingoOptions {
  animationsEnabled?: boolean;
}

export interface UseBingo {
  game: GameState;
  status: GameStatus;
  current: number | null;
  drawnCount: number;
  remaining: number;
  total: number;
  lastDrawnAt: number | null;
  draw: () => number | null;
  undo: () => number | null;
  reset: (range?: NumberRange) => void;
  isDrawing: boolean;
  storageError: StorageError | null;
}

const LOCK_MS_ANIMATED = 700;
const LOCK_MS_PLAIN = 300;

function initialState(): { game: GameState; error: StorageError | null } {
  const { game, error } = loadGame();
  return { game: game ?? createGame(), error };
}

export function useBingo({ animationsEnabled = true }: UseBingoOptions = {}): UseBingo {
  const [init] = useState(initialState);
  const [game, setGame] = useState<GameState>(init.game);
  const [storageError, setStorageError] = useState<StorageError | null>(init.error);
  const [isDrawing, setIsDrawing] = useState(false);

  // El estado "de verdad" vive en la ref: dos llamadas seguidas antes de renderizar ven lo mismo.
  const gameRef = useRef(init.game);
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Si lo guardado es de una versión futura no se pisa nunca.
  const readOnly = useRef(init.error === 'unsupported');

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
    if (readOnly.current) return;
    const err = saveGame(next);
    // El aviso refleja el último intento de guardado (uno exitoso lo limpia).
    setStorageError(err);
  }, []);

  const draw = useCallback((): number | null => {
    if (lock.current) return null;
    const result = drawNumber(gameRef.current);
    if (!result.ok) return null;
    lock.current = true;
    setIsDrawing(true);
    commit(result.state);
    timer.current = setTimeout(
      () => {
        lock.current = false;
        setIsDrawing(false);
      },
      animationsEnabled ? LOCK_MS_ANIMATED : LOCK_MS_PLAIN,
    );
    return result.number;
  }, [animationsEnabled, commit]);

  const undo = useCallback((): number | null => {
    const result = undoLast(gameRef.current);
    if (!result.ok) return null;
    commit(result.state);
    return result.number;
  }, [commit]);

  const reset = useCallback(
    (range?: NumberRange) => {
      commit(createGame(range ?? gameRef.current.range));
    },
    [commit],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Otra pestaña (por ejemplo, un proyector en la misma PC) cambió la partida.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== GAME_KEY || e.newValue === null || readOnly.current) return;
      const { game: loaded } = loadGame();
      if (loaded) {
        gameRef.current = loaded;
        setGame(loaded);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return useMemo(
    () => ({
      game,
      status: gameStatus(game),
      current: currentNumber(game),
      drawnCount: game.draws.length,
      remaining: remainingCount(game),
      total: totalNumbers(game),
      lastDrawnAt: game.draws.length ? game.draws[game.draws.length - 1].at : null,
      draw,
      undo,
      reset,
      isDrawing,
      storageError,
    }),
    [game, draw, undo, reset, isDrawing, storageError],
  );
}
