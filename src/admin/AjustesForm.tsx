import { useEffect, useState, type FormEvent } from 'react';
import { soloDigitos } from '../services/formato';
import { useToast } from '../context/ToastContext';
import { adminApi, AdminError } from './api';

interface Props {
  /** Se llama ante cualquier 401 para volver al login. */
  onNoAutorizado: () => void;
}

export function AjustesForm({ onNoAutorizado }: Props) {
  const toast = useToast();
  const [precio, setPrecio] = useState('');
  const [como, setComo] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cargado, setCargado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    adminApi
      .ajustes()
      .then((a) => {
        if (!vivo) return;
        setPrecio(a.precioArs === null ? '' : String(a.precioArs));
        setComo(a.comoComprar);
        setWhatsapp(a.whatsapp ?? '');
        setCargado(true);
      })
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof AdminError && e.status === 401) onNoAutorizado();
        else setError('No se pudieron cargar los ajustes.');
      });
    return () => {
      vivo = false;
    };
  }, [onNoAutorizado]);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    const p = precio.trim();
    if (p !== '' && !/^\d+$/.test(p)) return setError('El precio tiene que ser un número entero en pesos.');
    const w = soloDigitos(whatsapp);
    if (w !== '' && (w.length < 8 || w.length > 15)) return setError('El WhatsApp tiene que estar en formato internacional, por ejemplo 5491155551234.');
    setError(null);
    setGuardando(true);
    try {
      const a = await adminApi.guardarAjustes({ precioArs: p === '' ? null : Number(p), comoComprar: como.trim(), whatsapp: w === '' ? null : w });
      setPrecio(a.precioArs === null ? '' : String(a.precioArs));
      setComo(a.comoComprar);
      setWhatsapp(a.whatsapp ?? '');
      toast.success('Ajustes guardados');
    } catch (err) {
      if (err instanceof AdminError && err.status === 401) onNoAutorizado();
      else setError('No se pudieron guardar los ajustes.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="card flex flex-col gap-3" noValidate aria-labelledby="ajustes-titulo">
      <h2 id="ajustes-titulo" className="font-display text-xl font-extrabold">
        Ajustes de venta
      </h2>
      <p className="text-base text-slate-700">Esto es lo que ve la gente en “Cómo comprar”.</p>
      <label className="block">
        <span className="text-lg font-bold">Precio (ARS)</span>
        <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" disabled={!cargado} className="input mt-1" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">Cómo comprar</span>
        <textarea value={como} onChange={(e) => setComo(e.target.value)} rows={3} maxLength={1000} disabled={!cargado} className="input mt-1 text-base" />
      </label>
      <label className="block">
        <span className="text-lg font-bold">WhatsApp</span>
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" disabled={!cargado} className="input mt-1" placeholder="5491155551234" />
        <span className="text-sm text-slate-600">Con código de país, sin + ni espacios.</span>
      </label>
      {error && (
        <p role="alert" className="font-bold text-brand-700">
          {error}
        </p>
      )}
      <button type="submit" disabled={!cargado || guardando} className="btn-primary">
        {guardando ? 'Guardando…' : 'Guardar ajustes'}
      </button>
    </form>
  );
}
