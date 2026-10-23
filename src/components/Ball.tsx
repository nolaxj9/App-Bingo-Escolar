import { ballColor } from '../services/ballColor';

interface Props {
  number: number;
  /** Tamaño como largo CSS (px, vmin, min(...)). */
  size: string;
  className?: string;
  /** Texto accesible; por defecto el propio número. */
  label?: string;
}

/** Bolilla de bingo: aro de color por decena, círculo blanco interno y número en tinta oscura. */
export function Ball({ number, size, className = '', label }: Props) {
  const color = ballColor(number);
  const digits = String(number).length;
  const scale = digits >= 3 ? 0.34 : 0.46;
  return (
    <span
      role="img"
      aria-label={label ?? String(number)}
      data-ball={number}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full shadow-lift ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 28%, rgb(255 255 255 / .55), transparent 38%), ${color}`,
        ['--ball' as string]: size,
      }}
    >
      <span
        className="flex items-center justify-center rounded-full bg-white font-display font-extrabold leading-none text-ink num"
        style={{ width: '72%', height: '72%', fontSize: `calc(var(--ball) * ${scale})` }}
        aria-hidden="true"
      >
        {number}
      </span>
    </span>
  );
}
