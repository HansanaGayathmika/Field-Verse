import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { FarmerMascot } from './FarmerMascot';

const HEARTS = ['💚', '🌱', '💛', '🌾', '💜'];

/**
 * The FieldVerse farmer-astronaut in the bottom-right corner of every page (except the home and
 * login pages, which have their own big mascot).
 * - No speech bubble. Blinks and waves on its own, and does a little hop every few seconds.
 * - Tap it and it cheers and floats a few hearts and sprouts.
 * - Only the farmer itself takes clicks; the rest of the corner passes them through.
 * - From tablet width up so it never covers content on phones; hidden when printing.
 * - Calm mode / reduced motion: it stays still.
 */
export function CornerAstronaut() {
  const { calmMotion } = usePreferences();
  const [cheer, setCheer] = useState(false);
  const [burst, setBurst] = useState(0);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const poke = () => {
    setCheer(true);
    setBurst((b) => b + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCheer(false), 1600);
  };

  return (
    <div className="no-print pointer-events-none fixed bottom-3 right-3 z-[850] hidden w-32 md:block lg:bottom-4 lg:right-4 lg:w-44 2xl:w-52" data-testid="corner-astronaut">
      <AnimatePresence>
        {burst > 0 && !calmMotion
          ? HEARTS.map((h, i) => (
              <motion.span
                key={`${burst}-${i}`}
                aria-hidden
                className="absolute left-1/2 top-[18%] text-xl"
                initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], x: (i - 2) * 22, y: -70 - (i % 2) * 22, scale: 1.1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.3, ease: 'easeOut', delay: i * 0.06 }}
              >
                {h}
              </motion.span>
            ))
          : null}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={poke}
        aria-label="Say hi to the FieldVerse farmer"
        className="pointer-events-auto block w-full cursor-pointer rounded-full focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-emerald-500"
        animate={calmMotion ? undefined : { y: [0, 0, -14, 0, -5, 0], rotate: [0, 0, -4, 3, 0, 0] }}
        transition={calmMotion ? undefined : { duration: 1.4, repeat: Infinity, repeatDelay: 6, ease: 'easeOut' }}
        whileHover={calmMotion ? undefined : { scale: 1.05, rotate: -3 }}
        whileTap={calmMotion ? undefined : { scale: 0.92 }}
      >
        <FarmerMascot variant="astronaut" mood={cheer ? 'cheer' : 'idle'} className="drop-shadow-[0_10px_18px_rgb(15_42_34/0.22)]" />
      </motion.button>
    </div>
  );
}
