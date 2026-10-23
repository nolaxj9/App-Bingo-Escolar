import type { GameStatus } from '../types/bingo';

interface StatsProps {
  drawn: number;
  remaining: number;
  total: number;
}

export function GameStats({ drawn, remaining, total }: StatsProps) {
  return (
    <dl className="grid w-full grid-cols-3 gap-2 text-center" data-testid="stats">
      <Stat label="Sorteados" value={drawn} testId="drawn-count" />
      <Stat label="Restantes" value={remaining} testId="remaining-count" />
      <Stat label="Total" value={total} />
    </dl>
  );
}

function Stat({ label, value, testId }: { label: string; value: number; testId?: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-2 shadow-soft ring-1 ring-brand-100">
      <dt className="text-sm font-bold text-slate-600">{label}</dt>
      <dd className="font-display text-3xl font-extrabold leading-none text-ink num" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

const STATUS_TEXT: Record<GameStatus, string> = {
  idle: 'Lista para empezar',
  playing: 'En juego',
  finished: '¡Sorteo terminado!',
};
const STATUS_STYLE: Record<GameStatus, string> = {
  idle: 'bg-slate-100 text-slate-800 ring-slate-300',
  playing: 'bg-green-100 text-green-900 ring-green-400',
  finished: 'bg-accent-400 text-ink ring-accent-500',
};
const DOT_STYLE: Record<GameStatus, string> = {
  idle: 'bg-slate-500',
  playing: 'bg-green-600 live-dot',
  finished: 'bg-brand-700',
};

/** Indicador del estado de la partida (texto + punto de color, no depende solo del color). */
export function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <span
      data-testid="status"
      data-status={status}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ring-1 ${STATUS_STYLE[status]}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${DOT_STYLE[status]}`} aria-hidden="true" />
      {STATUS_TEXT[status]}
    </span>
  );
}
