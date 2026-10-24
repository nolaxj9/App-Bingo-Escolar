import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickSpanishVoices, useSpeech } from '../hooks/useSpeech';

const voice = (name: string, lang: string) => ({ name, lang, voiceURI: name, default: false, localService: true }) as SpeechSynthesisVoice;

function install(voices: SpeechSynthesisVoice[]) {
  const spoken: Array<{ text: string; lang: string; voice: unknown; volume: number }> = [];
  const listeners: Record<string, () => void> = {};
  let current = voices;
  class Utter {
    text: string;
    lang = '';
    voice: unknown = null;
    volume = 1;
    rate = 1;
    constructor(t: string) {
      this.text = t;
    }
  }
  const synth = {
    speak: vi.fn((u: Utter) => spoken.push({ text: u.text, lang: u.lang, voice: u.voice, volume: u.volume })),
    cancel: vi.fn(),
    getVoices: () => current,
    addEventListener: (n: string, cb: () => void) => (listeners[n] = cb),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utter, configurable: true, writable: true });
  return { spoken, synth, setVoices: (v: SpeechSynthesisVoice[]) => (current = v), fire: () => listeners.voiceschanged?.() };
}

afterEach(() => {
  // @ts-expect-error: limpieza del simulacro
  delete window.speechSynthesis;
  // @ts-expect-error: idem
  delete window.SpeechSynthesisUtterance;
});

describe('useSpeech', () => {
  it('ordena las voces en español con es-AR primero y descarta otros idiomas', () => {
    const list = [voice('Inglés', 'en-US'), voice('España', 'es-ES'), voice('México', 'es_MX'), voice('Argentina', 'es-AR')];
    expect(pickSpanishVoices(list).map((v) => v.name)).toEqual(['Argentina', 'México', 'España']);
  });

  it('elige la mejor voz en español y respeta volumen y texto', () => {
    const env = install([voice('Inglés', 'en-US'), voice('España', 'es-ES'), voice('Argentina', 'es-AR')]);
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 0.5, voiceURI: null }));
    act(() => result.current.announce(42));
    expect(env.spoken[0]).toMatchObject({ text: '¡Salió el número cuarenta y dos! Cuatro, dos.', lang: 'es-AR', volume: 0.5 });
    expect((env.spoken[0].voice as SpeechSynthesisVoice).name).toBe('Argentina');
    expect(env.synth.cancel).toHaveBeenCalled();
  });

  it('respeta la voz elegida si existe', () => {
    const env = install([voice('Argentina', 'es-AR'), voice('España', 'es-ES')]);
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 1, voiceURI: 'España' }));
    act(() => result.current.announce(7));
    expect((env.spoken[0].voice as SpeechSynthesisVoice).name).toBe('España');
  });

  it('sin voces en español usa lang es-AR sin voz explícita', () => {
    const env = install([voice('Inglés', 'en-US')]);
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 1, voiceURI: null }));
    expect(result.current.spanishVoices).toHaveLength(0);
    act(() => result.current.announce(1));
    expect(env.spoken[0]).toMatchObject({ lang: 'es-AR', voice: null });
  });

  it('carga las voces cuando llega voiceschanged (Android)', () => {
    const env = install([]);
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 1, voiceURI: null }));
    expect(result.current.spanishVoices).toHaveLength(0);
    env.setVoices([voice('Argentina', 'es-AR')]);
    act(() => env.fire());
    expect(result.current.spanishVoices).toHaveLength(1);
  });

  it('desactivado no habla, pero "probar voz" sí', () => {
    const env = install([]);
    const { result } = renderHook(() => useSpeech({ enabled: false, volume: 1, voiceURI: null }));
    act(() => result.current.announce(5));
    expect(env.synth.speak).not.toHaveBeenCalled();
    act(() => result.current.test());
    expect(env.synth.speak).toHaveBeenCalledTimes(1);
  });

  it('sin soporte: supported=false y announce/test no fallan', () => {
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 1, voiceURI: null }));
    expect(result.current.supported).toBe(false);
    expect(() => act(() => result.current.announce(3))).not.toThrow();
    expect(() => act(() => result.current.test())).not.toThrow();
  });

  it('si speak lanza una excepción, no se propaga', () => {
    const env = install([]);
    env.synth.speak.mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const { result } = renderHook(() => useSpeech({ enabled: true, volume: 1, voiceURI: null }));
    expect(() => act(() => result.current.announce(3))).not.toThrow();
  });
});
