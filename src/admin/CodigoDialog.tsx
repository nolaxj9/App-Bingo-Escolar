import { useRef, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import type { LicenciaConCodigo } from '../shared/licencia';
import { formatearFecha, linkWhatsApp, telefonoDeContacto } from '../services/formato';
import { Modal } from '../components/Modal';

interface Props {
  datos: LicenciaConCodigo | null;
  onClose: () => void;
}

/** Texto del mensaje de WhatsApp con el código y la dirección de la app. */
export function mensajeCodigo(codigo: string, entidad: string, vence: number): string {
  return `Hola! Este es el código de acceso a Bingo Escolar para ${entidad}: ${codigo}\n\nActivalo en ${window.location.origin} (Ajustes → Activar acceso completo). Vale hasta el ${formatearFecha(vence)}.`;
}

/** Muestra el código nuevo, grande: es la única vez que se ve. */
export function CodigoDialog({ datos, onClose }: Props) {
  const codigoRef = useRef<HTMLElement>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const seleccionar = () => {
    const el = codigoRef.current;
    const sel = window.getSelection();
    if (!el || !sel) return;
    const r = document.createRange();
    r.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(r);
  };

  const copiar = async () => {
    if (!datos) return;
    try {
      await navigator.clipboard.writeText(datos.codigo);
      setAviso('Código copiado');
      return;
    } catch {
      /* sin Clipboard API: se prueba seleccionando */
    }
    seleccionar();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    setAviso(ok ? 'Código copiado' : 'Quedó seleccionado: copialo a mano');
  };

  return (
    <Modal open={datos !== null} onClose={onClose} title="Código de acceso" titleId="codigo-title">
      {datos && (
        <div className="mt-2">
          <p className="text-base text-slate-700">
            Para <strong>{datos.licencia.entidad}</strong>. Guardalo ahora: no se vuelve a mostrar.
          </p>
          <code
            ref={codigoRef}
            data-testid="codigo-nuevo"
            onClick={seleccionar}
            className="my-4 block select-all break-all rounded-2xl bg-night-900 px-3 py-5 text-center font-mono text-3xl font-extrabold tracking-widest text-accent-400"
          >
            {datos.codigo}
          </code>
          <div className="flex flex-col gap-3">
            <button type="button" onClick={copiar} className="btn-primary">
              <Copy className="h-6 w-6" aria-hidden="true" /> Copiar
            </button>
            <a
              href={linkWhatsApp(telefonoDeContacto(datos.licencia.contacto), mensajeCodigo(datos.codigo, datos.licencia.entidad, datos.licencia.vence))}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <MessageCircle className="h-6 w-6" aria-hidden="true" /> Mandar por WhatsApp
            </a>
            <button type="button" onClick={onClose} className="btn-secondary">
              Listo
            </button>
          </div>
          <p role="status" className="mt-2 min-h-[1.5rem] text-center font-bold text-green-800">
            {aviso}
          </p>
        </div>
      )}
    </Modal>
  );
}
