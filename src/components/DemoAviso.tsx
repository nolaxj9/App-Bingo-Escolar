import { Sparkles } from 'lucide-react';
import { DEMO_MAX_BOLILLAS } from '../shared/licencia';

interface Props {
  /** Bolillas que quedan en la demo para esta partida. */
  restantes: number;
  onActivar: () => void;
}

/** Aviso compacto de la versión demo en la pantalla del sorteo. */
export function DemoAviso({ restantes, onActivar }: Props) {
  return (
    <p
      data-testid="demo-aviso"
      className="flex flex-wrap items-center justify-center gap-x-2 rounded-2xl bg-accent-400/30 px-3 py-1 text-center text-base font-bold text-ink"
    >
      <Sparkles className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>
        {restantes > 0
          ? `Versión demo: te ${restantes === 1 ? 'queda 1 bolilla' : `quedan ${restantes} bolillas`}`
          : `Versión demo: llegaste al límite de ${DEMO_MAX_BOLILLAS} bolillas`}
      </span>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onActivar} className="min-h-[48px] px-1 font-extrabold text-brand-800 underline underline-offset-2">
        Activar
      </button>
    </p>
  );
}

/** Cartel "DEMO" para el modo proyector. */
export function DemoInsignia({ className = '' }: { className?: string }) {
  return (
    <span
      data-testid="demo-insignia"
      className={`rounded-full bg-accent-400 px-3 py-0.5 font-display text-[clamp(12px,2.2vmin,24px)] font-extrabold tracking-widest text-ink ${className}`}
    >
      DEMO
    </span>
  );
}
