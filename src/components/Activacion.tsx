import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, MessageCircle } from 'lucide-react';
import { DIAS_POR_CODIGO, MAX_DISPOSITIVOS_DEFAULT } from '../shared/licencia';
import type { UseLicencia } from '../hooks/useLicencia';
import type { ErrorLicencia } from '../services/licencia';
import { formatearFecha, formatearPesos, linkWhatsApp } from '../services/formato';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';

interface Props {
  open: boolean;
  onClose: () => void;
  licencia: Pick<UseLicencia, 'activar' | 'info' | 'infoError' | 'cargarInfo'>;
}

/** Mensaje claro para cada error al activar. `detalle` es el texto del servidor (puede traer cuántos dispositivos). */
export function mensajeActivacion(error: ErrorLicencia, detalle?: string): string {
  switch (error) {
    case 'codigo_inexistente':
      return 'No encontramos ese código. Revisalo y probá de nuevo.';
    case 'codigo_vencido':
      return 'Este código ya venció. Pedí uno nuevo a quien te lo vendió.';
    case 'codigo_revocado':
      return 'Este código fue dado de baja. Consultá con quien te lo vendió.';
    case 'sin_dispositivos': {
      const n = detalle?.match(/\d+/)?.[0] ?? String(MAX_DISPOSITIVOS_DEFAULT);
      return `Este código ya se usó en ${n} dispositivos. Pedile a quien te lo vendió que libere uno.`;
    }
    case 'demasiados_intentos':
      return 'Probaste muchas veces seguidas. Esperá unos 15 minutos y volvé a intentar.';
    case 'no_configurado':
      return 'La activación todavía no está disponible. Probá más tarde.';
    case 'sin_conexion':
      return 'Para activar necesitás Internet una sola vez. Después funciona sin conexión.';
    case 'datos_invalidos':
      return 'El código tiene 12 letras y números, por ejemplo ABCD-EFGH-JKMN';
    default:
      return 'Algo salió mal de nuestro lado. Probá de nuevo en un rato.';
  }
}

export function Activacion({ open, onClose, licencia }: Props) {
  const toast = useToast();
  const { cargarInfo, info, infoError } = licencia;
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) cargarInfo();
  }, [open, cargarInfo]);

  useEffect(() => {
    if (open) {
      setError(null);
      setEnviando(false);
    }
  }, [open]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setError(null);
    setEnviando(true);
    const r = await licencia.activar(codigo);
    setEnviando(false);
    if (r.ok) {
      setCodigo('');
      onClose();
      toast.success(`¡Listo! Acceso completo para ${r.datos.entidad} hasta el ${formatearFecha(r.datos.vence)}`);
    } else {
      setError(mensajeActivacion(r.error, r.mensaje));
    }
  };

  const whatsapp = info?.whatsapp ? linkWhatsApp(info.whatsapp, 'Hola, quiero el acceso a Bingo Escolar') : null;

  return (
    <Modal open={open} onClose={onClose} title="Activar acceso completo" titleId="activar-title">
      <form onSubmit={enviar} className="mt-3" noValidate>
        <label htmlFor="codigo-acceso" className="text-lg font-bold">
          Código de acceso
        </label>
        <input
          id="codigo-acceso"
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={30}
          placeholder="ABCD-EFGH-JKMN"
          aria-describedby={error ? 'codigo-error' : undefined}
          aria-invalid={error ? true : undefined}
          className="input mt-1 uppercase tracking-wider"
        />
        {error && (
          <p id="codigo-error" role="alert" className="mt-2 font-bold text-brand-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={enviando || codigo.trim() === ''} className="btn-primary mt-3 w-full">
          <KeyRound className="h-6 w-6" aria-hidden="true" /> {enviando ? 'Activando…' : 'Activar'}
        </button>
        <p className="mt-2 text-sm text-slate-600">Necesitás Internet una sola vez. Después funciona sin conexión.</p>
      </form>

      <section aria-labelledby="como-comprar" className="mt-5 border-t border-brand-100 pt-4">
        <h3 id="como-comprar" className="font-display text-xl font-extrabold">
          Cómo comprar
        </h3>
        {info ? (
          <>
            <p className="mt-1 text-lg font-bold" data-testid="precio">
              {info.precioArs !== null ? `${formatearPesos(info.precioArs)} · ` : ''}
              {info.diasPorCodigo ?? DIAS_POR_CODIGO} días de acceso, hasta {MAX_DISPOSITIVOS_DEFAULT} dispositivos
            </p>
            {info.comoComprar && <p className="mt-1 whitespace-pre-line break-words text-base text-slate-700">{info.comoComprar}</p>}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-3 w-full">
                <MessageCircle className="h-6 w-6" aria-hidden="true" /> Pedir el código por WhatsApp
              </a>
            )}
          </>
        ) : (
          <p className="mt-1 text-base text-slate-700">
            {infoError ? 'Conectate a Internet para ver cómo comprar.' : 'Cargando…'}
            {infoError && ` Son ${DIAS_POR_CODIGO} días de acceso, hasta ${MAX_DISPOSITIVOS_DEFAULT} dispositivos.`}
          </p>
        )}
      </section>
    </Modal>
  );
}
