import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, RefreshCw } from 'lucide-react';
import type { CrearLicenciaPedido, LicenciaAdmin, LicenciaConCodigo } from '../shared/licencia';
import { useToast } from '../context/ToastContext';
import { adminApi, AdminError } from './api';
import { Login } from './Login';
import { NuevaLicencia } from './NuevaLicencia';
import { LicenciaCard, type Accion } from './LicenciaCard';
import { CodigoDialog } from './CodigoDialog';
import { AjustesForm } from './AjustesForm';

type Sesion = 'comprobando' | 'login' | 'panel';

function mensajeError(e: unknown): string {
  if (e instanceof AdminError) {
    if (e.codigo === 'sin_conexion') return 'No hay conexión con el servidor.';
    if (e.codigo === 'no_configurado') return 'El panel no está configurado en el servidor.';
    if (e.codigo === 'datos_invalidos') return e.message;
  }
  return 'Algo salió mal. Probá de nuevo.';
}

export function AdminApp() {
  const toast = useToast();
  const [sesion, setSesion] = useState<Sesion>('comprobando');
  const [licencias, setLicencias] = useState<LicenciaAdmin[]>([]);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [codigo, setCodigo] = useState<LicenciaConCodigo | null>(null);

  /** Cualquier 401 vuelve al login. */
  const noAutorizado = useCallback(() => {
    setLicencias([]);
    setCodigo(null);
    setSesion('login');
  }, []);

  /** Ejecuta una llamada; ante 401 vuelve al login, ante otro error avisa. Devuelve `undefined` si falló. */
  const intentar = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof AdminError && e.status === 401) noAutorizado();
        else toast.error(mensajeError(e));
        return undefined;
      }
    },
    [noAutorizado, toast],
  );

  const cargar = useCallback(async () => {
    try {
      setLicencias(await adminApi.licencias());
      setErrorLista(null);
      setSesion('panel');
    } catch (e) {
      if (e instanceof AdminError && e.status === 401) noAutorizado();
      else {
        setErrorLista(mensajeError(e));
        setSesion((s) => (s === 'comprobando' ? 'panel' : s));
      }
    }
  }, [noAutorizado]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const salir = async () => {
    await adminApi.logout().catch(() => {});
    noAutorizado();
  };

  const crear = async (p: CrearLicenciaPedido): Promise<boolean> => {
    const r = await intentar(() => adminApi.crear(p));
    if (!r) return false;
    setCodigo(r);
    setNueva(false);
    await cargar();
    return true;
  };

  const accion = async (a: Accion, l: LicenciaAdmin, dias?: number) => {
    if (a === 'regenerar') {
      const r = await intentar(() => adminApi.regenerar(l.id));
      if (r) setCodigo(r);
    } else {
      const ok = await intentar(async () => {
        if (a === 'extender') await adminApi.extender(l.id, dias ?? 30);
        else if (a === 'revocar') await adminApi.revocar(l.id);
        else if (a === 'reactivar') await adminApi.reactivar(l.id);
        else await adminApi.liberar(l.id);
        return true;
      });
      if (ok) {
        toast.success(
          a === 'extender' ? `Se sumaron ${dias} días` : a === 'revocar' ? 'Licencia revocada' : a === 'reactivar' ? 'Licencia reactivada' : 'Dispositivos liberados',
        );
      }
    }
    await cargar();
  };

  if (sesion === 'comprobando') {
    return (
      <main className="flex h-full items-center justify-center">
        <p className="text-lg font-bold text-slate-700">Cargando…</p>
      </main>
    );
  }
  if (sesion === 'login') return <Login onLogin={() => void cargar()} />;

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-brand-100 bg-white px-4 py-2">
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold">Administración · Bingo Escolar</h1>
        <button type="button" onClick={() => void cargar()} aria-label="Actualizar la lista" className="flex h-12 w-12 items-center justify-center rounded-full hover:bg-slate-100">
          <RefreshCw className="h-6 w-6" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => void salir()} className="btn-secondary min-h-[48px] px-3 text-base">
          <LogOut className="h-5 w-5" aria-hidden="true" /> Salir
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4">
        {nueva ? (
          <NuevaLicencia onCrear={crear} />
        ) : (
          <button type="button" onClick={() => setNueva(true)} className="btn-primary">
            <Plus className="h-6 w-6" aria-hidden="true" /> Nueva licencia
          </button>
        )}

        <section aria-labelledby="lista-titulo">
          <h2 id="lista-titulo" className="mb-2 font-display text-xl font-extrabold">
            Licencias ({licencias.length})
          </h2>
          {errorLista && (
            <p role="alert" className="mb-2 font-bold text-brand-700">
              {errorLista}
            </p>
          )}
          {licencias.length === 0 && !errorLista ? (
            <p className="text-lg text-slate-700">Todavía no hay licencias.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {licencias.map((l) => (
                <LicenciaCard key={l.id} licencia={l} onAccion={accion} />
              ))}
            </ul>
          )}
        </section>

        <AjustesForm onNoAutorizado={noAutorizado} />
      </main>
      <CodigoDialog datos={codigo} onClose={() => setCodigo(null)} />
    </div>
  );
}
