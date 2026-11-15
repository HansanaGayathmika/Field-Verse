import { AlertTriangle, Info } from 'lucide-react';
import { useRT } from '../i18n';
import { NO_PLAN_STATUSES, type Goal, type Priority, type Recommendation } from '../types';
import { AdvancedDetails, Callout, ConfidenceBadge, NoPlanState, PlanCard } from './parts';

/**
 * Renders a Recommendation exactly as the engine sent it. Branches on `status` first:
 * ok → plans; provisional → plans + low-confidence banner; no-plan statuses → explanation + crops considered.
 * Debug fields (rule_events, gaez_classes_*, farmer_input_normalised) are only shown in the dev view.
 */
export function Results({
  rec,
  priorities,
  onChangeAnswers,
}: {
  rec: Recommendation;
  priorities?: Partial<Record<Goal, Priority>>;
  onChangeAnswers: () => void;
}) {
  const { t } = useRT();
  const noPlan = NO_PLAN_STATUSES.includes(rec.status) || rec.plans.length === 0;
  const plans = [...rec.plans].sort((a, b) => a.option - b.option);

  return (
    <div className="space-y-6" data-testid="results" data-status={rec.status}>
      {rec.status === 'provisional' ? (
        <div role="status" className="flex gap-3 rounded-2xl border border-warning/40 bg-[#fdf0d5] p-4 sm:p-5" data-testid="provisional-banner">
          <AlertTriangle className="mt-0.5 size-6 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-bold text-warning">{t('results.provisional')}</p>
            {rec.status_note ? <p className="mt-1">{rec.status_note}</p> : null}
          </div>
        </div>
      ) : null}

      <ConfidenceBadge confidence={rec.confidence} />
      <Callout tone="warning" title={t('results.warnings')} items={rec.warnings} testId="warnings" />

      {noPlan ? (
        <NoPlanState rec={rec} onChangeAnswers={onChangeAnswers} />
      ) : (
        <div className="space-y-6" data-testid="plans" data-count={plans.length}>
          {plans.map((p) => (
            <PlanCard key={p.option} plan={p} priorities={priorities} />
          ))}
        </div>
      )}

      <Callout tone="info" title={t('results.assumptions')} items={rec.assumptions} testId="assumptions" />
      <AdvancedDetails site={rec.site_profile} />

      <footer className="space-y-3 rounded-2xl bg-forest-900 p-5 text-cream-50" data-testid="result-footer">
        {rec.disclaimer ? <p className="text-[0.95rem]">{rec.disclaimer}</p> : null}
        {rec.knowledge_base_version ? (
          <p className="flex items-start gap-2 text-xs text-cream-50/75">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              <strong>{t('results.about')}:</strong> {t('results.kbVersion', { version: rec.knowledge_base_version })}
            </span>
          </p>
        ) : null}
      </footer>

      {import.meta.env.DEV ? <DevView rec={rec} /> : null}
    </div>
  );
}

/** Development only: the engine's debug data, never shown to farmers. */
function DevView({ rec }: { rec: Recommendation }) {
  const { t } = useRT();
  const debug = {
    farmer_input_normalised: rec.farmer_input_normalised,
    crops_considered: rec.crops_considered,
    rule_events: rec.plans.map((p) => ({ option: p.option, rule_events: p.rule_events })),
    gaez_classes_by_management: rec.site_profile.gaez_classes_by_management,
    gaez_classes_at_site: rec.plans.map((p) => p.sequence.map((s) => s.gaez_classes_at_site)),
  };
  return (
    <details className="rounded-2xl border border-dashed border-warning/60 bg-[#fdf6e7] p-4 text-xs" data-testid="dev-view">
      <summary className="cursor-pointer font-semibold text-warning">{t('results.devView')}</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(debug, null, 2)}</pre>
    </details>
  );
}
