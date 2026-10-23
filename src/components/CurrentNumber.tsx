import { Ball } from './Ball';

interface Props {
  current: number | null;
  /** Cantidad sorteada: cambia en cada extracción y reinicia la animación de entrada. */
  drawnCount: number;
  animations: boolean;
  size?: string;
}

/** La bolilla enorme del último número, o el aviso de que falta el primero. */
export function CurrentNumber({ current, drawnCount, animations, size = 'var(--main-ball)' }: Props) {
  if (current === null) {
    return (
      <div
        data-testid="current-empty"
        className="flex flex-col items-center justify-center rounded-full border-8 border-dashed border-brand-200 bg-white text-center text-brand-700"
        style={{ width: size, height: size }}
      >
        <span className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">
          Esperando
          <br />
          el primer número
        </span>
      </div>
    );
  }
  return (
    <div data-testid="current-number" data-number={current}>
      <Ball
        key={drawnCount}
        number={current}
        size={size}
        label={`Último número: ${current}`}
        className={animations ? 'animate-ball-in' : ''}
      />
    </div>
  );
}
