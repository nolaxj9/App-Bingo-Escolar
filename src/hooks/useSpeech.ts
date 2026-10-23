import { useCallback, useEffect, useRef, useState } from 'react';
import { numberToWords } from '../services/numberToWords';

export interface SpeechOptions {
  enabled: boolean;
  volume: number;
  voiceURI: string | null;
}

export interface UseSpeech {
  supported: boolean;
  voices: SpeechSynthesisVoice[];
  spanishVoices: SpeechSynthesisVoice[];
  announce: (n: number) => void;
  test: () => void;
}

const PREFERENCE = ['es-ar', 'es-419', 'es-us', 'es-mx', 'es-es'];

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window &&
    Boolean(window.speechSynthesis) &&
    Boolean(window.SpeechSynthesisUtterance)
  );
}

function rank(v: SpeechSynthesisVoice): number {
  const i = PREFERENCE.indexOf(v.lang.toLowerCase().replace('_', '-'));
  return i === -1 ? PREFERENCE.length : i;
}

/** Voces en español, ordenadas por preferencia (es-AR primero). */
export function pickSpanishVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => v.lang.toLowerCase().startsWith('es')).sort((a, b) => rank(a) - rank(b));
}

/**
 * Lectura en voz alta con SpeechSynthesis. Es "dispará y olvidá": nunca bloquea ni demora el sorteo,
 * y si el navegador no tiene voz (o falla) simplemente no suena.
 */
export function useSpeech(options: SpeechOptions): UseSpeech {
  const supported = isSupported();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const opts = useRef(options);
  opts.current = options;
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      try {
        const list = window.speechSynthesis.getVoices();
        voicesRef.current = list;
        setVoices(list);
      } catch {
        /* sin voces */
      }
    };
    load();
    try {
      window.speechSynthesis.addEventListener?.('voiceschanged', load);
    } catch {
      /* ignorar */
    }
    return () => {
      try {
        window.speechSynthesis.removeEventListener?.('voiceschanged', load);
      } catch {
        /* ignorar */
      }
    };
  }, [supported]);

  const speak = useCallback((text: string) => {
    if (!isSupported()) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const spanish = pickSpanishVoices(voicesRef.current);
      const chosen = (opts.current.voiceURI && spanish.find((v) => v.voiceURI === opts.current.voiceURI)) || spanish[0];
      if (chosen) u.voice = chosen;
      u.lang = chosen ? chosen.lang : 'es-AR';
      u.volume = Math.min(1, Math.max(0, opts.current.volume));
      u.rate = 0.95;
      u.onerror = () => {};
      synth.speak(u);
    } catch {
      /* la voz es opcional */
    }
  }, []);

  const announce = useCallback(
    (n: number) => {
      if (!opts.current.enabled) return;
      speak(`¡Salió el número ${numberToWords(n)}!`);
    },
    [speak],
  );

  const test = useCallback(() => speak('Probando la voz. ¡Salió el número cuarenta y dos!'), [speak]);

  return { supported, voices, spanishVoices: pickSpanishVoices(voices), announce, test };
}
