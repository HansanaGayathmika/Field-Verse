import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, Satellite } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Button } from '@/components/ui/button';
import { cn, monthName } from '@/lib/utils';

/**
 * Real satellite video: 12 monthly NASA GIBS MODIS NDVI frames (2024) rendered with ffmpeg
 * by scripts/prepare-demo-data.mjs. Month label is synced with the video time.
 * Low-bandwidth mode shows only the poster; reduced motion disables autoplay.
 */
export function NdviTimelapse({
  webm,
  mp4,
  poster,
  fps,
  year,
  title,
  className,
  showLegend = true,
}: {
  webm?: string | null;
  mp4?: string | null;
  poster?: string | null;
  fps: number;
  year: number;
  title: string;
  className?: string;
  showLegend?: boolean;
}) {
  const { lowBandwidth, calmMotion } = usePreferences();
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [month, setMonth] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || lowBandwidth) return;
    const onTime = () => setMonth(Math.min(12, Math.floor(v.currentTime * fps) + 1));
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    if (!calmMotion) v.play().catch(() => undefined);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [fps, lowBandwidth, calmMotion]);

  const seek = (m: number) => {
    const v = ref.current;
    if (!v) return;
    const target = ((m + 11) % 12) + 1;
    v.pause();
    v.currentTime = (target - 1) / fps + 0.05;
    setMonth(target);
  };

  const showVideo = !lowBandwidth && !failed && (webm || mp4);

  return (
    <figure className={cn('overflow-hidden rounded-2xl bg-forest-950 text-cream-50', className)}>
      <div className="relative aspect-square w-full">
        {showVideo ? (
          <video
            ref={ref}
            className="absolute inset-0 size-full object-cover"
            poster={poster ?? undefined}
            muted
            loop
            playsInline
            preload={calmMotion ? 'none' : 'metadata'}
            aria-label={`${title}: satellite vegetation timelapse for ${year}, one frame per month`}
            onError={() => setFailed(true)}
          >
            {webm ? <source src={webm} type="video/webm" /> : null}
            {mp4 ? <source src={mp4} type="video/mp4" /> : null}
          </video>
        ) : poster ? (
          <img src={poster} alt={`${title}: satellite vegetation map (July ${year})`} className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-cream-50/70">Satellite imagery not available</div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-forest-950/75 px-3 py-1 text-xs font-semibold">
          <Satellite className="size-3.5" aria-hidden /> NASA satellite · {showVideo ? `${monthName(month, 'en', 'long')} ${year}` : `July ${year}`}
        </div>
        {/* centre marker = demo point */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow" aria-hidden />
      </div>
      <figcaption className="space-y-2 p-3 text-xs">
        {showVideo ? (
          <div className="flex items-center gap-1">
            <Button variant="outlineLight" size="icon" className="size-9" onClick={() => seek(month - 1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button
              variant="outlineLight"
              size="icon"
              className="size-9"
              onClick={() => (playing ? ref.current?.pause() : ref.current?.play())}
              aria-label={playing ? 'Pause timelapse' : 'Play timelapse'}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button variant="outlineLight" size="icon" className="size-9" onClick={() => seek(month + 1)} aria-label="Next month">
              <ChevronRight />
            </Button>
            <div className="ml-2 flex flex-1 gap-0.5" aria-hidden>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className={cn('h-1.5 flex-1 rounded-full', i + 1 <= month ? 'bg-gold-500' : 'bg-cream-50/20')} />
              ))}
            </div>
          </div>
        ) : null}
        {showLegend ? (
          <div className="flex items-center gap-2">
            <span>Bare</span>
            <span className="h-2 flex-1 rounded-full" style={{ background: 'linear-gradient(90deg,#d9cbb0,#b8c47a,#6fae3c,#2f8a1d,#0c5a0c)' }} aria-hidden />
            <span>Dense green plants</span>
          </div>
        ) : null}
        <p className="text-cream-50/70">
          Imagery: NASA GIBS / MODIS Terra NDVI (monthly), part of NASA&apos;s ESDIS. About 160 km across; the ring marks the demo location.
        </p>
      </figcaption>
    </figure>
  );
}
