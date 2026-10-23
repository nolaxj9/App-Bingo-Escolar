import { MonitorPlay, WifiOff } from 'lucide-react';
import type { GameStatus } from '../types/bingo';
import { StatusBadge } from './GameStats';

interface Props {
  status: GameStatus;
  online: boolean;
  onProjector: () => void;
}

export function Header({ status, online, onProjector }: Props) {
  return (
    <header className="flex items-center gap-2 border-b border-brand-100 bg-white px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 ring-4 ring-brand-100" aria-hidden="true">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-display text-sm font-extrabold text-ink">B</span>
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-xl font-extrabold leading-tight text-ink sm:text-2xl">Bingo Escolar</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={status} />
          {!online && (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-700" data-testid="offline-chip">
              <WifiOff className="h-4 w-4" aria-hidden="true" /> Sin Internet
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onProjector}
        aria-label="Modo proyector"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-night-900 text-white shadow-soft active:scale-95"
      >
        <MonitorPlay className="h-6 w-6" aria-hidden="true" />
      </button>
    </header>
  );
}
