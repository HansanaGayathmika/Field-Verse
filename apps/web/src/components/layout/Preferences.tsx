import { useTranslation } from 'react-i18next';
import { Signal } from 'lucide-react';
import { LANGUAGES } from '@/i18n';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Switch, Label } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Display settings: low-bandwidth mode and language. Shown in the mobile menu and on the Account page. */
export function Preferences({ dark }: { dark?: boolean }) {
  const { t, i18n } = useTranslation();
  const { lowBandwidth, setLowBandwidth } = usePreferences();
  return (
    <div className={cn('flex flex-col gap-4 text-sm', dark ? 'text-cream-50' : 'text-forest-900')}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="lowbw" className={cn('flex items-center gap-2', dark && 'text-cream-50')}>
          <Signal className="size-4" aria-hidden /> {t('prefs.lowBandwidth')}
        </Label>
        <Switch id="lowbw" checked={lowBandwidth} onCheckedChange={setLowBandwidth} />
      </div>
      <p className={cn('-mt-3 text-xs', dark ? 'text-cream-50/70' : 'text-ink-muted')}>{t('prefs.lowBandwidthHint')}</p>
      <label className="flex items-center justify-between gap-3">
        <span className="font-semibold">{t('prefs.language')}</span>
        <select
          className="h-10 rounded-lg border border-forest-900/20 bg-white px-2 text-forest-900"
          value={i18n.language}
          onChange={(e) => {
            void i18n.changeLanguage(e.target.value);
            try {
              localStorage.setItem('fv.lang', e.target.value);
            } catch {
              /* ignore */
            }
          }}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} disabled={l.status !== 'complete'}>
              {l.name}
              {l.status !== 'complete' ? ` — ${t('prefs.planned')}` : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
