import { Dices } from 'lucide-react';
import type { GameStatus } from '../types/bingo';

interface Props {
  status: GameStatus;
  busy: boolean;
  onDraw: () => void;
}

/** Botón principal. Mientras se anima queda "ocupado" (ignora toques) sin perder el foco. */
export function DrawButton({ status, busy, onDraw }: Props) {
  const finished = status === 'finished';
  return (
    <button
      type="button"
      onClick={onDraw}
      disabled={finished}
      aria-disabled={busy || finished}
      data-busy={busy ? 'true' : 'false'}
      className="flex min-h-[76px] whitespace-nowrap w-full items-center justify-center gap-3 rounded-[28px] bg-brand-600 px-4 font-display text-2xl min-[360px]:text-3xl font-extrabold uppercase tracking-wide text-white shadow-lift transition duration-150 hover:bg-brand-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none data-[busy=true]:opacity-80"
    >
      {!finished && <Dices className="h-9 w-9 shrink-0" aria-hidden="true" />}
      {finished ? 'Sorteo terminado' : 'Sacar número'}
    </button>
  );
}
