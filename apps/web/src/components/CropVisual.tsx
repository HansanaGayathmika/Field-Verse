import { ArrowRight, Moon, Sprout } from 'lucide-react';
import type { Crop, RotationStep } from '@fieldverse/contracts';
import { cn, MONTHS_SHORT } from '@/lib/utils';
import { useCropMap } from '@/hooks/queries';

/** Crop illustration with a graceful fallback for crops the catalogue doesn't know yet (e.g. new ML crops). */
export function CropImage({ crop, cropId, size = 72, className }: { crop?: Crop | null; cropId: string; size?: number; className?: string }) {
  if (cropId === 'fallow') {
    return (
      <span
        className={cn('grid place-items-center rounded-2xl bg-[#efe6d8] text-soil-500', className)}
        style={{ width: size, height: size }}
        role="img"
        aria-label="Fallow: the field rests with no crop"
      >
        <Moon className="size-1/2" aria-hidden />
      </span>
    );
  }
  if (!crop) {
    // A crop the farmer added that is not in the catalogue yet: generic sprout illustration.
    return (
      <span
        className={cn('grid place-items-center rounded-2xl bg-sage-100 text-emerald-600', className)}
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${humanizeCropId(cropId)} (your crop — no illustration yet)`}
      >
        <Sprout className="size-1/2" aria-hidden />
      </span>
    );
  }
  return (
    <img
      src={crop.image.src}
      alt={crop.image.alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={cn('rounded-2xl bg-sage-100 object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function cropLabel(map: Map<string, Crop>, id: string) {
  if (id === 'fallow') return 'Fallow (rest)';
  return map.get(id)?.names.en ?? humanizeCropId(id);
}

/** Crops the farmer added themselves are stored as slugs ("dragon-fruit" → "Dragon fruit"). */
export function humanizeCropId(id: string) {
  const s = id.replace(/-/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turn a farmer-typed crop name into a valid crop id (slug). */
export function cropIdFromName(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Visual crop sequence: images with season names and months. */
export function CropSequence({ steps, size = 56, compact = false }: { steps: RotationStep[]; size?: number; compact?: boolean }) {
  const { map } = useCropMap();
  return (
    <ol className="flex flex-wrap items-start gap-x-1 gap-y-3" aria-label="Crop sequence">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-1">
          <div className="flex w-[5.5rem] flex-col items-center text-center">
            <CropImage crop={map.get(s.cropId)} cropId={s.cropId} size={size} />
            <span className="mt-1 text-sm font-semibold leading-tight text-forest-900">{cropLabel(map, s.cropId).replace(/\s*\(.*\)/, '')}</span>
            {!compact ? (
              <span className="text-xs leading-tight text-ink-muted">
                {s.season.name}
                <br />
                {MONTHS_SHORT[s.season.startMonth - 1]}–{MONTHS_SHORT[s.season.endMonth - 1]}
              </span>
            ) : null}
          </div>
          {i < steps.length - 1 ? <ArrowRight className="mt-5 size-4 shrink-0 text-forest-900/40" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}
