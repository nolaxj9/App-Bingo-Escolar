/**
 * Colores de bolilla por decena. Todos tienen contraste ≥ 4.5:1 con texto blanco
 * (se usan como fondo de las celdas sorteadas del tablero) y combinan con el aro de la bolilla.
 */
export const BALL_COLORS = [
  '#b91c1c', // 1-10 rojo
  '#c2410c', // 11-20 naranja
  '#a16207', // 21-30 ámbar
  '#15803d', // 31-40 verde
  '#0f766e', // 41-50 verde azulado
  '#0369a1', // 51-60 celeste
  '#1d4ed8', // 61-70 azul
  '#6d28d9', // 71-80 violeta
  '#be185d', // 81-90 rosa
  '#475569', // 91-100 gris azulado
] as const;

export function ballColor(n: number): string {
  const i = Math.max(0, Math.floor((n - 1) / 10));
  return BALL_COLORS[i % BALL_COLORS.length];
}
