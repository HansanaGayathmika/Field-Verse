import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Hand, RotateCcw, Send, Trash2 } from 'lucide-react';
import { CROP_SPECIFIC_CONSTRAINTS, type ConstraintResult, type ConstraintType, type FarmerConstraint } from '@fieldverse/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFarm } from '@/contexts/FarmContext';
import { useCropMap } from '@/hooks/queries';
import { cropLabel } from '@/components/CropVisual';

const TYPES: ConstraintType[] = ['no_irrigation', 'seeds_unavailable', 'soil_floods', 'cannot_sell', 'lacks_equipment', 'crop_failed_before'];

/**
 * Farmer's Right to Disagree. Corrections are stored in the farm profile, sent to Express,
 * and forwarded to the active analysis provider. We display exactly what the provider
 * says it did with each correction (rule / model / not supported).
 */
export function DisagreePanel({ cropIds, results, isUpdating }: { cropIds: string[]; results: ConstraintResult[]; isUpdating: boolean }) {
  const { t } = useTranslation();
  const { farm, updateFarm } = useFarm();
  const { map } = useCropMap();
  const [type, setType] = useState<ConstraintType>('no_irrigation');
  const [cropId, setCropId] = useState<string>(cropIds[0] ?? '');
  const [note, setNote] = useState('');
  const constraints = farm?.constraints ?? [];
  const needsCrop = CROP_SPECIFIC_CONSTRAINTS.includes(type);

  const add = () => {
    const c: FarmerConstraint = { type, cropId: needsCrop ? cropId : null, note: note.trim() || null };
    const exists = constraints.some((x) => x.type === c.type && (x.cropId ?? null) === (c.cropId ?? null));
    if (!exists) updateFarm({ constraints: [...constraints, c] });
    setNote('');
  };

  const describe = (c: FarmerConstraint) => `${t(`constraints.${c.type}`)}${c.cropId ? `: ${cropLabel(map, c.cropId)}` : ''}`;

  return (
    <section className="rounded-3xl border-2 border-dashed border-forest-900/20 bg-cream-50 p-5 sm:p-6" aria-labelledby="disagree-title" data-testid="disagree-panel">
      <div className="flex items-start gap-3">
        <Hand className="size-8 shrink-0 text-gold-600" aria-hidden />
        <div>
          <h2 id="disagree-title" className="text-2xl">
            {t('constraints.title')}
          </h2>
          <p className="text-ink-muted">{t('constraints.intro')}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[1.4fr_1fr_1.4fr_auto] md:items-end">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          What does not fit?
          <select className="h-12 rounded-xl border border-forest-900/20 bg-white px-3 font-normal" value={type} onChange={(e) => setType(e.target.value as ConstraintType)}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`constraints.${x}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('constraints.whichCrop')}
          <select className="h-12 rounded-xl border border-forest-900/20 bg-white px-3 font-normal disabled:opacity-50" value={cropId} onChange={(e) => setCropId(e.target.value)} disabled={!needsCrop}>
            {cropIds.map((c) => (
              <option key={c} value={c}>
                {cropLabel(map, c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Note (optional)
          <input className="h-12 rounded-xl border border-forest-900/20 bg-white px-3 font-normal" maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. the canal is closed in Yala" />
        </label>
        <Button size="lg" onClick={add} disabled={isUpdating} data-testid="add-constraint">
          <Send aria-hidden /> {t('constraints.apply')}
        </Button>
      </div>

      {constraints.length ? (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-sans text-sm font-bold uppercase tracking-wide text-ink-muted">Your corrections and what happened</h3>
            <Button variant="ghost" size="sm" onClick={() => updateFarm({ constraints: [] })}>
              <RotateCcw aria-hidden /> {t('constraints.clear')}
            </Button>
          </div>
          <ul className="mt-2 space-y-2" aria-live="polite">
            {constraints.map((c, i) => {
              const r = results.find((x) => x.constraint.type === c.type && (x.constraint.cropId ?? null) === (c.cropId ?? null));
              return (
                <li key={i} className="flex flex-wrap items-start gap-3 rounded-xl bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{describe(c)}</p>
                    {c.note ? <p className="text-sm text-ink-muted">“{c.note}”</p> : null}
                    <p className="mt-1 text-sm">{isUpdating ? 'Updating…' : (r?.message ?? 'Sent with the next update.')}</p>
                  </div>
                  {r ? (
                    <Badge variant={r.handling === 'model' ? 'dark' : r.handling === 'rule' ? 'sky' : 'warning'}>
                      {r.handling === 'model' ? 'Recalculated by model' : r.handling === 'rule' ? 'Applied as a simple rule' : 'Not assessed yet — needs ML or an expert'}
                    </Badge>
                  ) : null}
                  <Button variant="ghost" size="icon" className="size-9" aria-label={`Remove: ${describe(c)}`} onClick={() => updateFarm({ constraints: constraints.filter((_, j) => j !== i) })}>
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
