import { useEffect } from 'react';
import { Dices, KeyRound, X } from 'lucide-react';
import type { GameState, GameStatus } from '../types/bingo';
import { Ball } from './Ball';
import { NumberBoard } from './NumberBoard';
import { BrandCredit } from './BrandCredit';
import { DemoInsignia } from './DemoAviso';
import { DEMO_MAX_BOLILLAS } from '../shared/licencia';

interface Props {
  game: GameState;
  status: GameStatus;
  current: number | null;
  total: number;
  animations: boolean;
  busy: boolean;
  /** Versión demo: se muestra el cartel "DEMO". */
  demo?: boolean;
  /** Se llegó al límite de la demo: el botón de sacar pasa a "Activar". */
  limiteDemo?: boolean;
  onDraw: () => void;
  onActivar?: () => void;
  onExit: () => void;
}

/** Pantalla para proyectar: número gigante, últimos números y tablero; sin controles secundarios. */
export function ProjectorView({ game, status, current, total, animations, busy, demo = false, limiteDemo = false, onDraw, onActivar, onExit }: Props) {
  const drawn = game.draws.length;
  const previous = game.draws.slice(-9, -1).reverse();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      else if ((e.key === ' ' || e.key === 'Enter') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        onDraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDraw, onExit]);

  return (
    <div
      data-testid="projector"
      aria-label="Modo proyector"
      className="projector-root fixed inset-0 z-30 flex flex-col gap-[2vmin] bg-night-900 p-[2.5vmin] pb-[calc(2.5vmin+24px)] text-white landscape:flex-row"
    >
      <section className="flex min-h-0 flex-col items-center justify-center gap-[1.6vmin] landscape:w-[42%]">
        <div className="flex w-full items-center justify-between gap-2">
          <button
            type="button"
            onClick={onExit}
            aria-label="Salir del modo proyector"
            title="Salir (Esc)"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white opacity-70 hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          <p className="font-display text-[clamp(18px,3.6vmin,44px)] font-extrabold tracking-wide text-accent-400">Bingo Escolar</p>
          <button
            type="button"
            onClick={limiteDemo ? onActivar : onDraw}
            disabled={status === 'finished'}
            aria-disabled={busy}
            aria-label={limiteDemo ? 'Activar acceso completo' : 'Sacar un número'}
            title={limiteDemo ? 'Activar acceso completo' : 'Sacar número (Espacio)'}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full opacity-80 hover:opacity-100 focus-visible:opacity-100 disabled:bg-slate-600 ${limiteDemo ? 'bg-accent-400 text-ink' : 'bg-brand-600 text-white'}`}
          >
            {limiteDemo ? <KeyRound className="h-6 w-6" aria-hidden="true" /> : <Dices className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
        {current === null ? (
          <div
            className="flex items-center justify-center rounded-full border-[1.2vmin] border-dashed border-white/40 p-6 text-center font-display text-[clamp(20px,4.5vmin,56px)] font-extrabold"
            style={{ width: 'var(--pball)', height: 'var(--pball)' }}
          >
            ¡Que empiece el bingo!
          </div>
        ) : (
          <div data-testid="projector-number" data-number={current}>
            <Ball key={drawn} number={current} size="var(--pball)" label={`Último número: ${current}`} className={animations ? 'animate-ball-in' : ''} />
          </div>
        )}
        <p className="font-display text-[clamp(18px,4vmin,52px)] font-extrabold num" data-testid="projector-count">
          {status === 'finished' ? '¡Sorteo terminado!' : `Sorteados ${drawn} de ${total}`}
        </p>
        {demo && (
          <p className="flex items-center gap-2 text-[clamp(14px,2.4vmin,28px)] font-bold text-white/80" data-testid="projector-demo">
            <DemoInsignia />
            {limiteDemo ? `Límite de ${DEMO_MAX_BOLILLAS} bolillas` : 'Versión de prueba'}
          </p>
        )}
        {previous.length > 0 && (
          <ul className="flex flex-wrap justify-center gap-[1vmin]" aria-label="Últimos números">
            {previous.map((d) => (
              <li key={d.number}>
                <Ball number={d.number} size="clamp(34px, 6.4vmin, 76px)" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="min-h-0 flex-1 rounded-2xl bg-night-800 p-[1.6vmin]">
        <NumberBoard range={game.range} draws={game.draws} compact />
      </section>
      <BrandCredit variant="dark" className="pointer-events-none absolute bottom-[0.8vmin] right-[2.5vmin] leading-5" />
    </div>
  );
}
