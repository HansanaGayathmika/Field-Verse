import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EnvironmentSummary, SourceRef } from '@fieldverse/contracts';
import { ChartCard } from '@/components/ChartCard';
import { formatNumber, MONTHS_SHORT, monthName } from '@/lib/utils';

type Monthly = NonNullable<EnvironmentSummary['climate']>['monthly'];

const AXIS = { stroke: '#4a5a51', fontSize: 12, tickLine: false } as const;
const GRID = <CartesianGrid stroke="#17231d" strokeOpacity={0.08} vertical={false} />;
const TOOLTIP_STYLE = { borderRadius: 12, border: '1px solid rgba(16,45,36,.12)', boxShadow: '0 8px 24px -12px rgba(16,45,36,.3)', fontSize: 13 };

export const sourceName = (sources: SourceRef[], id?: string | null) => sources.find((s) => s.id === id)?.name ?? 'Unknown source';

/* ---------------- Monthly rainfall ---------------- */
export function rainfallTakeaway(monthly: Monthly) {
  const valid = monthly.filter((m) => m.rainfallMm != null);
  if (valid.length < 12) return null;
  const sorted = [...valid].sort((a, b) => b.rainfallMm! - a.rainfallMm!);
  const wet = sorted.slice(0, 3).sort((a, b) => a.month - b.month);
  const dry = sorted.slice(-3).sort((a, b) => a.month - b.month);
  const wetTotal = wet.reduce((a, m) => a + m.rainfallMm!, 0);
  const total = valid.reduce((a, m) => a + m.rainfallMm!, 0);
  return {
    wet,
    dry,
    text: `Most rain falls in ${wet.map((m) => monthName(m.month)).join(', ')} — about ${Math.round((wetTotal / total) * 100)}% of the year's rain. The driest months are ${dry
      .map((m) => monthName(m.month))
      .join(', ')} (${dry.map((m) => `${formatNumber(m.rainfallMm)} mm`).join(', ')}).`,
  };
}

export function RainfallChart({ monthly, sources, sourceId, period, height = 240 }: { monthly: Monthly; sources: SourceRef[]; sourceId: string; period: string; height?: number }) {
  const data = monthly.map((m) => ({ month: MONTHS_SHORT[m.month - 1], rain: m.rainfallMm }));
  const take = rainfallTakeaway(monthly);
  return (
    <ChartCard
      title="Average rain each month"
      question="When does the rain come?"
      unit="mm"
      sourceName={sourceName(sources, sourceId)}
      sourceType="observed"
      period={period}
      takeaway={take?.text}
      description={`Bar chart of average monthly rainfall in millimetres. ${take?.text ?? ''}`}
      table={{ columns: ['Month', 'Rain (mm)'], rows: data.map((d) => [d.month, d.rain ?? '—']) }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={3}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} interval={0} tick={{ fontSize: 11 }} />
          <YAxis {...AXIS} axisLine={false} width={48} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(16,45,36,.05)' }} formatter={(v) => [`${v} mm`, 'Average rain']} />
          <Bar dataKey="rain" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ---------------- Monthly temperature ---------------- */
export function TemperatureChart({ monthly, sources, sourceId, period, height = 240 }: { monthly: Monthly; sources: SourceRef[]; sourceId: string; period: string; height?: number }) {
  const data = monthly.map((m) => ({
    month: MONTHS_SHORT[m.month - 1],
    mean: m.temperatureMeanC,
    range: m.temperatureMinC != null && m.temperatureMaxC != null ? [m.temperatureMinC, m.temperatureMaxC] : null,
    min: m.temperatureMinC,
    max: m.temperatureMaxC,
  }));
  const valid = monthly.filter((m) => m.temperatureMeanC != null);
  const hot = valid.reduce((a, b) => (b.temperatureMeanC! > a.temperatureMeanC! ? b : a), valid[0]);
  const cool = valid.reduce((a, b) => (b.temperatureMeanC! < a.temperatureMeanC! ? b : a), valid[0]);
  const hottestMax = Math.max(...monthly.map((m) => m.temperatureMaxC ?? -99));
  const takeaway = hot
    ? `Warmest on average in ${monthName(hot.month, 'en', 'long')} (${formatNumber(hot.temperatureMeanC, 'en', 1)} °C), coolest in ${monthName(cool.month, 'en', 'long')} (${formatNumber(cool.temperatureMeanC, 'en', 1)} °C). Average daily highs reach about ${formatNumber(hottestMax, 'en', 0)} °C.`
    : null;
  return (
    <ChartCard
      title="Temperature through the year"
      question="How hot or cool does it get?"
      unit="°C"
      sourceName={sourceName(sources, sourceId)}
      sourceType="observed"
      period={period}
      takeaway={takeaway}
      description={`Line chart of average monthly temperature, with a shaded band from the average daily low to the average daily high. ${takeaway ?? ''}`}
      table={{ columns: ['Month', 'Average (°C)', 'Avg. low (°C)', 'Avg. high (°C)'], rows: data.map((d) => [d.month, d.mean ?? '—', d.min ?? '—', d.max ?? '—']) }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} interval={0} tick={{ fontSize: 11 }} />
          <YAxis {...AXIS} axisLine={false} width={48} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v) => `${Math.round(v)}`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, name) => (name === 'range' && Array.isArray(v) ? [`${v[0]}–${v[1]} °C`, 'Daily low–high'] : [`${v} °C`, 'Average'])}
          />
          <Area dataKey="range" fill="var(--color-series-2)" fillOpacity={0.15} stroke="none" isAnimationActive={false} />
          <Line dataKey="mean" stroke="var(--color-series-2)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: 'var(--color-series-2)' }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ---------------- Year-to-year rainfall ---------------- */
export function AnnualRainfallChart({ years, sources, sourceId, height = 220 }: { years: NonNullable<EnvironmentSummary['annual']>['years']; sources: SourceRef[]; sourceId: string; height?: number }) {
  const valid = years.filter((y) => y.rainfallTotalMm != null);
  const avg = valid.reduce((a, y) => a + y.rainfallTotalMm!, 0) / (valid.length || 1);
  const lo = valid.reduce((a, b) => (b.rainfallTotalMm! < a.rainfallTotalMm! ? b : a), valid[0]);
  const hi = valid.reduce((a, b) => (b.rainfallTotalMm! > a.rainfallTotalMm! ? b : a), valid[0]);
  const takeaway = lo
    ? `Rain changes a lot between years: from ${formatNumber(lo.rainfallTotalMm)} mm in ${lo.year} to ${formatNumber(hi.rainfallTotalMm)} mm in ${hi.year} (average ${formatNumber(avg)} mm). Plans should work in both dry and wet years.`
    : null;
  return (
    <ChartCard
      title="Total rain each year"
      question="How much does rain change between years?"
      unit="mm per year"
      sourceName={sourceName(sources, sourceId)}
      sourceType="observed"
      period={`${years[0]?.year}–${years[years.length - 1]?.year}`}
      takeaway={takeaway}
      description={`Bar chart of total yearly rainfall with a line at the average. ${takeaway ?? ''}`}
      table={{ columns: ['Year', 'Rain (mm)', 'Average temp. (°C)'], rows: years.map((y) => [y.year, y.rainfallTotalMm ?? '—', y.temperatureMeanC ?? '—']) }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={years} margin={{ top: 12, right: 8, left: -8, bottom: 0 }} barCategoryGap={3}>
          {GRID}
          <XAxis dataKey="year" {...AXIS} tick={{ fontSize: 11 }} interval={0} tickFormatter={(y) => `'${String(y).slice(2)}`} />
          <YAxis {...AXIS} axisLine={false} width={52} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(16,45,36,.05)' }} formatter={(v) => [`${v} mm`, 'Total rain']} />
          <ReferenceLine y={Math.round(avg)} stroke="#17231d" strokeDasharray="4 4" label={{ value: 'average', position: 'insideTopRight', fontSize: 11, fill: '#4a5a51' }} />
          <Bar dataKey="rainfallTotalMm" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ---------------- Vegetation (NDVI) ---------------- */
export function NdviChart({ ndvi, sources, sourceId, height = 220 }: { ndvi: NonNullable<EnvironmentSummary['vegetation']>['ndvi']; sources: SourceRef[]; sourceId: string; height?: number }) {
  const data = ndvi.map((p) => ({ date: p.date, ndvi: p.ndvi }));
  const valid = data.filter((d) => d.ndvi != null);
  // average per calendar month across the two years — what a farmer recognises as "the season"
  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const vals = valid.filter((d) => Number(d.date.slice(5, 7)) === i + 1).map((d) => d.ndvi!);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  let idxMax = -1;
  let idxMin = -1;
  byMonth.forEach((v, i) => {
    if (v == null) return;
    if (idxMax < 0 || v > byMonth[idxMax]!) idxMax = i;
    if (idxMin < 0 || v < byMonth[idxMin]!) idxMin = i;
  });
  const takeaway =
    idxMax >= 0
      ? `Plants around this point were greenest around ${monthName(idxMax + 1, 'en', 'long')} and least green around ${monthName(idxMin + 1, 'en', 'long')} in 2023–2024. Greenness follows crops and natural vegetation together, so read it as a seasonal pattern.`
      : null;
  return (
    <ChartCard
      title="How green the land is (NDVI)"
      question="When are plants growing strongly?"
      unit="0 = bare, 1 = very green"
      sourceName={sourceName(sources, sourceId)}
      sourceType="observed"
      period="2023–2024, 16-day"
      takeaway={takeaway}
      description={`Line chart of satellite vegetation greenness (NDVI) every 16 days. ${takeaway ?? ''}`}
      table={{ columns: ['Date', 'NDVI'], rows: data.map((d) => [d.date, d.ndvi ?? 'missing']) }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
          {GRID}
          <XAxis dataKey="date" {...AXIS} tick={{ fontSize: 11 }} minTickGap={28} tickFormatter={(d: string) => `${MONTHS_SHORT[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}`} />
          <YAxis {...AXIS} axisLine={false} width={44} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v, 'NDVI']} labelFormatter={(d) => `Composite starting ${d}`} />
          <Line dataKey="ndvi" stroke="var(--color-series-veg)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ---------------- Scenario: baseline vs hypothetical rain ---------------- */
export function ScenarioRainChart({ monthly, rainfallChangePercent, sources, sourceId, height = 220 }: { monthly: Monthly; rainfallChangePercent: number; sources: SourceRef[]; sourceId: string; height?: number }) {
  const data = monthly.map((m) => ({
    month: MONTHS_SHORT[m.month - 1],
    baseline: m.rainfallMm,
    hypothetical: m.rainfallMm == null ? null : Math.round(m.rainfallMm * (1 + rainfallChangePercent / 100)),
  }));
  return (
    <ChartCard
      title="Rain: today vs your 'what if'"
      question="What does the assumption mean month by month?"
      unit="mm"
      sourceName={`${sourceName(sources, sourceId)} (baseline); simple arithmetic for the assumption`}
      sourceType="observed"
      period="2001–2025 average"
      takeaway={
        rainfallChangePercent === 0
          ? 'Move the rainfall slider to see what your assumption would mean for each month.'
          : `Your assumption changes every month by ${rainfallChangePercent > 0 ? '+' : ''}${rainfallChangePercent}%. This is a hypothetical "what if", not a forecast.`
      }
      description="Grouped bar chart comparing observed average monthly rainfall with the same values changed by your chosen percentage."
      table={{ columns: ['Month', 'Today (mm)', 'What if (mm)'], rows: data.map((d) => [d.month, d.baseline ?? '—', d.hypothetical ?? '—']) }}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={4} barGap={2}>
          {GRID}
          <XAxis dataKey="month" {...AXIS} interval={0} tick={{ fontSize: 11 }} />
          <YAxis {...AXIS} axisLine={false} width={48} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(16,45,36,.05)' }} formatter={(v, n) => [`${v} mm`, n === 'baseline' ? 'Today (observed average)' : 'What if (hypothetical)']} />
          <Legend formatter={(v) => (v === 'baseline' ? 'Today (observed average)' : 'What if (hypothetical)')} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="baseline" fill="#9aa8a0" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="hypothetical" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
