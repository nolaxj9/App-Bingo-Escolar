import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LicenciaAdmin } from '../shared/licencia';
import { DIAS_POR_CODIGO } from '../shared/licencia';
import { formatearFecha, formatearPesos } from '../services/formato';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';

export type Accion = 'extender' | 'revocar' | 'reactivar' | 'liberar' | 'regenerar';

interface Props {
  licencia: LicenciaAdmin;
  onAccion: (accion: Accion, licencia: LicenciaAdmin, dias?: number) => Promise<void>;
}

const BADGE: Record<LicenciaAdmin['estado'], string> = {
  activa: 'bg-green-100 text-green-900',
  vencida: 'bg-slate-200 text-slate-900',
  revocada: 'bg-brand-100 text-brand-900',
};

type Confirmacion = 'revocar' | 'liberar' | 'regenerar' | null;

export function LicenciaCard({ licencia: l, onAccion }: Props) {
  const [abierta, setAbierta] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);
  const [otrosDias, setOtrosDias] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState(false);

  const ejecutar = async (accion: Accion, dias?: number) => {
    setOcupada(true);
    try {
      await onAccion(accion, l, dias);
    } finally {
      setOcupada(false);
    }
  };

  const confirmarAccion = () => {
    const a = confirmar;
    setConfirmar(null);
    if (a) void ejecutar(a);
  };

  const diasValidos = otrosDias !== null && /^\d+$/.test(otrosDias.trim()) && Number(otrosDias) >= 1 && Number(otrosDias) <= 3650;

  return (
    <li className="card" data-testid="licencia" data-estado={l.estado}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-display text-xl font-extrabold">{l.entidad}</h3>
          <p className="num text-base font-bold text-slate-700">Código …{l.codigoFinal}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${BADGE[l.estado]}`}>{l.estado === 'activa' ? 'Activa' : l.estado === 'vencida' ? 'Vencida' : 'Revocada'}</span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-base">
        <dt className="text-slate-600">Vence</dt>
        <dd className="num font-bold">{formatearFecha(l.vence)}</dd>
        <dt className="text-slate-600">Dispositivos</dt>
        <dd className="num font-bold">
          {l.dispositivosUsados} de {l.maxDispositivos}
        </dd>
        {l.montoArs !== null && (
          <>
            <dt className="text-slate-600">Monto</dt>
            <dd className="num font-bold">{formatearPesos(l.montoArs)}</dd>
          </>
        )}
        {l.contacto && (
          <>
            <dt className="text-slate-600">Contacto</dt>
            <dd className="break-words font-bold">{l.contacto}</dd>
          </>
        )}
      </dl>
      {l.notas && <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{l.notas}</p>}

      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="btn-secondary mt-3 w-full"
      >
        Acciones <ChevronDown className={`h-5 w-5 transition ${abierta ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {abierta && (
        <div className="mt-2 grid gap-2">
          <button type="button" disabled={ocupada} onClick={() => void ejecutar('extender', DIAS_POR_CODIGO)} className="btn-primary">
            Extender {DIAS_POR_CODIGO} días
          </button>
          <button type="button" disabled={ocupada} onClick={() => setOtrosDias(String(DIAS_POR_CODIGO))} className="btn-secondary">
            Extender otra cantidad de días
          </button>
          <button type="button" disabled={ocupada} onClick={() => setConfirmar('liberar')} className="btn-secondary">
            Liberar dispositivos
          </button>
          <button type="button" disabled={ocupada} onClick={() => setConfirmar('regenerar')} className="btn-secondary">
            Regenerar código
          </button>
          {l.revocada === null ? (
            <button type="button" disabled={ocupada} onClick={() => setConfirmar('revocar')} className="btn-danger">
              Revocar
            </button>
          ) : (
            <button type="button" disabled={ocupada} onClick={() => void ejecutar('reactivar')} className="btn-primary">
              Reactivar
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmar === 'revocar'}
        title={`¿Revocar la licencia de ${l.entidad}?`}
        confirmLabel="Sí, revocar"
        onConfirm={confirmarAccion}
        onCancel={() => setConfirmar(null)}
      >
        Los dispositivos pierden el acceso completo la próxima vez que tengan Internet. Se puede reactivar después.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmar === 'liberar'}
        title="¿Liberar los dispositivos?"
        confirmLabel="Sí, liberar"
        onConfirm={confirmarAccion}
        onCancel={() => setConfirmar(null)}
      >
        Los {l.dispositivosUsados} dispositivos activados pierden el acceso y el código queda libre para activarse de nuevo.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmar === 'regenerar'}
        title="¿Regenerar el código?"
        confirmLabel="Sí, regenerar"
        onConfirm={confirmarAccion}
        onCancel={() => setConfirmar(null)}
      >
        El código actual deja de servir para activar. Los dispositivos ya activados siguen andando. Vas a ver el código nuevo una sola vez.
      </ConfirmDialog>

      <Modal open={otrosDias !== null} onClose={() => setOtrosDias(null)} title="Extender" titleId={`ext-${l.id}`}>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!diasValidos) return;
            const d = Number(otrosDias);
            setOtrosDias(null);
            void ejecutar('extender', d);
          }}
        >
          <label className="block">
            <span className="text-lg font-bold">Días a sumar</span>
            <input value={otrosDias ?? ''} onChange={(e) => setOtrosDias(e.target.value)} inputMode="numeric" className="input mt-1" />
          </label>
          <button type="submit" disabled={!diasValidos} className="btn-primary mt-3 w-full">
            Extender
          </button>
        </form>
      </Modal>
    </li>
  );
}
