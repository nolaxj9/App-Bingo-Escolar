import { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper, RotateCcw, Undo2 } from 'lucide-react';
import type { NumberRange } from './types/bingo';
import { useBingo } from './hooks/useBingo';
import { useSettings } from './hooks/useSettings';
import { useSpeech } from './hooks/useSpeech';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useToast } from './context/ToastContext';
import { playFinish, playPop, playUndo, unlockAudio } from './services/sound';
import { Header } from './components/Header';
import { TabBar, type View } from './components/TabBar';
import { StorageWarning } from './components/StorageWarning';
import { CurrentNumber } from './components/CurrentNumber';
import { DrawButton } from './components/DrawButton';
import { GameStats } from './components/GameStats';
import { NumberBoard, BoardLegend } from './components/NumberBoard';
import { DrawHistory } from './components/DrawHistory';
import { SettingsPanel } from './components/SettingsPanel';
import { ProjectorView } from './components/ProjectorView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Ball } from './components/Ball';
import { BrandCredit } from './components/BrandCredit';

type Pending = { kind: 'undo' } | { kind: 'reset' } | { kind: 'range'; range: NumberRange } | null;

const PROJECTOR_HASH = '#proyector';

export function App() {
  const [settings, updateSettings] = useSettings();
  const bingo = useBingo({ animationsEnabled: settings.animationsEnabled });
  const speech = useSpeech({ enabled: settings.voiceEnabled, volume: settings.voiceVolume, voiceURI: settings.voiceURI });
  const online = useOnlineStatus();
  const toast = useToast();

  const [view, setView] = useState<View>('sorteo');
  const [projector, setProjector] = useState(() => window.location.hash === PROJECTOR_HASH);
  const [pending, setPending] = useState<Pending>(null);
  const [liveText, setLiveText] = useState('');
  const usedFullscreen = useRef(false);

  const { game, status, current, drawnCount, remaining, total, isDrawing } = bingo;

  const handleDraw = useCallback(() => {
    const n = bingo.draw();
    if (n === null) return;
    unlockAudio();
    if (settings.soundEnabled) {
      if (bingo.remaining - 1 === 0) playFinish();
      else playPop();
    }
    speech.announce(n);
    setLiveText(`Salió el ${n}`);
  }, [bingo, settings.soundEnabled, speech]);

  // ---------- Modo proyector ----------
  const enterProjector = useCallback(() => {
    setProjector(true);
    try {
      window.history.replaceState(null, '', PROJECTOR_HASH);
    } catch {
      /* ignorar */
    }
    try {
      const p = document.documentElement.requestFullscreen?.();
      if (p) {
        usedFullscreen.current = true;
        p.catch(() => {
          usedFullscreen.current = false;
        });
      }
    } catch {
      /* sin pantalla completa: sigue funcionando */
    }
  }, []);

  const exitProjector = useCallback(() => {
    setProjector(false);
    usedFullscreen.current = false;
    try {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    } catch {
      /* ignorar */
    }
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } catch {
      /* ignorar */
    }
  }, []);

  useEffect(() => {
    const onHash = () => setProjector(window.location.hash === PROJECTOR_HASH);
    const onFs = () => {
      // Escape en pantalla completa: el navegador la cierra y nosotros cerramos el proyector.
      if (!document.fullscreenElement && usedFullscreen.current) exitProjector();
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [exitProjector]);

  // ---------- Confirmaciones ----------
  const confirmPending = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'undo') {
      const n = bingo.undo();
      if (n !== null) {
        if (settings.soundEnabled) playUndo();
        toast.success(`Se deshizo el ${n}`);
        setLiveText(`Se deshizo el ${n}`);
      }
    } else if (p.kind === 'reset') {
      bingo.reset();
      toast.success('Empezó una partida nueva');
      setLiveText('Empezó una partida nueva');
    } else {
      bingo.reset(p.range);
      toast.success(`Rango nuevo: del ${p.range.min} al ${p.range.max}`);
      setLiveText('Empezó una partida nueva');
    }
  };

  const applyRange = (range: NumberRange) => {
    if (drawnCount > 0) setPending({ kind: 'range', range });
    else {
      bingo.reset(range);
      toast.success(`Rango nuevo: del ${range.min} al ${range.max}`);
    }
  };

  const previous = game.draws.slice(-6, -1).reverse();
  const lastNumber = current;

  const sorteo = (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col lg:grid lg:grid-cols-2 lg:gap-8 lg:p-6">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-3">
          <CurrentNumber current={current} drawnCount={drawnCount} animations={settings.animationsEnabled} />
          {status === 'finished' && (
            <p
              role="status"
              data-testid="finished-banner"
              className="flex items-center gap-2 rounded-2xl bg-accent-400 px-4 py-3 text-center text-lg font-extrabold text-ink"
            >
              <PartyPopper className="h-7 w-7 shrink-0" aria-hidden="true" />
              ¡Salieron todos los números! El sorteo terminó.
            </p>
          )}
          <GameStats drawn={drawnCount} remaining={remaining} total={total} />
          {previous.length > 0 && (
            <div className="flex items-center gap-2 [@media(max-height:650px)]:hidden" data-testid="previous">
              <span className="text-sm font-bold text-slate-700">Antes:</span>
              <ul className="flex gap-2" aria-label="Números anteriores">
                {previous.map((d) => (
                  <li key={d.number}>
                    <Ball number={d.number} size="44px" />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="sticky bottom-0 flex flex-col gap-2 bg-gradient-to-t from-cream via-cream to-cream/80 px-4 pb-3 pt-2 lg:static lg:bg-none lg:px-4">
          <DrawButton status={status} busy={isDrawing} onDraw={handleDraw} />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary whitespace-nowrap px-2 text-base" disabled={drawnCount === 0} onClick={() => setPending({ kind: 'undo' })}>
              <Undo2 className="h-5 w-5" aria-hidden="true" /> Deshacer
            </button>
            <button type="button" className="btn-secondary whitespace-nowrap px-2 text-base" disabled={drawnCount === 0} onClick={() => setPending({ kind: 'reset' })}>
              <RotateCcw className="h-5 w-5" aria-hidden="true" /> Nueva partida
            </button>
          </div>
          <BrandCredit variant="light" className="[@media(max-height:600px)]:hidden" />
        </div>
      </div>
      <div className="hidden lg:block">
        <div className="card">
          <h2 className="mb-2 font-display text-xl font-extrabold">Tablero</h2>
          <BoardLegend />
          <div className="mt-3">
            <NumberBoard range={game.range} draws={game.draws} />
          </div>
        </div>
      </div>
    </div>
  );

  const tablero = (
    <section aria-labelledby="board-title" className="mx-auto w-full max-w-2xl px-3 py-4">
      <h2 id="board-title" className="mb-2 font-display text-2xl font-extrabold">
        Tablero <span className="num text-slate-600">({drawnCount} de {total})</span>
      </h2>
      <BoardLegend />
      <div className="mt-3">
        <NumberBoard range={game.range} draws={game.draws} />
      </div>
    </section>
  );

  return (
    <div className="flex h-full flex-col">
      {!projector && <Header status={status} online={online} onProjector={enterProjector} />}
      {!projector && <StorageWarning error={bingo.storageError} />}
      {!projector && (
        <main className="min-h-0 flex-1 overflow-y-auto">
          {view === 'sorteo' && sorteo}
          {view === 'tablero' && tablero}
          {view === 'historial' && <DrawHistory game={game} />}
          {view === 'ajustes' && (
            <SettingsPanel
              settings={settings}
              update={updateSettings}
              speech={speech}
              range={game.range}
              drawnCount={drawnCount}
              onApplyRange={applyRange}
              onProjector={enterProjector}
            />
          )}
        </main>
      )}
      {!projector && <TabBar view={view} onChange={setView} />}

      <p aria-live="assertive" className="sr-only" data-testid="live">
        {liveText}
      </p>

      {projector && (
        <ProjectorView
          game={game}
          status={status}
          current={lastNumber}
          total={total}
          animations={settings.animationsEnabled}
          busy={isDrawing}
          onDraw={handleDraw}
          onExit={exitProjector}
        />
      )}

      <ConfirmDialog
        open={pending?.kind === 'undo'}
        title="¿Deshacer el último número?"
        confirmLabel={`Sí, deshacer el ${current ?? ''}`}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        El {current} vuelve a estar disponible y sale de la lista de sorteados.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === 'reset'}
        title="¿Empezar una partida nueva?"
        confirmLabel="Sí, empezar de nuevo"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        Se borran los {drawnCount} números sorteados y el historial. No se puede recuperar.
      </ConfirmDialog>
      <ConfirmDialog
        open={pending?.kind === 'range'}
        title="Cambiar el rango empieza una partida nueva"
        confirmLabel="Sí, cambiar el rango"
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        Para cambiar el rango hay que empezar una partida nueva. Se borran los {drawnCount} números sorteados.
        {pending?.kind === 'range' && ` El nuevo rango va del ${pending.range.min} al ${pending.range.max}.`}
      </ConfirmDialog>
    </div>
  );
}
