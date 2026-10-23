import { History, LayoutGrid, Settings, Sparkles } from 'lucide-react';

export type View = 'sorteo' | 'tablero' | 'historial' | 'ajustes';

const TABS: { id: View; label: string; Icon: typeof Sparkles }[] = [
  { id: 'sorteo', label: 'Sorteo', Icon: Sparkles },
  { id: 'tablero', label: 'Tablero', Icon: LayoutGrid },
  { id: 'historial', label: 'Historial', Icon: History },
  { id: 'ajustes', label: 'Ajustes', Icon: Settings },
];

export function TabBar({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <nav aria-label="Secciones" className="border-t border-brand-100 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[60px] w-full flex-col items-center justify-center gap-0.5 text-sm font-bold ${
                  active ? 'text-brand-700' : 'text-slate-600'
                }`}
              >
                <span className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-brand-100' : ''}`}>
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
