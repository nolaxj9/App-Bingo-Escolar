import { useCallback, useState } from 'react';
import type { Settings } from '../types/bingo';
import { loadSettings, sanitizeSettings, saveSettings } from '../services/persistence';

/** Ajustes persistidos. `update` fusiona un cambio parcial, lo sanea y lo guarda al instante. */
export function useSettings(): [Settings, (partial: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((partial: Partial<Settings>) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...partial });
      saveSettings(next); // si falla, los ajustes siguen valiendo en memoria
      return next;
    });
  }, []);
  return [settings, update];
}
