import { BRAND } from '../services/brand';

interface Props {
  variant: 'light' | 'dark';
  className?: string;
}

/** Firma discreta, no clickeable. `light` para fondo claro, `dark` para el proyector. */
export function BrandCredit({ variant, className = '' }: Props) {
  const tone = variant === 'dark' ? 'text-white/50 text-[clamp(14px,2.2vmin,16px)]' : 'text-ink/60 text-[13px]';
  return (
    <p data-testid="brand-credit" className={`select-none text-center font-display font-semibold tracking-widest ${tone} ${className}`}>
      {BRAND.credit}
    </p>
  );
}
