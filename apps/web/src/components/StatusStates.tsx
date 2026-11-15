import { useTranslation } from 'react-i18next';
import { AlertCircle, FlaskConical, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { ApiRequestError } from '@/services/api';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';

export function LoadingBlock({ label, className, rows = 3 }: { label?: string; className?: string; rows?: number }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className={cn('rounded-2xl border border-forest-900/10 bg-white p-6', className)}>
      <div className="mb-4 flex items-center gap-2 text-ink-muted">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span>{label ?? t('common.loading')}</span>
      </div>
      <div className="space-y-3" aria-hidden>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-cream-200" style={{ width: `${90 - i * 15}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Friendly error with recovery actions. Offers (never silently applies) a labelled demo switch. */
export function ErrorState({ error, onRetry, className, children }: { error: unknown; onRetry?: () => void; className?: string; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const { setForceDemo, forceDemo } = usePreferences();
  const e = error instanceof ApiRequestError ? error : null;
  const code = e?.code ?? 'generic';
  const known = t(`errors.${code}`, { defaultValue: '' });
  const Icon = code === 'NETWORK_ERROR' ? WifiOff : AlertCircle;
  return (
    <div role="alert" className={cn('rounded-2xl border border-critical/25 bg-[#fff6f5] p-5', className)}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 size-6 shrink-0 text-critical" aria-hidden />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-forest-900">{known || t('errors.generic')}</p>
          {e?.message && e.message !== known ? <p className="text-sm text-ink-muted">{e.message}</p> : null}
          {children}
          <div className="flex flex-wrap gap-2 pt-1">
            {onRetry ? (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RefreshCw aria-hidden /> {t('common.retry')}
              </Button>
            ) : null}
            {e?.demoFallbackAvailable && !forceDemo ? (
              <Button size="sm" variant="gold" onClick={() => setForceDemo(true)}>
                <FlaskConical aria-hidden /> {t('errors.useDemo')}
              </Button>
            ) : null}
          </div>
          {e?.requestId ? <p className="text-xs text-ink-muted">Reference: {e.requestId}</p> : null}
        </div>
      </div>
    </div>
  );
}

/** Prominent notice describing the analysis mode of a response. */
export function AnalysisModeNotice({ mode, disclaimer, className }: { mode: 'demo' | 'remote'; modelVersion: string | null; disclaimer?: string; className?: string }) {
  const { t } = useTranslation();
  // Live results need no banner (the model version and disclaimer are in the sources panel); only demo results are flagged.
  if (mode === 'remote') return null;
  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border border-gold-500/50 bg-gold-100 p-4', className)} data-testid="demo-notice">
      <FlaskConical className="mt-0.5 size-5 shrink-0 text-[#6d4f12]" aria-hidden />
      <div>
        <p className="font-semibold text-forest-900">{t('demo.bannerTitle')}</p>
        <p className="text-sm text-[#5c4510]">{disclaimer ?? t('demo.bannerBody')}</p>
        <Link to="/data" className="text-sm font-semibold text-emerald-700 underline underline-offset-2">
          How FieldVerse works with data
        </Link>
      </div>
    </div>
  );
}
