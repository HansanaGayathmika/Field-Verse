import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { setForceDemoMode } from '@/services/api';

interface Preferences {
  lowBandwidth: boolean;
  setLowBandwidth: (v: boolean) => void;
  /** User explicitly chose to see labelled demo results (e.g. remote service down). */
  forceDemo: boolean;
  setForceDemo: (v: boolean) => void;
  /** True when animations should be minimised (OS setting or low-bandwidth mode). */
  calmMotion: boolean;
}

const Ctx = createContext<Preferences | null>(null);

function readBool(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function writeBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [lowBandwidth, setLow] = useState(() => readBool('fv.lowBandwidth'));
  const [forceDemo, setForce] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    document.documentElement.classList.toggle('low-bandwidth', lowBandwidth);
  }, [lowBandwidth]);
  useEffect(() => setForceDemoMode(forceDemo), [forceDemo]);

  const value = useMemo<Preferences>(
    () => ({
      lowBandwidth,
      setLowBandwidth: (v) => {
        setLow(v);
        writeBool('fv.lowBandwidth', v);
      },
      forceDemo,
      setForceDemo: (v) => {
        setForceDemoMode(v);
        setForce(v);
      },
      calmMotion: !!reduced || lowBandwidth,
    }),
    [lowBandwidth, forceDemo, reduced],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePreferences() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePreferences must be used inside PreferencesProvider');
  return v;
}
