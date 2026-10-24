import { useState, type FormEvent } from 'react';
import { MAX_DISPOSITIVOS_DEFAULT, DIAS_POR_CODIGO, type CrearLicenciaPedido } from '../shared/licencia';

interface Props {
  onCrear: (p: CrearLicenciaPedido) => Promise<boolean>;
}

const entero = (t: string): number | null => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : null);

export function NuevaLicencia({ onCrear }: Props) {
  const [entidad, setEntidad] = useState('');
  const [contacto, setContacto] = useState('');
  const [notas, setNotas] = useState('');
  const [dias, setDias] = useState(String(DIAS_POR_CODIGO));
  const [max, setMax] = useState(String(MAX_DISPOSITIVOS_DEFAULT));
  const [monto, setMonto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    const d = entero(dias);
    const m = entero(max);
    const a = monto.trim() === '' ? null : entero(monto);
    if (entidad.trim() === '') return setError('Escribí el nombre de la entidad.');
    if (d === null || d < 1 || d > 3650) return setError('Los días tienen que ser un número entre 1 y 3650.');
    if (m === null || m < 1 || m > 50) return setError('Los dispositivos tienen que ser un número entre 1 y 50.');
    if (monto.trim() !== '' && a === null) return setError('El monto tiene que ser un número entero en pesos.');
    setError(null);
    setEnviando(true);
    const ok = await onCrear({ entidad: entidad.trim(), contacto: contacto.trim(), notas: notas.trim(), dias: d, maxDispositivos: m, montoArs: a });
    setEnviando(false);
    if (ok) {
      setEntidad('');
      setContacto('');
      setNotas('');
      setDias(String(DIAS_POR_CODIGO));
      setMax(String(MAX_DISPOSITIVOS_DEFAULT));
      setMonto('');
    }
  };

  return (
    <form onSubmit={enviar} className="card flex flex-col gap-3" noValidate aria-labelledby="nueva-titulo">
      <h2 id="nueva-titulo" className="font-display text-xl font-extrabold">
        Nueva licencia
      </h2>
      <label className="block">
        <span className="text-lg font-bold">Entidad</span>
        <input value={entidad} onChange={(e) => setEntidad(e.target.value)} maxLength={120} className="input mt-1" placeholder="Escuela N.º 12" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">Contacto</span>
        <input value={contacto} onChange={(e) => setContacto(e.target.value)} maxLength={200} className="input mt-1" placeholder="WhatsApp: 54 9 11 5555-1234" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">Notas</span>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={1000} rows={2} className="input mt-1 text-base" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-lg font-bold">Días</span>
          <input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-lg font-bold">Dispositivos</span>
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" className="input mt-1" />
        </label>
      </div>
      <label className="block">
        <span className="text-lg font-bold">Monto cobrado (ARS, opcional)</span>
        <input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="numeric" className="input mt-1" />
      </label>
      {error && (
        <p role="alert" className="font-bold text-brand-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={enviando} className="btn-primary">
        {enviando ? 'Creando…' : 'Crear licencia y código'}
      </button>
    </form>
  );
}
