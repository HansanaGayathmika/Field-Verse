import { useId, type ReactNode } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CROPS, type CropId } from '../config/crops';
import { monthName } from '../i18n';

/**
 * Large-tap-target form controls (mobile first). They are real radio / checkbox inputs, so they work
 * with keyboards and screen readers; the visible card is the <label>.
 */

export function Question({ label, help, error, children, id }: { label: string; help?: ReactNode; error?: string | null; children: ReactNode; id?: string }) {
  const helpId = useId();
  return (
    <fieldset className="space-y-3" id={id} aria-describedby={help ? helpId : undefined} data-testid={id ? `q-${id}` : undefined}>
      <legend className="text-lg font-semibold text-forest-900 sm:text-xl">{label}</legend>
      {help ? (
        <p id={helpId} className="-mt-1 text-sm text-ink-muted">
          {help}
        </p>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-critical">
          <AlertCircle className="size-4" aria-hidden /> {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export type Option<T> = { value: T; label: string; icon?: string | null; muted?: boolean };

/** One-of-many choice shown as tappable cards. `value === undefined` means not answered yet. */
export function Choice<T extends string | number | null>({
  options,
  value,
  onChange,
  columns = 1,
  testId,
}: {
  options: Option<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
  columns?: 1 | 2 | 3 | 4 | 6;
  testId?: string;
}) {
  const name = useId();
  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'grid-cols-2 sm:grid-cols-3',
        columns === 4 && 'grid-cols-2 sm:grid-cols-4',
        columns === 6 && 'grid-cols-3 sm:grid-cols-6',
      )}
    >
      {options.map((o, i) => {
        const checked = value !== undefined && value === o.value;
        return (
          <label
            key={i}
            className={cn(
              'relative flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 text-[0.95rem] font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500',
              checked ? 'border-emerald-600 bg-emerald-100 text-emerald-700' : 'border-forest-900/15 hover:border-forest-900/35',
              o.muted && !checked && 'text-ink-muted',
            )}
            data-testid={testId ? `${testId}-${o.value === null ? 'null' : o.value}` : undefined}
          >
            <input type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(o.value)} />
            {o.icon ? <img src={o.icon} alt="" className="size-8 shrink-0 rounded-lg bg-cream-100" /> : null}
            <span className="flex-1">{o.label}</span>
            {checked ? <Check className="size-4 shrink-0" aria-hidden /> : null}
          </label>
        );
      })}
    </div>
  );
}

/** Months 1–12 as a grid, plus any extra answers ("Already harvested", "I do not know"). */
export function MonthChoice<E extends string | null>({
  value,
  onChange,
  extras,
  testId,
}: {
  value: number | E | undefined;
  onChange: (v: number | E) => void;
  extras: Option<E>[];
  testId?: string;
}) {
  const months: Option<number>[] = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName(i + 1, 'short') }));
  return (
    <div className="space-y-2">
      <Choice<number | E> options={months as Option<number | E>[]} value={value} onChange={onChange} columns={6} testId={testId} />
      <Choice<number | E> options={extras as Option<number | E>[]} value={value} onChange={onChange} columns={2} testId={testId} />
    </div>
  );
}

/** Crop answer: every crop from the config, plus extra answers (fallow / other / unknown). */
export function CropChoice<E extends string>({
  value,
  onChange,
  extras,
  testId,
}: {
  value: CropId | E | undefined;
  onChange: (v: CropId | E) => void;
  extras: Option<E>[];
  testId?: string;
}) {
  const crops: Option<CropId>[] = CROPS.map((c) => ({ value: c.id, label: c.name, icon: c.icon }));
  return (
    <div className="space-y-2">
      <Choice<CropId | E> options={crops as Option<CropId | E>[]} value={value} onChange={onChange} columns={2} testId={testId} />
      <Choice<CropId | E> options={extras as Option<CropId | E>[]} value={value} onChange={onChange} columns={3} testId={testId} />
    </div>
  );
}

/** Many-of-many crop selection (excluded crops). */
export function CropMultiSelect({ value, onChange }: { value: CropId[]; onChange: (v: CropId[]) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CROPS.map((c) => {
        const checked = value.includes(c.id);
        return (
          <label
            key={c.id}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 font-medium transition-colors',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500',
              checked ? 'border-critical/60 bg-[#fdf1ef] text-critical' : 'border-forest-900/15 hover:border-forest-900/35',
            )}
            data-testid={`exclude-${c.id}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => onChange(checked ? value.filter((x) => x !== c.id) : [...value, c.id])}
            />
            {c.icon ? <img src={c.icon} alt="" className="size-8 shrink-0 rounded-lg bg-cream-100" /> : null}
            <span className="flex-1">{c.name}</span>
            <span
              className={cn('grid size-5 place-items-center rounded border', checked ? 'border-critical bg-critical text-white' : 'border-forest-900/30')}
              aria-hidden
            >
              {checked ? <Check className="size-3.5" /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** A 4-level importance scale for one goal. */
export function PriorityScale<P extends string>({
  label,
  levels,
  value,
  onChange,
  testId,
}: {
  label: string;
  levels: { value: P; label: string }[];
  value: P;
  onChange: (v: P) => void;
  testId: string;
}) {
  const name = useId();
  return (
    <fieldset className="rounded-2xl border border-forest-900/10 bg-white p-4" data-testid={testId}>
      <legend className="sr-only">{label}</legend>
      <p className="mb-3 font-semibold text-forest-900" aria-hidden>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {levels.map((l) => {
          const checked = value === l.value;
          return (
            <label
              key={l.value}
              className={cn(
                'flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center text-sm font-semibold transition-colors',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-emerald-500',
                checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-forest-900/15 bg-white text-forest-900 hover:border-forest-900/35',
              )}
              data-testid={`${testId}-${l.value}`}
            >
              <input type="radio" name={name} className="sr-only" checked={checked} onChange={() => onChange(l.value)} />
              {l.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
