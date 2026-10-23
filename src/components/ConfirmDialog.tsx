import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal de confirmación. El foco arranca en "cancelar", Escape cancela y tocar afuera nunca confirma. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'No, volver', onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelFn = useRef(onCancel);
  cancelFn.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelFn.current();
      } else if (e.key === 'Tab') {
        // Foco atrapado entre los dos botones.
        const a = cancelRef.current;
        const b = confirmRef.current;
        if (!a || !b) return;
        const [first, second] = [a, b];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          second.focus();
        } else if (!e.shiftKey && document.activeElement === second) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="animate-rise w-full max-w-md rounded-3xl bg-white p-6 shadow-lift"
      >
        <h2 id="confirm-title" className="font-display text-2xl font-extrabold text-ink">
          {title}
        </h2>
        <div id="confirm-desc" className="mt-2 text-lg text-slate-700">
          {children}
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className="btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
