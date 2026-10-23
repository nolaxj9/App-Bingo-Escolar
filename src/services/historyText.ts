import type { GameState } from '../types/bingo';
import { BRAND } from './brand';

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('es-AR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Texto del historial en orden de extracción, listo para copiar o compartir. */
export function buildHistoryText(game: GameState, now = Date.now()): string {
  const { min, max } = game.range;
  const total = max - min + 1;
  const lines = [
    `Bingo Escolar - ${formatDate(game.startedAt ?? now)}`,
    `Rango: ${min} a ${max}`,
    `Sorteados: ${game.draws.length} de ${total}`,
    '',
  ];
  if (game.draws.length === 0) lines.push('Todavía no salió ningún número.');
  game.draws.forEach((d, i) => lines.push(`${i + 1}. ${d.number} (${formatTime(d.at)})`));
  if (game.draws.length > 0) lines.push('', `Orden de salida: ${game.draws.map((d) => d.number).join(', ')}`);
  lines.push('', `Bingo Escolar · by ${BRAND.author} ${BRAND.year}`);
  return lines.join('\n');
}

/** Copia al portapapeles: Clipboard API y, si falla, textarea + execCommand. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se prueba el respaldo */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}
