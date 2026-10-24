import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { ToastProvider } from '../context/ToastContext';
import { GAME_KEY, SETTINGS_KEY, loadGame } from '../services/persistence';

let spoken: string[] = [];

function installSpeech() {
  spoken = [];
  class Utter {
    text: string;
    lang = '';
    voice: unknown = null;
    volume = 1;
    rate = 1;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  const synth = {
    speak: vi.fn((u: Utter) => spoken.push(u.text)),
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utter, configurable: true, writable: true });
  return synth;
}

function removeSpeech() {
  // @ts-expect-error: simula un navegador sin SpeechSynthesis
  delete window.speechSynthesis;
  // @ts-expect-error: idem
  delete window.SpeechSynthesisUtterance;
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

/** Deja pasar el cerrojo anti doble toque (700 ms con animaciones). */
const settle = () => act(async () => void vi.advanceTimersByTime(800));
const draw = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /sacar número/i }));
  await settle();
};
const count = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  vi.useRealTimers();
  removeSpeech();
});

describe('App: flujo principal', () => {
  it('sacar → tablero marcado → historial → deshacer → nueva partida (ambos con confirmación)', async () => {
    installSpeech();
    const user = setup();
    expect(screen.getByRole('heading', { name: 'Bingo Escolar' })).toBeInTheDocument();
    expect(screen.getByTestId('status')).toHaveTextContent('Lista para empezar');
    expect(screen.getByRole('button', { name: /deshacer/i })).toBeDisabled();

    await draw(user);
    await draw(user);
    const last = Number(screen.getByTestId('current-number').dataset.number);
    expect(count('drawn-count')).toBe('2');
    expect(count('remaining-count')).toBe('88');
    expect(screen.getByTestId('status')).toHaveTextContent('En juego');

    await user.click(screen.getByRole('button', { name: /tablero/i }));
    const board = screen.getByTestId('board');
    expect(board.querySelectorAll('[data-state="drawn"], [data-state="last"]')).toHaveLength(2);
    const lastCell = board.querySelector('[data-state="last"]')!;
    expect(lastCell).toHaveAttribute('aria-label', `${last}, último sorteado`);
    expect(lastCell).toHaveAttribute('aria-current', 'true');
    expect(board.querySelectorAll('[data-state="available"]')).toHaveLength(88);

    await user.click(screen.getByRole('button', { name: /historial/i }));
    const items = screen.getAllByTestId('history-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(`Número ${last}`);
    expect(items[0]).toHaveTextContent('Último');

    await user.click(screen.getByRole('button', { name: /sorteo/i }));
    await user.click(screen.getByRole('button', { name: /deshacer/i }));
    const dialog = screen.getByRole('alertdialog');
    expect(count('drawn-count')).toBe('2'); // todavía no se deshizo nada
    await user.click(within(dialog).getByRole('button', { name: `Sí, deshacer el ${last}` }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(count('drawn-count')).toBe('1');
    expect(count('remaining-count')).toBe('89');

    await user.click(screen.getByRole('button', { name: /nueva partida/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /no, volver/i }));
    expect(count('drawn-count')).toBe('1');
    await user.click(screen.getByRole('button', { name: /nueva partida/i }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /sí, empezar de nuevo/i }));
    expect(count('drawn-count')).toBe('0');
    expect(screen.getByTestId('status')).toHaveTextContent('Lista para empezar');
    expect(loadGame().game?.draws).toHaveLength(0);
  });

  it('Escape cancela una confirmación', async () => {
    const user = setup();
    await draw(user);
    await user.click(screen.getByRole('button', { name: /deshacer/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(count('drawn-count')).toBe('1');
  });

  it('un doble clic rápido saca un solo número', async () => {
    const user = setup();
    await user.dblClick(screen.getByRole('button', { name: /sacar número/i }));
    expect(count('drawn-count')).toBe('1');
    await settle();
  });

  it('al salir el último número muestra el mensaje de fin y deshabilita el botón', async () => {
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ schema: 1, range: { min: 1, max: 5 }, draws: [1, 2, 3, 4].map((n) => ({ number: n, at: n })), startedAt: 1 }),
    );
    const user = setup();
    await draw(user);
    expect(screen.getByTestId('finished-banner')).toHaveTextContent('El sorteo terminó');
    expect(screen.getByTestId('current-number').dataset.number).toBe('5');
    const btn = screen.getByRole('button', { name: /sorteo terminado/i });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(count('drawn-count')).toBe('5');
  });

  it('recupera la partida guardada al cargar', () => {
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 42, at: 1 }, { number: 7, at: 2 }], startedAt: 1 }),
    );
    setup();
    expect(screen.getByTestId('current-number').dataset.number).toBe('7');
    expect(count('drawn-count')).toBe('2');
  });

  it('partida corrupta: avisa y arranca una nueva', () => {
    localStorage.setItem(GAME_KEY, 'basura');
    setup();
    expect(screen.getByTestId('storage-warning')).toHaveTextContent('dañada');
    expect(count('drawn-count')).toBe('0');
  });

  it('la firma by Código Austral aparece en la pantalla principal', () => {
    setup();
    expect(screen.getByTestId('brand-credit')).toHaveTextContent('by Código Austral · 2026');
  });

  it('modo proyector: se abre, muestra el número y sale con Escape', async () => {
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ schema: 1, range: { min: 1, max: 90 }, draws: [{ number: 42, at: 1 }], startedAt: 1 }),
    );
    const user = setup();
    await user.click(screen.getByRole('button', { name: /modo proyector/i }));
    const proj = screen.getByTestId('projector');
    expect(within(proj).getByTestId('projector-number').dataset.number).toBe('42');
    expect(within(proj).getByTestId('projector-count')).toHaveTextContent('Sorteados 1 de 90');
    expect(within(proj).getByTestId('brand-credit')).toHaveTextContent('by Código Austral · 2026');
    expect(window.location.hash).toBe('#proyector');
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('projector')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('');
  });
});

/** Partida donde el único número que falta es el 36 (rango 27..36 con 27..35 ya sorteados). */
const only36 = () => ({
  schema: 1,
  range: { min: 27, max: 36 },
  draws: Array.from({ length: 9 }, (_, i) => ({ number: 27 + i, at: i + 1 })),
  startedAt: 1,
});

describe('App: voz', () => {
  it('con la voz activada anuncia el número en palabras', async () => {
    installSpeech();
    const user = setup();
    await draw(user);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatch(/^¡Salió el número [a-záéíóú ]+! [A-ZÁÉÍÓÚ][a-záéíóú, ]+\.$/);
  });

  it('al salir el 36 dice el número y lo repite cifra por cifra', async () => {
    installSpeech();
    localStorage.setItem(GAME_KEY, JSON.stringify(only36()));
    const user = setup();
    await draw(user);
    expect(spoken).toEqual(['¡Salió el número treinta y seis! Tres, seis.']);
  });

  it('con "repetir cifra por cifra" apagado dice solo el número', async () => {
    installSpeech();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ repeatDigits: false }));
    localStorage.setItem(GAME_KEY, JSON.stringify(only36()));
    const user = setup();
    await draw(user);
    expect(spoken).toEqual(['¡Salió el número treinta y seis!']);
  });

  it('con la voz desactivada no llama a speechSynthesis', async () => {
    const synth = installSpeech();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ voiceEnabled: false }));
    const user = setup();
    await draw(user);
    expect(synth.speak).not.toHaveBeenCalled();
    expect(count('drawn-count')).toBe('1');
  });

  it('si speechSynthesis falla o no existe, el sorteo sigue funcionando', async () => {
    const synth = installSpeech();
    synth.speak.mockImplementation(() => {
      throw new Error('boom');
    });
    const user = setup();
    await draw(user);
    expect(count('drawn-count')).toBe('1');
  });

  it('sin speechSynthesis: avisa en Ajustes y sortea igual', async () => {
    removeSpeech();
    const user = setup();
    await draw(user);
    expect(count('drawn-count')).toBe('1');
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    expect(screen.getByText(/no puede leer en voz alta/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /leer los números/i })).toBeDisabled();
  });
});

describe('App: ajustes', () => {
  it('guarda los cambios de ajustes', async () => {
    installSpeech();
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    await user.click(screen.getByRole('switch', { name: /sonidos/i }));
    await user.click(screen.getByRole('switch', { name: /animaciones/i }));
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)!);
    expect(saved).toMatchObject({ soundEnabled: false, animationsEnabled: false, voiceEnabled: true });
  });

  it('cambiar el rango sin partida en curso se aplica directo', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    const hasta = screen.getByLabelText('Hasta');
    await user.clear(hasta);
    await user.type(hasta, '75');
    await user.click(screen.getByRole('button', { name: /aplicar rango/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(loadGame().game?.range).toEqual({ min: 1, max: 75 });
  });

  it('cambiar el rango con partida en curso pide confirmación y explica la partida nueva', async () => {
    const user = setup();
    await draw(user);
    await draw(user);
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    const hasta = screen.getByLabelText('Hasta');
    await user.clear(hasta);
    await user.type(hasta, '50');
    await user.click(screen.getByRole('button', { name: /aplicar rango/i }));

    let dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Para cambiar el rango hay que empezar una partida nueva');
    expect(dialog).toHaveTextContent('Se borran los 2 números sorteados');
    // Cancelar no cambia nada.
    await user.click(within(dialog).getByRole('button', { name: /no, volver/i }));
    expect(loadGame().game?.range).toEqual({ min: 1, max: 90 });
    expect(loadGame().game?.draws).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /aplicar rango/i }));
    dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /sí, cambiar el rango/i }));
    expect(loadGame().game).toMatchObject({ range: { min: 1, max: 50 }, draws: [] });
    await user.click(screen.getByRole('button', { name: /sorteo/i }));
    expect(count('remaining-count')).toBe('50');
    expect(count('drawn-count')).toBe('0');
  });

  it.each([
    ['1', '3', /al menos 5 números/],
    ['1', '1000', /no puede ser mayor que 999/],
    ['40', '10', /mayor que el inicial/],
  ])('rango inválido %s-%s muestra un mensaje y no cambia nada', async (desde, hasta, msg) => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: /ajustes/i }));
    const d = screen.getByLabelText('Desde');
    const h = screen.getByLabelText('Hasta');
    await user.clear(d);
    await user.type(d, desde);
    await user.clear(h);
    await user.type(h, hasta);
    await user.click(screen.getByRole('button', { name: /aplicar rango/i }));
    expect(screen.getByText(msg)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
