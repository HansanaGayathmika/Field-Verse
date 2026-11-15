import { useEffect, useId, useState } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';
import { MascotArt, MASCOT_VIEWBOX, type MascotVariant } from './MascotArt';
import './mascot.css';

export type MascotMood = 'idle' | 'look' | 'shake' | 'cheer';

/**
 * Optional raster art. Leave as null to use the built-in SVG characters (full face/arm animation).
 * To use your own transparent PNG/WebP instead, put the file in apps/web/public/assets/characters/
 * and set the path here, e.g. '/assets/characters/farmer.webp'. Raster art gets whole-body motion only.
 */
export const MASCOT_IMAGES: Record<MascotVariant, string | null> = {
  farmer: null,
  astronaut: null,
};

export const MASCOT_ALT: Record<MascotVariant, string> = {
  farmer: 'Farmer mascot',
  astronaut: 'Farmer mascot in astronaut suit',
};

export function FarmerMascot({ variant = 'farmer', mood = 'idle', className }: { variant?: MascotVariant; mood?: MascotMood; className?: string }) {
  const { calmMotion } = usePreferences();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const classes = cn(`is-${mood}`, variant === 'astronaut' && 'is-astronaut', calmMotion && 'fv-mascot--still');
  const img = MASCOT_IMAGES[variant];
  if (img) return <img src={img} alt={MASCOT_ALT[variant]} className={cn('fv-mascot-img', classes, className)} draggable={false} />;
  return (
    <svg viewBox={MASCOT_VIEWBOX} role="img" aria-label={MASCOT_ALT[variant]} className={cn('fv-mascot h-auto w-full', classes, className)} data-mood={mood}>
      <MascotArt variant={variant} idSuffix={uid} />
    </svg>
  );
}

/**
 * Plays the ~1 s "suit up" change from farmer to farmer-astronaut, then stays as the floating
 * astronaut. With reduced / calm motion it shows the astronaut straight away.
 */
export function SuitUpMascot({ play, className }: { play: boolean; className?: string }) {
  const { calmMotion } = usePreferences();
  const [phase, setPhase] = useState<'suiting' | 'done'>(play && !calmMotion ? 'suiting' : 'done');
  useEffect(() => {
    if (phase !== 'suiting') return;
    const t = window.setTimeout(() => setPhase('done'), 1100);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === 'done') return <FarmerMascot variant="astronaut" className={className} />;
  return (
    <div className={cn('fv-suitup', className)} data-testid="mascot-suitup">
      <div className="fv-suitup-farmer" aria-hidden>
        <FarmerMascot variant="farmer" mood="cheer" />
      </div>
      <div className="fv-suitup-astro">
        <FarmerMascot variant="astronaut" />
      </div>
      <span className="fv-suitup-flash" aria-hidden />
    </div>
  );
}

const JUST_SIGNED_IN = 'fv-just-signed-in';

/** Called after a successful log in / sign up so the home page can play the suit-up once. */
export function markJustSignedIn(mode: 'login' | 'register') {
  try {
    sessionStorage.setItem(JUST_SIGNED_IN, mode);
  } catch {
    /* storage unavailable — the welcome banner simply shows without the transition */
  }
}

/** Reads (and then clears) the one-time "just signed in" flag. */
export function useJustSignedIn(): 'login' | 'register' | null {
  const [value] = useState<'login' | 'register' | null>(() => {
    try {
      const v = sessionStorage.getItem(JUST_SIGNED_IN);
      return v === 'login' || v === 'register' ? v : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem(JUST_SIGNED_IN);
    } catch {
      /* ignore */
    }
  }, []);
  return value;
}
