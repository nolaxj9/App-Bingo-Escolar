import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}
interface ToastApi {
  success: (t: string) => void;
  error: (t: string) => void;
}
const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('ok', t), error: (t) => push('error', t) }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md flex-col gap-2">
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {toasts
            .filter((t) => t.kind === 'ok')
            .map((t) => (
              <div key={t.id} className="animate-rise rounded-2xl bg-ink px-4 py-3 text-base font-semibold text-white shadow-lift">
                {t.text}
              </div>
            ))}
        </div>
        <div role="alert" className="flex flex-col gap-2">
          {toasts
            .filter((t) => t.kind === 'error')
            .map((t) => (
              <div key={t.id} className="animate-rise rounded-2xl bg-brand-800 px-4 py-3 text-base font-semibold text-white shadow-lift">
                {t.text}
              </div>
            ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
