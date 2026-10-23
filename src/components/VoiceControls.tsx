import { Volume2 } from 'lucide-react';
import type { Settings } from '../types/bingo';
import type { UseSpeech } from '../hooks/useSpeech';
import { Toggle } from './Toggle';

interface Props {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  speech: UseSpeech;
}

export function VoiceControls({ settings, update, speech }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <Toggle
        label="Leer los números en voz alta"
        checked={settings.voiceEnabled}
        onChange={(v) => update({ voiceEnabled: v })}
        disabled={!speech.supported}
      />
      {!speech.supported && (
        <p role="note" className="rounded-xl bg-accent-400/30 p-3 font-semibold text-ink">
          Este navegador no puede leer en voz alta. El sorteo funciona igual, sin voz.
        </p>
      )}
      {speech.supported && settings.voiceEnabled && (
        <>
          <label className="block">
            <span className="text-lg font-bold text-ink">Volumen de la voz: {Math.round(settings.voiceVolume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.voiceVolume * 100)}
              onChange={(e) => update({ voiceVolume: Number(e.target.value) / 100 })}
              className="mt-2 h-10 w-full accent-brand-600"
            />
          </label>
          {speech.spanishVoices.length > 0 ? (
            <label className="block">
              <span className="text-lg font-bold text-ink">Voz</span>
              <select
                value={settings.voiceURI ?? ''}
                onChange={(e) => update({ voiceURI: e.target.value || null })}
                className="input mt-2"
              >
                <option value="">Automática (la mejor en español)</option>
                {speech.spanishVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-base text-slate-700">
              No encontramos voces en español en este dispositivo. Se usa la voz predeterminada; puede sonar con otro acento.
            </p>
          )}
          <button type="button" onClick={speech.test} className="btn-secondary self-start">
            <Volume2 className="h-5 w-5" aria-hidden="true" /> Probar voz
          </button>
        </>
      )}
    </div>
  );
}
