import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { diasEnMs, type InfoPublica, type PermisoRespuesta } from '../shared/licencia';
import {
  activar as activarServicio,
  borrarPermiso,
  obtenerInfo,
  renovar,
  verificarGuardado,
  type ErrorLicencia,
  type Resultado,
} from '../services/licencia';

export type ModoAcceso = 'cargando' | 'demo' | 'completo';

export interface UseLicencia {
  modo: ModoAcceso;
  entidad: string | null;
  /** ms desde epoch, o null en demo */
  vence: number | null;
  /** días enteros que faltan (se redondea hacia arriba), o null en demo */
  diasRestantes: number | null;
  activar: (codigo: string) => Promise<Resultado<PermisoRespuesta>>;
  quitarAcceso: () => void;
  /** Datos de "Cómo comprar": se piden recién al abrir la pantalla de activación y se guardan. */
  info: InfoPublica | null;
  infoError: ErrorLicencia | null;
  cargarInfo: () => void;
}

interface Acceso {
  entidad: string;
  vence: number;
}

const REVISION_MS = 60_000;

/**
 * Estado del acceso pago. Al abrir verifica el permiso guardado sin Internet; si hay conexión lo
 * renueva en segundo plano. Un error de red nunca quita el acceso: solo 403/410 del servidor.
 */
export function useLicencia(): UseLicencia {
  const [acceso, setAcceso] = useState<Acceso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const [info, setInfo] = useState<InfoPublica | null>(null);
  const [infoError, setInfoError] = useState<ErrorLicencia | null>(null);
  const pidiendoInfo = useRef(false);
  const infoLista = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const verificarYRenovar = useCallback(async () => {
    const local = await verificarGuardado();
    if (!montado.current) return;
    if (local.estado === 'valido') setAcceso({ entidad: local.payload.ent, vence: local.payload.exp });
    else setAcceso(null);
    setCargando(false);
    if (local.estado === 'sin_permiso') return;
    // Un permiso con firma, formato o dispositivo incorrectos no sirve nunca: se descarta.
    if (local.estado === 'invalido' && local.motivo !== 'vencido') {
      borrarPermiso();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const r = await renovar();
    if (r.ok) {
      if (montado.current) setAcceso({ entidad: r.datos.entidad, vence: r.datos.vence });
    } else if (r.status === 403 || r.status === 410) {
      borrarPermiso();
      if (montado.current) setAcceso(null);
    }
    // Cualquier otro fallo (red, 5xx, no_configurado): se conserva lo que había.
  }, []);

  useEffect(() => {
    void verificarYRenovar();
    // Al volver la conexión se reintenta la renovación (un permiso vencido puede haberse extendido).
    const alVolver = () => void verificarYRenovar();
    window.addEventListener('online', alVolver);
    return () => window.removeEventListener('online', alVolver);
  }, [verificarYRenovar]);

  // Un permiso que vence con la app abierta pasa a demo sin recargar.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), REVISION_MS);
    return () => clearInterval(id);
  }, []);

  const activar = useCallback(async (codigo: string) => {
    const r = await activarServicio(codigo);
    if (r.ok && montado.current) {
      setAcceso({ entidad: r.datos.entidad, vence: r.datos.vence });
      setAhora(Date.now());
    }
    return r;
  }, []);

  const quitarAcceso = useCallback(() => {
    borrarPermiso();
    setAcceso(null);
  }, []);

  const cargarInfo = useCallback(() => {
    if (pidiendoInfo.current || infoLista.current) return;
    pidiendoInfo.current = true;
    void obtenerInfo().then((r) => {
      pidiendoInfo.current = false;
      if (!montado.current) return;
      if (r.ok) {
        infoLista.current = true;
        setInfo(r.datos);
        setInfoError(null);
      } else setInfoError(r.error);
    });
  }, []);

  return useMemo<UseLicencia>(() => {
    const vigente = acceso !== null && acceso.vence > ahora;
    const modo: ModoAcceso = vigente ? 'completo' : cargando ? 'cargando' : 'demo';
    return {
      modo,
      entidad: vigente ? acceso.entidad : null,
      vence: vigente ? acceso.vence : null,
      diasRestantes: vigente ? Math.max(1, Math.ceil((acceso.vence - ahora) / diasEnMs(1))) : null,
      activar,
      quitarAcceso,
      info,
      infoError,
      cargarInfo,
    };
  }, [acceso, ahora, cargando, activar, quitarAcceso, info, infoError, cargarInfo]);
}
