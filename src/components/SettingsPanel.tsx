import { useEffect, useState } from 'react';
import { KeyRound, MonitorPlay, TriangleAlert } from 'lucide-react';
import type { NumberRange, Settings } from '../types/bingo';
import { validateRange } from '../services/bingoEngine';
import type { UseSpeech } from '../hooks/useSpeech';
import type { UseLicencia } from '../hooks/useLicencia';
import { DEMO_MAX_BOLILLAS } from '../shared/licencia';
import { formatearFecha } from '../services/formato';
import { useOfflineReady } from '../registerSW';
import { version } from '../../package.json';
import { BRAND } from '../services/brand';
import { Toggle } from './Toggle';
import { VoiceControls } from './VoiceControls';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  speech: UseSpeech;
  range: NumberRange;
  drawnCount: number;
  /** Pide aplicar un rango nuevo (la App decide si hay que confirmar). */
  onApplyRange: (r: NumberRange) => void;
  onProjector: () => void;
  licencia: Pick<UseLicencia, 'modo' | 'entidad' | 'vence' | 'diasRestantes' | 'quitarAcceso'>;
  /** Abre la pantalla de activación. */
  onActivar: () => void;
}

export function SettingsPanel({ settings, update, speech, range, drawnCount, onApplyRange, onProjector, licencia, onActivar }: Props) {
  const [min, setMin] = useState(String(range.min));
  const [max, setMax] = useState(String(range.max));
  const [error, setError] = useState<string | null>(null);
  const offlineReady = useOfflineReady();
  const [quitando, setQuitando] = useState(false);
  const porVencer = licencia.diasRestantes !== null && licencia.diasRestantes <= 5;

  // Si el rango cambia desde afuera (nueva partida), los campos lo reflejan.
  useEffect(() => {
    setMin(String(range.min));
    setMax(String(range.max));
    setError(null);
  }, [range.min, range.max]);

  const apply = () => {
    const next = { min: Number(min), max: Number(max) };
    const msg = min.trim() === '' || max.trim() === '' ? 'Completá los dos números del rango.' : validateRange(next);
    if (msg) return setError(msg);
    if (next.min === range.min && next.max === range.max) return setError('Ya estás usando ese rango.');
    setError(null);
    onApplyRange(next);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4">
      <h2 className="font-display text-2xl font-extrabold text-ink">Ajustes</h2>

      <section className="card" aria-labelledby="set-acceso" data-testid="acceso">
        <h3 id="set-acceso" className="font-display text-xl font-extrabold">Acceso</h3>
        {licencia.modo === 'completo' && licencia.vence !== null ? (
          <>
            <p className={`mt-1 text-lg font-bold ${porVencer ? 'rounded-xl bg-accent-400 px-3 py-2 text-ink' : ''}`} data-testid="acceso-estado" data-por-vencer={porVencer}>
              {porVencer && <TriangleAlert className="mr-2 inline h-6 w-6 align-text-bottom" aria-hidden="true" />}
              Acceso completo · {licencia.entidad} · vence el {formatearFecha(licencia.vence)}
            </p>
            {porVencer && (
              <p className="mt-1 text-base text-slate-700">
                Te {licencia.diasRestantes === 1 ? 'queda 1 día' : `quedan ${licencia.diasRestantes} días`}. Pedí un código nuevo para seguir sin límite.
              </p>
            )}
            <button type="button" onClick={() => setQuitando(true)} className="btn-secondary mt-3">
              Quitar acceso de este dispositivo
            </button>
          </>
        ) : licencia.modo === 'cargando' ? (
          <p className="mt-1 text-lg font-bold" data-testid="acceso-estado">Verificando acceso…</p>
        ) : (
          <>
            <p className="mt-1 text-lg font-bold" data-testid="acceso-estado">
              Versión demo (hasta {DEMO_MAX_BOLILLAS} bolillas por partida)
            </p>
            <button type="button" onClick={onActivar} className="btn-primary mt-3">
              <KeyRound className="h-6 w-6" aria-hidden="true" /> Activar acceso completo
            </button>
          </>
        )}
      </section>

      <section className="card" aria-labelledby="set-range">
        <h3 id="set-range" className="font-display text-xl font-extrabold">Rango de números</h3>
        <p className="mt-1 text-base text-slate-700">
          Hoy se sortea del {range.min} al {range.max}. Cambiarlo empieza una partida nueva.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-lg font-bold">Desde</span>
            <input type="number" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} className="input mt-1" />
          </label>
          <label className="block">
            <span className="text-lg font-bold">Hasta</span>
            <input type="number" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value)} className="input mt-1" />
          </label>
        </div>
        {error && (
          <p role="alert" className="mt-3 font-bold text-brand-700">
            {error}
          </p>
        )}
        <button type="button" onClick={apply} className="btn-primary mt-3">
          Aplicar rango
        </button>
        {drawnCount > 0 && <p className="mt-2 text-sm text-slate-600">Hay una partida en juego: te vamos a pedir confirmación.</p>}
      </section>

      <section className="card" aria-labelledby="set-voice">
        <h3 id="set-voice" className="mb-2 font-display text-xl font-extrabold">Voz</h3>
        <VoiceControls settings={settings} update={update} speech={speech} />
      </section>

      <section className="card" aria-labelledby="set-fx">
        <h3 id="set-fx" className="mb-1 font-display text-xl font-extrabold">Sonido y movimiento</h3>
        <Toggle label="Sonidos" hint="Un “pop” cuando sale una bolilla" checked={settings.soundEnabled} onChange={(v) => update({ soundEnabled: v })} />
        <Toggle label="Animaciones" hint="La bolilla entra rodando" checked={settings.animationsEnabled} onChange={(v) => update({ animationsEnabled: v })} />
      </section>

      <section className="card" aria-labelledby="set-proj">
        <h3 id="set-proj" className="font-display text-xl font-extrabold">Modo proyector</h3>
        <p className="mt-1 text-base text-slate-700">Número gigante y tablero, para mostrar en el pizarrón o la tele.</p>
        <button type="button" onClick={onProjector} className="btn-dark mt-3">
          <MonitorPlay className="h-6 w-6" aria-hidden="true" /> Abrir modo proyector
        </button>
      </section>

      <section className="card" aria-labelledby="set-offline">
        <h3 id="set-offline" className="font-display text-xl font-extrabold">Sin Internet</h3>
        <p className="mt-1 text-lg font-bold" data-testid="offline-status" data-ready={offlineReady}>
          {offlineReady ? 'Lista para usar sin Internet' : 'Todavía no está guardada para usar sin Internet'}
        </p>
        <p className="mt-1 text-sm text-slate-600">Bingo Escolar · versión {version}</p>
      </section>

      <ConfirmDialog
        open={quitando}
        title="¿Quitar el acceso de este dispositivo?"
        confirmLabel="Sí, quitar el acceso"
        onConfirm={() => {
          setQuitando(false);
          licencia.quitarAcceso();
        }}
        onCancel={() => setQuitando(false)}
      >
        Vuelve la versión demo en este dispositivo. Para activarlo de nuevo vas a necesitar el código y Internet.
      </ConfirmDialog>

      <p data-testid="about" className="pb-2 text-center text-sm text-slate-600">
        Acerca de: Bingo Escolar v{version} — hecho por {BRAND.author} · {BRAND.year}
      </p>
    </div>
  );
}
