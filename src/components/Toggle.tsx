import { useId } from 'react';

interface Props {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}

/** Interruptor grande (role="switch") con texto al lado. */
export function Toggle({ label, checked, onChange, disabled, hint }: Props) {
  const id = useId();
  return (
    <div className="flex min-h-[56px] items-center justify-between gap-4">
      <label htmlFor={id} className="flex-1 text-lg font-bold text-ink">
        {label}
        {hint && <span className="block text-base font-normal text-slate-600">{hint}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-9 w-16 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-green-700' : 'bg-slate-500'}`}
      >
        <span className={`absolute top-1 h-7 w-7 rounded-full bg-white shadow transition-all ${checked ? 'left-8' : 'left-1'}`} />
      </button>
    </div>
  );
}
