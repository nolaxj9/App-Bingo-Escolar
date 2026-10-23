import { useMemo } from 'react';
import type { DrawEntry, NumberRange } from '../types/bingo';
import { ballColor } from '../services/ballColor';

interface Props {
  range: NumberRange;
  draws: DrawEntry[];
  /** Versión para proyector: llena el alto disponible y usa colores sobre fondo oscuro. */
  compact?: boolean;
}

/** Tablero con todos los números: disponible, sorteado y último. */
export function NumberBoard({ range, draws, compact = false }: Props) {
  const drawnSet = useMemo(() => new Set(draws.map((d) => d.number)), [draws]);
  const last = draws.length ? draws[draws.length - 1].number : null;
  const size = range.max - range.min + 1;
  const numbers = useMemo(() => Array.from({ length: size }, (_, i) => range.min + i), [range.min, size]);
  const cols = compact && size > 100 ? (size > 200 ? 20 : 15) : 10;
  const rows = Math.ceil(size / cols);

  return (
    <ol
      aria-label="Tablero de números"
      data-testid="board"
      className={`grid gap-1 ${compact ? 'h-full min-h-0 w-full gap-[0.4vmin]' : 'w-full'}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        ...(compact ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` } : {}),
      }}
    >
      {numbers.map((n) => {
        const isDrawn = drawnSet.has(n);
        const isLast = n === last;
        const state = isLast ? 'last' : isDrawn ? 'drawn' : 'available';
        const label = `${n}, ${isLast ? 'último sorteado' : isDrawn ? 'sorteado' : 'disponible'}`;
        const base = 'flex items-center justify-center rounded-lg font-display font-bold num transition-transform';
        const shape = compact ? '' : 'aspect-square';
        const font = compact ? 'text-[clamp(10px,2.6vmin,34px)]' : size > 150 ? 'text-xs' : 'text-[clamp(12px,3.6vw,20px)]';
        let look: string;
        if (isDrawn) look = 'text-white';
        else look = compact ? 'bg-white/10 text-white/80' : 'bg-slate-100 text-slate-700';
        const extra = isLast ? 'z-10 scale-110 ring-4 ring-accent-400 shadow-lift' : '';
        return (
          <li
            key={n}
            data-state={state}
            data-n={n}
            aria-label={label}
            aria-current={isLast ? 'true' : undefined}
            className={`${base} ${shape} ${font} ${look} ${extra}`}
            style={isDrawn ? { backgroundColor: ballColor(n) } : undefined}
          >
            <span aria-hidden="true">{n}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function BoardLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-slate-700" aria-label="Referencias del tablero">
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded bg-slate-100 ring-1 ring-slate-300" aria-hidden="true" /> Disponible
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded bg-blue-700" aria-hidden="true" /> Sorteado
      </li>
      <li className="flex items-center gap-1.5">
        <span className="h-4 w-4 rounded bg-red-700 ring-2 ring-accent-400" aria-hidden="true" /> Último
      </li>
    </ul>
  );
}
