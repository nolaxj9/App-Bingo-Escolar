import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ToastProvider } from '../context/ToastContext';
import { GAME_KEY } from '../services/persistence';
import { PERMIT_KEY, leerPermiso } from '../services/licencia';
import { DIA, firmarDePrueba, instalarPermiso, json, usarClaveDePrueba } from './permisoDePrueba';

let fetchMock: ReturnType<typeof vi.fn>;

const INFO = { precioArs: 7500, comoComprar: 'Alias: bingo.escolar\n<b>no es html</b>', whatsapp: '+54 9 11 5555-1234', diasPorCodigo: 30 };

/** Deja guardada una partida con n números ya sorteados. */
function partidaCon(n: number) {
  const draws = Array.from({ length: n }, (_, i) => ({ number: i + 1, at: i + 1 }));
  localStorage.setItem(GAME_KEY, JSON.stringify({ schema: 1, range: { min: 1, max: 90 }, draws, startedAt: 1 }));
}

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
  return user;
}

const settle = () => act(async () => void vi.advanceTimersByTime(800));
const count = (id: string) => screen.getByTestId(id).textContent;
const sacar = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /sacar número/i }));
  await settle();
};
/** Espera a que la verificación del permiso termine (el aviso demo aparece o desaparece). */
const esperarDemo = () => screen.findByTestId('demo-aviso');

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState(null, '', '/');
  await usarClaveDePrueba();
  fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('App: modo demo', () => {
  it('muestra el aviso con las bolillas que quedan y corta en 15 con el botón de activar', async () => {
    partidaCon(13);
    const user = setup();
    expect(await esperarDemo()).toHaveTextContent('Versión demo: te quedan 2 bolillas');
    await sacar(user);
    expect(screen.getByTestId('demo-aviso')).toHaveTextContent('te queda 1 bolilla');
    await sacar(user);
    expect(count('drawn-count')).toBe('15');
    expect(screen.getByTestId('demo-aviso')).toHaveTextContent('llegaste al límite de 15 bolillas');
    expect(screen.queryByRole('button', { name: /sacar número/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activar acceso completo/i })).toBeInTheDocument();
  });

  it('en el límite, deshacer y nueva partida siguen andando', async () => {
    partidaCon(15);
    const user = setup();
    await esperarDemo();
    await user.click(screen.getByRole('button', { name: /deshacer/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, deshacer/i }));
    expect(count('drawn-count')).toBe('14');
    expect(screen.getByRole('button', { name: /sacar número/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /nueva partida/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, empezar de nuevo/i }));
    expect(count('drawn-count')).toBe('0');
  });

  it('en el proyector muestra DEMO y la barra espaciadora no pasa el límite', async () => {
    partidaCon(15);
    window.history.replaceState(null, '', '/#proyector');
    const user = setup();
    const proj = screen.getByTestId('projector');
    await within(proj).findByTestId('demo-insignia');
    await user.keyboard(' ');
    await user.keyboard('{Enter}');
    await settle();
    expect(within(proj).getByTestId('projector-count')).toHaveTextContent('Sorteados 15 de 90');
    expect(within(proj).getByRole('button', { name: /activar acceso completo/i })).toBeInTheDocument();
  });

  it('el botón del límite abre la activación y activar con un código válido desbloquea', async () => {
    partidaCon(15);
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url === '/api/info') return json(INFO);
      if (url === '/api/activar') {
        const { dispositivo } = JSON.parse(init.body as string);
        const { token, payload } = await firmarDePrueba({ did: dispositivo, ent: 'Club Sur', exp: Date.now() + 30 * DIA });
        return json({ permiso: token, entidad: 'Club Sur', vence: payload.exp });
      }
      throw new Error(`inesperado ${url}`);
    });
    const user = setup();
    await esperarDemo();
    await user.click(screen.getByRole('button', { name: /activar acceso completo/i }));
    const dialog = screen.getByRole('dialog', { name: /activar acceso completo/i });

    // Cómo comprar: precio, texto plano y WhatsApp
    expect(await within(dialog).findByTestId('precio')).toHaveTextContent(/7\.500/);
    expect(within(dialog).getByTestId('precio')).toHaveTextContent('30 días de acceso, hasta 3 dispositivos');
    expect(dialog).toHaveTextContent('<b>no es html</b>');
    expect(dialog.querySelector('b')).toBeNull();
    const wa = within(dialog).getByRole('link', { name: /whatsapp/i });
    expect(wa).toHaveAttribute('href', `https://wa.me/5491155551234?text=${encodeURIComponent('Hola, quiero el acceso a Bingo Escolar')}`);

    await user.type(within(dialog).getByLabelText(/código de acceso/i), 'abcd efgh-jkmn');
    await user.click(within(dialog).getByRole('button', { name: /^activar$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/¡Listo! Acceso completo para Club Sur hasta el \d\d\/\d\d\/\d{4}/)).toBeInTheDocument();
    expect(screen.queryByTestId('demo-aviso')).not.toBeInTheDocument();
    await sacar(user);
    expect(count('drawn-count')).toBe('16');
    expect(leerPermiso()).toBeTruthy();
  });

  it.each([
    ['codigo_inexistente', 404, /no encontramos ese código/i],
    ['codigo_vencido', 410, /ya venció/i],
    ['codigo_revocado', 403, /dado de baja/i],
    ['sin_dispositivos', 409, /ya se usó en 3 dispositivos\. Pedile a quien te lo vendió que libere uno\./],
    ['demasiados_intentos', 429, /muchas veces/i],
    ['no_configurado', 503, /todavía no está disponible/i],
  ])('error %s muestra un mensaje claro', async (error, status, texto) => {
    fetchMock.mockImplementation(async (url: string) => (url === '/api/info' ? json(INFO) : json({ error, mensaje: 'máximo 3 dispositivos' }, status)));
    const user = setup();
    await esperarDemo();
    await user.click(screen.getByRole('button', { name: /^activar$/i }));
    await user.type(screen.getByLabelText(/código de acceso/i), 'ABCD-EFGH-JKMN');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^activar$/i }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(texto);
  });

  it('sin Internet y con un código mal escrito explica qué hacer', async () => {
    const user = setup();
    await esperarDemo();
    await user.click(screen.getByRole('button', { name: /^activar$/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/código de acceso/i), 'ABC');
    await user.click(within(dialog).getByRole('button', { name: /^activar$/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('El código tiene 12 letras y números, por ejemplo ABCD-EFGH-JKMN');
    expect(within(dialog).getByText(/conectate a internet para ver cómo comprar/i)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/código de acceso/i));
    await user.type(within(dialog).getByLabelText(/código de acceso/i), 'ABCD-EFGH-JKMN');
    await user.click(within(dialog).getByRole('button', { name: /^activar$/i }));
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Para activar necesitás Internet una sola vez. Después funciona sin conexión.'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('App: acceso completo', () => {
  it('con un permiso válido guardado no hay límite (16 o más) ni aviso', async () => {
    partidaCon(15);
    await instalarPermiso();
    const user = setup();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled()); // la renovación en segundo plano
    await sacar(user);
    expect(count('drawn-count')).toBe('16');
    expect(screen.queryByTestId('demo-aviso')).not.toBeInTheDocument();
    await sacar(user);
    expect(count('drawn-count')).toBe('17');
  });

  it('permiso vencido: vuelve a la demo y corta en 15', async () => {
    partidaCon(15);
    await instalarPermiso({ exp: Date.now() - 1000 });
    setup();
    expect(await esperarDemo()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activar acceso completo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sacar número/i })).not.toBeInTheDocument();
  });

  it('error de red al renovar no quita el acceso', async () => {
    partidaCon(15);
    await instalarPermiso();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = setup();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/renovar', expect.anything()));
    await act(async () => {});
    await sacar(user);
    expect(count('drawn-count')).toBe('16');
    expect(localStorage.getItem(PERMIT_KEY)).toBeTruthy();
  });

  it('renovar responde 403: quita el permiso y vuelve a la demo', async () => {
    partidaCon(15);
    await instalarPermiso();
    fetchMock.mockResolvedValue(json({ error: 'codigo_revocado', mensaje: 'revocado' }, 403));
    setup();
    expect(await esperarDemo()).toBeInTheDocument();
    expect(leerPermiso()).toBeNull();
    expect(screen.queryByRole('button', { name: /sacar número/i })).not.toBeInTheDocument();
  });

  it('Ajustes: muestra entidad y vencimiento, avisa si faltan ≤ 5 días y permite quitar el acceso con confirmación', async () => {
    await instalarPermiso({ ent: 'Escuela 12', exp: Date.now() + 3 * DIA - 1000 });
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    const estado = await screen.findByText(/Acceso completo · Escuela 12 · vence el \d\d\/\d\d\/\d{4}/);
    expect(estado).toHaveAttribute('data-por-vencer', 'true');
    expect(screen.getByText(/quedan 3 días/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /quitar acceso de este dispositivo/i }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /no, volver/i }));
    expect(leerPermiso()).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /quitar acceso de este dispositivo/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, quitar el acceso/i }));
    expect(leerPermiso()).toBeNull();
    expect(screen.getByText('Versión demo (hasta 15 bolillas por partida)')).toBeInTheDocument();
  });

  it('Ajustes: con mucho tiempo por delante no usa el estilo de aviso; en demo ofrece activar', async () => {
    await instalarPermiso({ exp: Date.now() + 20 * DIA });
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    await waitFor(() => expect(screen.getByTestId('acceso-estado')).toHaveTextContent(/^Acceso completo/));
    expect(screen.getByTestId('acceso-estado')).toHaveAttribute('data-por-vencer', 'false');
  });

  it('Ajustes en demo: el botón abre la activación', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    await screen.findByText('Versión demo (hasta 15 bolillas por partida)');
    await user.click(within(screen.getByTestId('acceso')).getByRole('button', { name: /activar acceso completo/i }));
    expect(screen.getByRole('dialog', { name: /activar acceso completo/i })).toBeInTheDocument();
  });
});
