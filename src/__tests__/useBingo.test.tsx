import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBingo } from '../hooks/useBingo';
import { GAME_KEY, loadGame } from '../services/persistence';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useBingo', () => {
  it('arranca vacío en idle', () => {
    const { result } = renderHook(() => useBingo());
    expect(result.current.status).toBe('idle');
    expect(result.current.current).toBeNull();
    expect(result.current.remaining).toBe(90);
  });

  it('doble llamada rápida a draw: un solo número', () => {
    const { result } = renderHook(() => useBingo());
    let a: number | null = null;
    let b: number | null = null;
    act(() => {
      a = result.current.draw();
      b = result.current.draw();
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(result.current.drawnCount).toBe(1);
    expect(result.current.isDrawing).toBe(true);
  });

  it('el cerrojo se libera a los 700 ms con animaciones y a los 300 ms sin ellas', () => {
    const anim = renderHook(() => useBingo({ animationsEnabled: true }));
    act(() => void anim.result.current.draw());
    act(() => void vi.advanceTimersByTime(300));
    expect(anim.result.current.isDrawing).toBe(true);
    act(() => void vi.advanceTimersByTime(400));
    expect(anim.result.current.isDrawing).toBe(false);
    anim.unmount();

    localStorage.clear();
    const plain = renderHook(() => useBingo({ animationsEnabled: false }));
    act(() => void plain.result.current.draw());
    act(() => void vi.advanceTimersByTime(300));
    expect(plain.result.current.isDrawing).toBe(false);
    act(() => {
      expect(plain.result.current.draw()).not.toBeNull();
    });
  });

  it('persiste cada cambio y se recupera al remontar (recarga)', () => {
    const first = renderHook(() => useBingo({ animationsEnabled: false }));
    const drawn: number[] = [];
    for (let i = 0; i < 3; i++) {
      act(() => {
        const n = first.result.current.draw();
        if (n !== null) drawn.push(n);
      });
      act(() => void vi.advanceTimersByTime(300));
    }
    expect(loadGame().game?.draws.map((d) => d.number)).toEqual(drawn);
    first.unmount();

    const second = renderHook(() => useBingo());
    expect(second.result.current.drawnCount).toBe(3);
    expect(second.result.current.current).toBe(drawn[2]);
    expect(second.result.current.game.draws.map((d) => d.number)).toEqual(drawn);
  });

  it('undo y reset', () => {
    const { result } = renderHook(() => useBingo({ animationsEnabled: false }));
    expect(result.current.undo()).toBeNull();
    act(() => void result.current.draw());
    act(() => void vi.advanceTimersByTime(300));
    let undone: number | null = null;
    act(() => {
      undone = result.current.undo();
    });
    expect(undone).not.toBeNull();
    expect(result.current.drawnCount).toBe(0);
    act(() => void result.current.draw());
    act(() => void result.current.reset({ min: 1, max: 20 }));
    expect(result.current.drawnCount).toBe(0);
    expect(result.current.total).toBe(20);
    expect(loadGame().game?.range).toEqual({ min: 1, max: 20 });
  });

  it('no saca más cuando terminó', () => {
    const { result } = renderHook(() => useBingo({ animationsEnabled: false }));
    act(() => void result.current.reset({ min: 1, max: 5 }));
    for (let i = 0; i < 5; i++) {
      act(() => void result.current.draw());
      act(() => void vi.advanceTimersByTime(300));
    }
    expect(result.current.status).toBe('finished');
    let extra: number | null = 1;
    act(() => {
      extra = result.current.draw();
    });
    expect(extra).toBeNull();
    expect(result.current.drawnCount).toBe(5);
  });

  it('partida guardada corrupta: arranca nueva y avisa', () => {
    localStorage.setItem(GAME_KEY, '###');
    const { result } = renderHook(() => useBingo());
    expect(result.current.storageError).toBe('corrupt');
    expect(result.current.drawnCount).toBe(0);
  });

  it('esquema futuro: no se pisa lo guardado aunque se juegue', () => {
    const future = JSON.stringify({ schema: 9 });
    localStorage.setItem(GAME_KEY, future);
    const { result } = renderHook(() => useBingo());
    expect(result.current.storageError).toBe('unsupported');
    act(() => void result.current.draw());
    expect(result.current.drawnCount).toBe(1);
    expect(localStorage.getItem(GAME_KEY)).toBe(future);
  });

  it('si no se puede guardar, expone el error y sigue sorteando en memoria', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('lleno', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useBingo());
    act(() => void result.current.draw());
    expect(result.current.drawnCount).toBe(1);
    expect(result.current.storageError).toBe('quota');
    spy.mockRestore();
  });

  it('recarga el estado cuando otra pestaña lo cambia', () => {
    const { result } = renderHook(() => useBingo());
    const other = JSON.stringify({ schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 9, at: 5 }], startedAt: 5 });
    localStorage.setItem(GAME_KEY, other);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: GAME_KEY, newValue: other }));
    });
    expect(result.current.current).toBe(9);
  });
});
