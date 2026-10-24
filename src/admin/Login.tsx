import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { adminApi, AdminError } from './api';

function mensaje(e: unknown): string {
  if (e instanceof AdminError) {
    if (e.codigo === 'no_autorizado') return 'Contraseña incorrecta.';
    if (e.codigo === 'demasiados_intentos') return 'Demasiados intentos. Esperá unos 15 minutos.';
    if (e.codigo === 'no_configurado') return 'El panel no está configurado en el servidor (falta ADMIN_PASSWORD o la base).';
    if (e.codigo === 'sin_conexion') return 'No hay conexión con el servidor.';
  }
  return 'No se pudo ingresar. Probá de nuevo.';
}

export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviando || password === '') return;
    setEnviando(true);
    setError(null);
    try {
      await adminApi.login(password);
      setPassword('');
      onLogin();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-8">
      <form onSubmit={enviar} className="card" noValidate>
        <h1 className="font-display text-2xl font-extrabold">Administración</h1>
        <p className="mt-1 text-base text-slate-700">Bingo Escolar · licencias</p>
        <label htmlFor="admin-pass" className="mt-4 block text-lg font-bold">
          Contraseña
        </label>
        <input
          id="admin-pass"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'admin-pass-error' : undefined}
          className="input mt-1"
        />
        {error && (
          <p id="admin-pass-error" role="alert" className="mt-2 font-bold text-brand-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={enviando || password === ''} className="btn-primary mt-4 w-full">
          <LogIn className="h-6 w-6" aria-hidden="true" /> {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
