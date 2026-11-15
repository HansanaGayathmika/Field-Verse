import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb, Table2 } from 'lucide-react';
import type { SourceType } from '@fieldverse/contracts';
import { Card } from '@/components/ui/card';
import { ProvenanceBadge } from '@/components/Provenance';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Every chart in FieldVerse: title, unit, source + period, farmer takeaway,
 * accessible description, and a data-table alternative.
 */
export function ChartCard({
  title,
  question,
  unit,
  sourceName,
  sourceType,
  period,
  takeaway,
  description,
  table,
  children,
  className,
  footer,
}: {
  title: string;
  question?: string;
  unit?: string;
  sourceName: string;
  sourceType: SourceType;
  period?: string | null;
  takeaway?: ReactNode;
  description: string;
  table?: ChartTable;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const [showTable, setShowTable] = useState(false);
  const descId = useId();
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-2 sm:px-6">
        <div className="min-w-0">
          {question ? <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{question}</p> : null}
          <h3 className="text-lg font-semibold">
            {title}
            {unit ? <span className="ml-1.5 font-sans text-sm font-medium text-ink-muted">({unit})</span> : null}
          </h3>
        </div>
        <ProvenanceBadge type={sourceType} />
      </div>
      {takeaway ? (
        <div className="mx-5 mb-2 flex gap-2 rounded-xl bg-sage-100 p-3 text-[0.95rem] text-forest-900 sm:mx-6">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-gold-600" aria-hidden />
          <div>{takeaway}</div>
        </div>
      ) : null}
      <figure className="px-2 sm:px-4" aria-describedby={descId}>
        <div role="img" aria-label={title} aria-describedby={descId}>
          {children}
        </div>
        <figcaption id={descId} className="sr-only">
          {description}
        </figcaption>
      </figure>
      {showTable && table ? (
        <div className="mx-5 mb-3 max-h-72 overflow-auto rounded-lg border border-forest-900/10 sm:mx-6">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} data</caption>
            <thead className="sticky top-0 bg-cream-100">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-forest-900/5">
                  {r.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-forest-900/5 px-5 py-3 text-xs text-ink-muted sm:px-6">
        <span>
          {t('common.source')}: {sourceName}
          {period ? ` · ${t('common.period')}: ${period}` : ''}
        </span>
        {table ? (
          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
            <Table2 aria-hidden /> {showTable ? t('common.hideTable') : t('common.showTable')}
          </Button>
        ) : null}
      </div>
      {footer}
    </Card>
  );
}
