import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatNumber } from '@/lib/utils';

/**
 * Animated number: counts up from 0 to `value` (ease-out, ~1.2 s) the first time it scrolls into view.
 * - Always ends on the exact value, formatted with the same digits as the static number.
 * - Screen readers get the final value immediately (the moving digits are hidden from them).
 * - With reduced motion / calm mode / low bandwidth the final value is shown straight away.
 */
export function CountUp({
  value,
  digits = 0,
  suffix = '',
  duration = 1200,
  className,
}: {
  value: number;
  digits?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const { calmMotion } = usePreferences();
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(calmMotion ? value : 0);
  const finalText = `${formatNumber(value, 'en', digits)}${suffix}`;

  useEffect(() => {
    if (calmMotion) {
      setShown(value);
      return;
    }
    const el = ref.current;
    let frame = 0;
    let started = false;
    const run = () => {
      started = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - (1 - p) ** 3;
        setShown(p === 1 ? value : value * eased);
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    if (!el || typeof IntersectionObserver === 'undefined') {
      run();
      return () => cancelAnimationFrame(frame);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration, calmMotion]);

  return (
    <span ref={ref} className={className}>
      <span className="sr-only">{finalText}</span>
      <span aria-hidden>
        {formatNumber(shown, 'en', digits)}
        {suffix}
      </span>
    </span>
  );
}
