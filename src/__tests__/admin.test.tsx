import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminApp } from '../admin/AdminApp';
import { ToastProvider } from '../context/ToastContext';
import type { LicenciaAdmin } from '../shared/licencia';
import { json } from './permisoDePrueba';

const lic = (p: Partial<LicenciaAdmin> = {}): LicenciaAdmin => ({
  id: 'l1',
  entidad: 'Escuela 12',
  contacto: '+54 9 11 5555-1234',
  notas: '',
  codigoFinal: 'JKMN',
  creada: Date.UTC(2026, 9, 1),
  vence: Date.UTC(2026, 10, 30, 15),
  maxDispositivos: 3,
  dispositivosUsados: 1,
  revocada: null,
  montoArs: 7500,
  estado: 'activa',
  ...p,
});

const AJUSTES = { precioArs: 7500, comoComprar: 'Alias x', whatsapp: '5491155551234' };
const noAut = () => json({ error: 'no_autorizado', mensaje: 'No autorizado' }, 401);

let fetchMock: ReturnType<typeof vi.fn>;
let licencias: LicenciaAdmin[];
let logueado: boolean;
/** Llamadas hechas, como "METODO ruta". */
const llamadas = () => fetchMock.mock.calls.map(([u, i]) => `${i.method} ${u}`);

beforeEach(() => {
  licencias = [lic()];
  logueado = false;
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const m = init.method;
    if (url === '/api/admin/login') {
      const { password } = JSON.parse(init.body as string);
      if (password !== 'clave-correcta-123') return noAut();
      logueado = true;
      return json({ ok: true });
    }
    if (url === '/api/admin/logout') {
      logueado = false;
      return json({ ok: true });
    }
    if (!logueado) return noAut();
    if (url === '/api/admin/licencias' && m === 'GET') return json(licencias);
    if (url === '/api/admin/licencias' && m === 'POST') {
      const p = JSON.parse(init.body as string);
      const nueva = lic({ id: 'l2', entidad: p.entidad, contacto: p.contacto, codigoFinal: 'ZZ99', dispositivosUsados: 0, maxDispositivos: p.maxDispositivos, montoArs: p.montoArs });
      licencias = [nueva, ...licencias];
      return json({ licencia: nueva, codigo: 'ABCD-EFGH-JKMN' }, 201);
    }
    if (url === '/api/admin/ajustes' && m === 'GET') return json(AJUSTES);
    if (url === '/api/admin/ajustes' && m === 'PUT') return json(JSON.parse(init.body as string));
    if (url.endsWith('/regenerar-codigo')) return json({ licencia: licencias[0], codigo: 'WXYZ-2345-6789' });
    if (url.endsWith('/revocar')) {
      licencias = [lic({ revocada: 1, estado: 'revocada' })];
      return json({ ok: true });
    }
    return json({ ok: true });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <AdminApp />
    </ToastProvider>,
  );
  return user;
}

async function entrar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Contraseña'), 'clave-correcta-123');
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
  await screen.findByRole('heading', { name: /licencias \(1\)/i });
}

describe('Admin: login', () => {
  it('sin sesión muestra el login; con contraseña incorrecta avisa; con la correcta lista las licencias', async () => {
    const user = setup();
    await user.type(await screen.findByLabelText('Contraseña'), 'mala');
    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Contraseña incorrecta.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Contraseña'));
    await entrar(user);
    const card = screen.getByTestId('licencia');
    expect(card).toHaveTextContent('Escuela 12');
    expect(card).toHaveTextContent('…JKMN');
    expect(card).toHaveTextContent('Activa');
    expect(card).toHaveTextContent('30/11/2026');
    expect(card).toHaveTextContent('1 de 3');
    expect(card).toHaveTextContent(/7\.500/);
  });

  it('todos los pedidos que cambian datos mandan Content-Type: application/json y van con cookies del mismo origen', async () => {
    const user = setup();
    await entrar(user);
    await user.click(screen.getByRole('button', { name: /salir/i }));
    await screen.findByLabelText('Contraseña');
    for (const [, init] of fetchMock.mock.calls) {
      if (init.method !== 'GET') expect(init.headers['Content-Type']).toBe('application/json');
      expect(init.credentials).toBe('same-origin');
    }
    expect(llamadas()).toContain('POST /api/admin/logout');
  });

  it('con la sesión ya iniciada entra directo al panel', async () => {
    logueado = true;
    setup();
    expect(await screen.findByRole('heading', { name: /licencias \(1\)/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });

  it('un 401 en cualquier acción vuelve al login', async () => {
    const user = setup();
    await entrar(user);
    logueado = false; // la sesión venció
    await user.click(screen.getByRole('button', { name: /^acciones/i }));
    await user.click(screen.getByRole('button', { name: /extender 30 días/i }));
    expect(await screen.findByLabelText('Contraseña')).toBeInTheDocument();
  });
});

describe('Admin: licencias', () => {
  it('crear una licencia muestra el código grande, se puede copiar y mandar por WhatsApp', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = setup(); // user-event instala su propio portapapeles: se pisa después
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await entrar(user);

    await user.click(screen.getByRole('button', { name: /nueva licencia/i }));
    await user.click(screen.getByRole('button', { name: /crear licencia y código/i }));
    expect(screen.getByText('Escribí el nombre de la entidad.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Entidad'), 'Club Sur');
    await user.type(screen.getByLabelText('Contacto'), '54 9 11 4444-5555');
    await user.type(screen.getByLabelText(/monto cobrado/i), '7500');
    await user.click(screen.getByRole('button', { name: /crear licencia y código/i }));

    const dialog = await screen.findByRole('dialog', { name: /código de acceso/i });
    expect(within(dialog).getByTestId('codigo-nuevo')).toHaveTextContent('ABCD-EFGH-JKMN');
    const post = fetchMock.mock.calls.find(([u, i]) => u === '/api/admin/licencias' && i.method === 'POST')!;
    expect(JSON.parse(post[1].body)).toMatchObject({ entidad: 'Club Sur', contacto: '54 9 11 4444-5555', dias: 30, maxDispositivos: 3, montoArs: 7500 });

    await user.click(within(dialog).getByRole('button', { name: /copiar/i }));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-JKMN');
    expect(await within(dialog).findByText('Código copiado')).toBeInTheDocument();

    const wa = within(dialog).getByRole('link', { name: /mandar por whatsapp/i });
    const href = wa.getAttribute('href')!;
    expect(href.startsWith('https://wa.me/5491144445555?text=')).toBe(true);
    const texto = decodeURIComponent(href.split('text=')[1]);
    expect(texto).toContain('ABCD-EFGH-JKMN');
    expect(texto).toContain(window.location.origin);

    await user.click(within(dialog).getByRole('button', { name: /listo/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /licencias \(2\)/i })).toBeInTheDocument();
  });

  it('si no hay Clipboard API, selecciona el código como respaldo', async () => {
    const user = setup();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    await entrar(user);
    await user.click(screen.getByRole('button', { name: /^acciones/i }));
    await user.click(screen.getByRole('button', { name: /regenerar código/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, regenerar/i }));
    const dialog = await screen.findByRole('dialog', { name: /código de acceso/i });
    await user.click(within(dialog).getByRole('button', { name: /copiar/i }));
    expect(await within(dialog).findByText(/copialo a mano/i)).toBeInTheDocument();
    expect(window.getSelection()?.toString()).toBe('WXYZ-2345-6789');
  });

  it('revocar pide confirmación y no actúa si se cancela', async () => {
    const user = setup();
    await entrar(user);
    await user.click(screen.getByRole('button', { name: /^acciones/i }));
    await user.click(screen.getByRole('button', { name: /^revocar$/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /no, volver/i }));
    expect(llamadas()).not.toContain('POST /api/admin/licencias/l1/revocar');
    await user.click(screen.getByRole('button', { name: /^revocar$/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, revocar/i }));
    await waitFor(() => expect(llamadas()).toContain('POST /api/admin/licencias/l1/revocar'));
    await waitFor(() => expect(screen.getByTestId('licencia')).toHaveTextContent('Revocada'));
  });

  it('extender, liberar y extender otra cantidad llaman a su endpoint', async () => {
    const user = setup();
    await entrar(user);
    await user.click(screen.getByRole('button', { name: /^acciones/i }));
    await user.click(screen.getByRole('button', { name: /extender 30 días/i }));
    await waitFor(() => expect(llamadas()).toContain('POST /api/admin/licencias/l1/extender'));
    expect(JSON.parse(fetchMock.mock.calls.find(([u]) => u.endsWith('/extender'))![1].body)).toEqual({ dias: 30 });

    await user.click(screen.getByRole('button', { name: /liberar dispositivos/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, liberar/i }));
    await waitFor(() => expect(llamadas()).toContain('POST /api/admin/licencias/l1/liberar-dispositivos'));

    await user.click(screen.getByRole('button', { name: /extender otra cantidad/i }));
    const dlg = screen.getByRole('dialog', { name: /extender/i });
    await user.clear(within(dlg).getByLabelText(/días a sumar/i));
    await user.type(within(dlg).getByLabelText(/días a sumar/i), '7');
    await user.click(within(dlg).getByRole('button', { name: /^extender$/i }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([u]) => u.endsWith('/extender'))).toHaveLength(2));
    expect(JSON.parse(fetchMock.mock.calls.filter(([u]) => u.endsWith('/extender'))[1][1].body)).toEqual({ dias: 7 });
  });

  it('una licencia revocada se puede reactivar', async () => {
    licencias = [lic({ revocada: 1, estado: 'revocada' })];
    logueado = true;
    const user = setup();
    await screen.findByTestId('licencia');
    await user.click(screen.getByRole('button', { name: /^acciones/i }));
    await user.click(screen.getByRole('button', { name: /reactivar/i }));
    await waitFor(() => expect(llamadas()).toContain('POST /api/admin/licencias/l1/reactivar'));
  });
});

describe('Admin: ajustes de venta', () => {
  it('carga los ajustes y los guarda (WhatsApp solo con dígitos)', async () => {
    const user = setup();
    await entrar(user);
    const precio = await screen.findByLabelText(/precio/i);
    await waitFor(() => expect(precio).toHaveValue('7500'));
    await user.clear(precio);
    await user.type(precio, '9000');
    const wa = screen.getByLabelText(/whatsapp/i);
    await user.clear(wa);
    await user.type(wa, '+54 9 11 6666-7777');
    await user.click(screen.getByRole('button', { name: /guardar ajustes/i }));
    await waitFor(() => expect(llamadas()).toContain('PUT /api/admin/ajustes'));
    const put = fetchMock.mock.calls.find(([, i]) => i.method === 'PUT')!;
    expect(JSON.parse(put[1].body)).toEqual({ precioArs: 9000, comoComprar: 'Alias x', whatsapp: '5491166667777' });
    expect(await screen.findByText('Ajustes guardados')).toBeInTheDocument();
  });
});
