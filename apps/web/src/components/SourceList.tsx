import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, BookOpenCheck, ChevronDown, ExternalLink, Info } from 'lucide-react';
import type { SourceRef } from '@fieldverse/contracts';
import { ProvenanceBadge } from '@/components/Provenance';
import { cn, formatDate } from '@/lib/utils';

type Panel = 'limits' | 'sources' | null;

/**
 * "Limitations" and "Scientific evidence" as two bright buttons. Each opens its own panel underneath
 * (one at a time), so the honest small print is easy to find but doesn't crowd the results.
 */
export function SourceList({
  sources,
  limitations,
  mode,
  modelVersion,
  generatedAt,
  requestId,
  disclaimer,
}: {
  sources: SourceRef[];
  limitations?: string[];
  mode?: string;
  modelVersion?: string | null;
  generatedAt?: string;
  requestId?: string;
  disclaimer?: string;
}) {
  const [open, setOpen] = useState<Panel>(null);
  const id = useId();
  const toggle = (p: Exclude<Panel, null>) => setOpen((o) => (o === p ? null : p));

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {limitations?.length ? (
          <PanelButton
            active={open === 'limits'}
            onClick={() => toggle('limits')}
            controls={`${id}-limits`}
            icon={AlertTriangle}
            title="Limitations of these results"
            hint="What these results can and cannot tell you"
            count={limitations.length}
            tone="from-[#d9661f] via-[#c95418] to-[#b03f17]"
            testId="limits-button"
          />
        ) : null}
        <PanelButton
          active={open === 'sources'}
          onClick={() => toggle('sources')}
          controls={`${id}-sources`}
          icon={BookOpenCheck}
          title="Scientific evidence & data sources"
          hint="Where every number comes from"
          count={sources.length}
          tone="from-[#11806f] via-[#156e9e] to-[#3550b8]"
          testId="sources-button"
        />
      </div>

      <AnimatePresence initial={false}>
        {open === 'limits' && limitations?.length ? (
          <motion.div
            key="limits"
            id={`${id}-limits`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-2xl border-2 border-[#f5b25a] bg-gradient-to-br from-[#fff8ec] to-[#ffefd6] p-4 sm:p-5"
          >
            <ol className="grid gap-2.5 md:grid-cols-2">
              {limitations.map((l, i) => (
                <li key={l} className="flex gap-3 rounded-xl bg-white/80 p-3 text-[0.95rem] leading-relaxed text-[#3b2a10] shadow-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#ffb547] to-[#e8742c] text-sm font-bold text-white">{i + 1}</span>
                  <span>{l}</span>
                </li>
              ))}
            </ol>
          </motion.div>
        ) : null}

        {open === 'sources' ? (
          <motion.div
            key="sources"
            id={`${id}-sources`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-3 rounded-2xl border-2 border-[#7cc3e6] bg-gradient-to-br from-[#eef8fd] to-[#e3f0fb] p-4 sm:p-5"
          >
            {disclaimer ? (
              <p className="mb-3 flex gap-2 rounded-xl bg-white/80 p-3 text-sm text-[#1c3f5c]">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {disclaimer}
              </p>
            ) : null}
            {mode ? (
              <dl className="mb-4 flex flex-wrap gap-2 text-sm">
                <Chip label="Analysis" value={mode === 'demo' ? 'Demo (illustrative, no ML)' : 'Roots of Tomorrow engine'} />
                <Chip label="Model" value={modelVersion ?? 'none (no model used)'} />
                {generatedAt ? <Chip label="Generated" value={formatDate(generatedAt)} /> : null}
                {requestId ? <Chip label="Reference" value={requestId.slice(0, 8)} mono /> : null}
              </dl>
            ) : null}
            <ul className="grid gap-3 md:grid-cols-2">
              {sources.map((s) => (
                <li key={s.id} className="rounded-xl border-l-4 border-[#1f8fc2] bg-white/85 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-forest-900">{s.name}</p>
                    <ProvenanceBadge type={s.sourceType} />
                  </div>
                  <dl className="mt-1 grid gap-x-4 text-sm text-ink-muted sm:grid-cols-2">
                    {s.provider ? <div>Provider: {s.provider}</div> : null}
                    {s.datasetVersion ? <div>Version: {s.datasetVersion}</div> : null}
                    {s.spatialResolution ? <div>Resolution: {s.spatialResolution}</div> : null}
                    {s.temporalCoverage ? <div>Period: {s.temporalCoverage}</div> : null}
                    {s.retrievedAt ? <div>Retrieved: {formatDate(s.retrievedAt)}</div> : null}
                    {s.license ? <div>Licence: {s.license}</div> : null}
                  </dl>
                  {s.notes ? <p className="mt-1 text-sm">{s.notes}</p> : null}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#1765a3] hover:underline">
                      Open source <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PanelButton({
  active,
  onClick,
  controls,
  icon: Icon,
  title,
  hint,
  count,
  tone,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  controls: string;
  icon: typeof Info;
  title: string;
  hint: string;
  count: number;
  tone: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      aria-controls={controls}
      data-testid={testId}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-gradient-to-r p-4 text-left text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-3 focus-visible:outline-offset-2',
        tone,
        active && 'ring-4 ring-white/70',
      )}
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/25 backdrop-blur-sm">
        <Icon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug">{title}</span>
        <span className="block text-sm text-white/90">{hint}</span>
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-black text-forest-900" aria-label={`${count} items`}>
        {count}
      </span>
      <ChevronDown className={cn('size-5 shrink-0 transition-transform', active && 'rotate-180')} aria-hidden />
    </button>
  );
}

function Chip({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-full bg-white/85 px-3 py-1 shadow-sm">
      <dt className="inline text-ink-muted">{label}: </dt>
      <dd className={cn('inline font-semibold text-forest-900', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}
