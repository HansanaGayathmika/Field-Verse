import type { EnvironmentSummary, SourceRef } from '@fieldverse/contracts';
import { Card } from '@/components/ui/card';
import { ProvenanceBadge } from '@/components/Provenance';
import { formatNumber } from '@/lib/utils';
import { sourceName } from './ClimateCharts';

type Soil = NonNullable<EnvironmentSummary['soil']>;

/** pH words a farmer recognises (general soil science bands). */
export function phWord(ph: number | null | undefined) {
  if (ph == null) return 'unknown';
  if (ph < 5.5) return 'strongly acidic';
  if (ph < 6.5) return 'slightly acidic';
  if (ph <= 7.5) return 'near neutral';
  if (ph <= 8.4) return 'slightly alkaline';
  return 'strongly alkaline';
}

export function textureWord(clay?: number | null, sand?: number | null) {
  if (clay == null || sand == null) return 'unknown';
  if (clay >= 40) return 'clay-rich (holds water, can get sticky)';
  if (sand >= 70) return 'sandy (drains fast, holds little water)';
  if (clay >= 27) return 'clay loam (holds water well)';
  if (sand >= 50) return 'sandy loam (drains well)';
  return 'loam (balanced)';
}

/** Darker soil = more organic carbon. Colour is a visual aid; values are always printed. */
function layerColor(soc: number | null | undefined) {
  if (soc == null) return '#c9b49c';
  const t = Math.max(0, Math.min(1, soc / 40));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(201, 74)}, ${lerp(170, 50)}, ${lerp(132, 30)})`;
}

/**
 * Soil cross-section from SoilGrids (estimated). Layer thickness is proportional to depth;
 * each layer lists pH, organic carbon and texture with the 90% prediction range.
 */
export function SoilProfile({ soil, sources }: { soil: Soil | null; sources: SourceRef[] }) {
  if (!soil) {
    return (
      <Card className="p-6">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold">Soil layers</h3>
          <ProvenanceBadge type="unavailable" />
        </div>
        <p className="mt-2 text-ink-muted">
          Global soil estimates (SoilGrids) are not available for this location — the service returned no values for this point when the demo data was prepared. FieldVerse does not invent soil values — a
          local soil test is the best source anyway.
        </p>
      </Card>
    );
  }
  const layers = soil.layers.filter((l) => l.bottomCm <= 100);
  const totalDepth = layers[layers.length - 1]?.bottomCm ?? 100;
  const top = layers[0];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 p-5 pb-2 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">What is my soil probably like?</p>
          <h3 className="text-lg font-semibold">Soil layers (top 1 m)</h3>
        </div>
        <ProvenanceBadge type="estimated" />
      </div>
      <p className="mx-5 mb-3 rounded-xl bg-sage-100 p-3 text-[0.95rem] sm:mx-6">
        The topsoil here is probably <strong>{phWord(top?.values.phH2O)}</strong> (pH about {formatNumber(top?.values.phH2O, 'en', 1)}) and{' '}
        <strong>{textureWord(top?.values.clayPercent, top?.values.sandPercent)}</strong>. These are estimates for a 250 m area, not a test of your field.
      </p>
      <div className="grid gap-0 px-5 pb-4 sm:px-6" role="table" aria-label="Soil properties by depth">
        <div role="row" className="sr-only">
          <span role="columnheader">Depth</span>
          <span role="columnheader">pH</span>
          <span role="columnheader">Organic carbon</span>
          <span role="columnheader">Texture</span>
        </div>
        {layers.map((l) => {
          const h = Math.max(44, ((l.bottomCm - l.topCm) / totalDepth) * 300);
          const sand = l.values.sandPercent ?? 0;
          const silt = l.values.siltPercent ?? 0;
          const clay = l.values.clayPercent ?? 0;
          const sum = sand + silt + clay || 1;
          return (
            <div role="row" key={l.depthLabel} className="grid grid-cols-[4.5rem_1fr] items-stretch gap-3 border-t border-white/40 first:border-t-0">
              <div role="cell" className="flex items-center text-sm font-semibold text-forest-900">
                {l.topCm}–{l.bottomCm} cm
              </div>
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-3 py-2 text-sm text-white"
                style={{ background: layerColor(l.values.organicCarbonGPerKg), minHeight: h }}
              >
                <span role="cell">
                  pH <strong>{formatNumber(l.values.phH2O, 'en', 1)}</strong>
                  {l.intervals?.phH2O ? <span className="opacity-80"> ({l.intervals.phH2O.lower}–{l.intervals.phH2O.upper})</span> : null}
                </span>
                <span role="cell">
                  Organic carbon <strong>{formatNumber(l.values.organicCarbonGPerKg, 'en', 1)} g/kg</strong>
                </span>
                <span role="cell" className="flex items-center gap-2">
                  <span className="flex h-2.5 w-24 overflow-hidden rounded-full bg-white/20" aria-hidden>
                    <span style={{ width: `${(sand / sum) * 100}%`, background: '#f0d9a8' }} />
                    <span style={{ width: `${(silt / sum) * 100}%`, background: '#d9b98c' }} className="border-l-2 border-white/0" />
                    <span style={{ width: `${(clay / sum) * 100}%`, background: '#8f5e3b' }} />
                  </span>
                  <span>
                    sand {Math.round(sand)}% · silt {Math.round(silt)}% · clay {Math.round(clay)}%
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-forest-900/5 px-5 py-3 text-xs text-ink-muted sm:px-6">
        Source: {sourceName(sources, soil.sourceId)} · ranges in brackets are the 90% prediction range. Darker colour = more organic carbon.
      </div>
    </Card>
  );
}
