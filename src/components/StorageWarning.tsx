import { TriangleAlert } from 'lucide-react';
import { storageErrorMessage, type StorageError } from '../services/persistence';

export function StorageWarning({ error }: { error: StorageError | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      data-testid="storage-warning"
      className="mx-auto flex w-full max-w-6xl items-start gap-3 bg-accent-400 px-4 py-3 text-base font-semibold text-ink"
    >
      <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
      <p>{storageErrorMessage(error)}</p>
    </div>
  );
}
