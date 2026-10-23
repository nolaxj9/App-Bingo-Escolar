import { Copy, Share2 } from 'lucide-react';
import type { GameState } from '../types/bingo';
import { buildHistoryText, copyToClipboard, formatTime } from '../services/historyText';
import { useToast } from '../context/ToastContext';
import { Ball } from './Ball';

export function DrawHistory({ game }: { game: GameState }) {
  const toast = useToast();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const reversed = [...game.draws].map((d, i) => ({ ...d, order: i + 1 })).reverse();

  const copy = async () => {
    const ok = await copyToClipboard(buildHistoryText(game));
    if (ok) toast.success('Copiado');
    else toast.error('No se pudo copiar. Probá seleccionar el texto a mano.');
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Bingo Escolar', text: buildHistoryText(game) });
    } catch {
      /* el usuario canceló o no hay con qué compartir */
    }
  };

  return (
    <section aria-labelledby="hist-title" className="mx-auto w-full max-w-2xl px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="hist-title" className="font-display text-2xl font-extrabold text-ink">
          Historial <span className="num text-slate-600">({game.draws.length})</span>
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={copy} disabled={game.draws.length === 0} className="btn-secondary">
            <Copy className="h-5 w-5" aria-hidden="true" /> Copiar
          </button>
          {canShare && (
            <button type="button" onClick={share} disabled={game.draws.length === 0} className="btn-secondary">
              <Share2 className="h-5 w-5" aria-hidden="true" /> Compartir
            </button>
          )}
        </div>
      </div>
      {reversed.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-6 text-center text-lg font-semibold text-slate-700 shadow-soft">
          Todavía no salió ningún número. Cuando saques el primero, aparece acá.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-2" data-testid="history-list">
          {reversed.map((d, i) => (
            <li
              key={d.number}
              data-testid="history-item"
              className={`flex items-center gap-4 rounded-2xl bg-white px-4 py-2 shadow-soft ${i === 0 ? 'ring-4 ring-accent-400' : 'ring-1 ring-brand-100'}`}
            >
              <span className="w-10 text-right text-lg font-bold text-slate-600 num" aria-label={`Orden ${d.order}`}>
                {d.order}.
              </span>
              <Ball number={d.number} size="52px" />
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold text-ink num">Número {d.number}</p>
                {i === 0 && <span className="inline-block rounded-full bg-accent-400 px-2 py-0.5 text-sm font-bold text-ink">Último</span>}
              </div>
              <time className="text-lg font-semibold text-slate-700 num" dateTime={new Date(d.at).toISOString()}>
                {formatTime(d.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
