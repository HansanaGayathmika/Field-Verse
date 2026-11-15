import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Crop, EnvironmentSummary, RotationStep } from '@fieldverse/contracts';
import { monthRange } from '@/lib/utils';

const W = 800;
const H = 520;
const GROUND = 232;
const SOIL_BOTTOM = 512;

function soilColor(soc: number | null | undefined) {
  if (soc == null) return '#a07c5a';
  const t = Math.max(0, Math.min(1, soc / 40));
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${lerp(196, 70)}, ${lerp(160, 46)}, ${lerp(120, 28)})`;
}

function mix(a: string, b: string, t: number) {
  const pa = a.match(/\w\w/g)!.map((x) => parseInt(x, 16));
  const pb = b.match(/\w\w/g)!.map((x) => parseInt(x, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

/** Deterministic pseudo-random so the scene is stable between renders. */
function rand(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export interface RootsSceneProps {
  step: RotationStep;
  crop: Crop | null;
  environment: EnvironmentSummary | null;
  rainfallChangePercent: number;
  temperatureChangeCelsius: number;
  selectedLayer: number | null;
  onSelectLayer: (i: number | null) => void;
  calm: boolean;
}

/**
 * Roots of Tomorrow — layered SVG farm scene.
 *  - Rain intensity = observed average monthly rain during this step's months (NASA POWER) × your assumption.
 *  - Soil layers = SoilGrids estimates by depth (colour = organic carbon).
 *  - Roots and plants are ILLUSTRATIONS of root type (fibrous vs taproot), not measurements.
 * Nothing in the scene predicts future soil changes.
 */
export function RootsScene({ step, crop, environment, rainfallChangePercent, temperatureChangeCelsius, selectedLayer, onSelectLayer, calm }: RootsSceneProps) {
  const months = monthRange(step.season.startMonth, step.season.endMonth);
  const monthly = environment?.climate?.monthly;
  const avgRain = monthly ? months.reduce((a, m) => a + (monthly[m - 1].rainfallMm ?? 0), 0) / months.length : null;
  const rain = avgRain == null ? null : avgRain * (1 + rainfallChangePercent / 100);
  const drops = rain == null ? 0 : Math.min(60, Math.round(rain / 5));
  const heat = Math.max(0, Math.min(1, temperatureChangeCelsius / 3));
  const skyTop = mix('9cc9e6', 'e9b872', heat * 0.7);
  const skyBottom = mix('e8f3fa', 'f8e3bd', heat * 0.8);
  const cloudOpacity = rain == null ? 0.5 : Math.min(0.95, 0.25 + rain / 250);

  const layers = environment?.soil?.layers.filter((l) => l.bottomCm <= 100) ?? null;
  const depthToY = (cm: number) => GROUND + (cm / 100) * (SOIL_BOTTOM - GROUND);

  const isFallow = step.cropId === 'fallow';
  const fibrous = crop?.characteristics.rootSystem === 'fibrous';
  const nodules = !!crop?.characteristics.nitrogenFixing;
  const plants = [140, 260, 380, 500, 620];

  const rootPaths = useMemo(() => {
    return plants.map((x, pi) => {
      const paths: string[] = [];
      if (fibrous) {
        for (let k = 0; k < 9; k++) {
          const ang = -70 + k * 17.5 + rand(pi * 10 + k) * 8;
          const len = 70 + rand(pi * 20 + k) * 60;
          const rad = (ang * Math.PI) / 180;
          const ex = x + Math.sin(rad) * len * 0.55;
          const ey = GROUND + Math.cos(rad) * len;
          paths.push(`M${x} ${GROUND} Q${x + Math.sin(rad) * len * 0.2} ${GROUND + len * 0.5} ${ex} ${ey}`);
        }
      } else {
        const depth = 150 + rand(pi) * 40;
        paths.push(`M${x} ${GROUND} C${x + 6} ${GROUND + depth * 0.4} ${x - 6} ${GROUND + depth * 0.7} ${x + 2} ${GROUND + depth}`);
        for (let k = 0; k < 6; k++) {
          const y0 = GROUND + 20 + k * 22;
          const dir = k % 2 ? 1 : -1;
          const len = 30 + rand(pi * 7 + k) * 25;
          paths.push(`M${x} ${y0} q${dir * len * 0.5} ${8} ${dir * len} ${18 + rand(k) * 10}`);
        }
      }
      return paths;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fibrous, step.cropId]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full select-none" role="img" aria-labelledby="roots-title roots-desc">
      <title id="roots-title">Roots of Tomorrow farm scene</title>
      <desc id="roots-desc">
        {`${isFallow ? 'The field is resting (fallow)' : `${crop?.names.en ?? step.cropId} growing`} during ${step.season.name}. ${
          rain != null ? `Average rain in these months is about ${Math.round(rain)} mm per month${rainfallChangePercent ? ` with your ${rainfallChangePercent}% assumption` : ''}.` : ''
        } ${layers ? `Soil layers from 0 to 100 cm are shown from global soil estimates.` : 'Soil data is not available; soil is drawn as an illustration.'}`}
      </desc>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <motion.stop offset="0" animate={{ stopColor: skyTop }} transition={{ duration: 0.8 }} />
          <motion.stop offset="1" animate={{ stopColor: skyBottom }} transition={{ duration: 0.8 }} />
        </linearGradient>
        <clipPath id="soil-clip">
          <rect x="0" y={GROUND} width={W} height={SOIL_BOTTOM - GROUND} />
        </clipPath>
        <radialGradient id="sun-glow">
          <stop offset="0" stopColor="#ffd77a" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Sky & atmosphere */}
      <rect width={W} height={GROUND} fill="url(#sky)" />
      <circle cx={680} cy={70} r={70 + heat * 50} fill="url(#sun-glow)" style={{ transition: "r 0.8s ease" }} />
      <circle cx={680} cy={70} r={30 + heat * 8} fill="#f8c55c" style={{ transition: "r 0.8s ease" }} />
      {[0, 1, 2].map((c) => (
        <g
          key={c}
          style={calm ? undefined : { animation: `fv-drift ${38 + c * 14}s linear infinite`, animationDelay: `${-c * 12}s` }}
          opacity={cloudOpacity}
        >
          <g transform={`translate(${calm ? 120 + c * 220 : 0} ${40 + c * 32})`}>
            <ellipse cx="0" cy="0" rx="58" ry="18" fill="#fff" />
            <ellipse cx="28" cy="-12" rx="34" ry="18" fill="#fff" />
            <ellipse cx="-26" cy="-6" rx="26" ry="14" fill="#fff" />
          </g>
        </g>
      ))}
      {!calm
        ? Array.from({ length: drops }).map((_, i) => (
            <line
              key={i}
              x1={rand(i + 1) * W}
              y1={60 + rand(i + 50) * 60}
              x2={rand(i + 1) * W - 3}
              y2={72 + rand(i + 50) * 60}
              stroke="#4f8fc4"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ animation: `fv-rain ${1 + rand(i + 9)}s linear infinite`, animationDelay: `${rand(i + 3) * 1.5}s` }}
            />
          ))
        : null}

      {/* Distant hills */}
      <path d={`M0 ${GROUND - 40} Q200 ${GROUND - 80} 400 ${GROUND - 45} T${W} ${GROUND - 50} V${GROUND} H0Z`} fill="#8fbfa5" opacity="0.7" />
      <path d={`M0 ${GROUND - 14} Q260 ${GROUND - 40} 520 ${GROUND - 16} T${W} ${GROUND - 22} V${GROUND} H0Z`} fill="#5f9e7c" />

      {/* Soil cross-section */}
      <g clipPath="url(#soil-clip)">
        {layers ? (
          layers.map((l, i) => {
            const y = depthToY(l.topCm);
            const h = depthToY(l.bottomCm) - y;
            return (
              <g key={l.depthLabel} onClick={() => onSelectLayer(selectedLayer === i ? null : i)} style={{ cursor: 'pointer' }}>
                <rect x="0" y={y} width={W} height={h + 0.5} fill={soilColor(l.values.organicCarbonGPerKg)} />
                {selectedLayer === i ? <rect x="2" y={y + 1} width={W - 4} height={h - 2} fill="none" stroke="#d6ac60" strokeWidth="4" /> : null}
                <text x={W - 12} y={h < 26 ? y + h / 2 + 5 + 3 : y + 20} textAnchor="end" fontSize="13" fontWeight="700" fill="#fff" opacity="0.9">
                  {l.topCm}–{l.bottomCm} cm
                </text>
              </g>
            );
          })
        ) : (
          <>
            <rect x="0" y={GROUND} width={W} height={SOIL_BOTTOM - GROUND} fill="#9b7653" />
            <text x={W / 2} y={SOIL_BOTTOM - 20} textAnchor="middle" fontSize="15" fill="#fff">
              Soil data unavailable for this region — soil drawn as an illustration only
            </text>
          </>
        )}
        {/* pebbles */}
        {Array.from({ length: 26 }).map((_, i) => (
          <ellipse key={i} cx={rand(i + 200) * W} cy={GROUND + 20 + rand(i + 300) * 240} rx={2 + rand(i) * 4} ry={1.5 + rand(i + 1) * 3} fill="#fff" opacity="0.12" />
        ))}
        {/* Roots (illustrative) */}
        {!isFallow ? (
          <g>
            {rootPaths.map((paths, pi) =>
              paths.map((d, k) => (
                <motion.path
                  key={`${step.cropId}-${pi}-${k}`}
                  d={d}
                  stroke="#f5ecd8"
                  strokeOpacity={0.9}
                  strokeWidth={fibrous ? 1.6 : k === 0 ? 4 : 1.8}
                  fill="none"
                  strokeLinecap="round"
                  initial={calm ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1.4, delay: 0.2 + k * 0.05 + pi * 0.05, ease: 'easeOut' }}
                />
              )),
            )}
            {nodules
              ? plants.map((x, pi) =>
                  [0, 1, 2, 3].map((k) => (
                    <motion.circle
                      key={`${step.cropId}-n-${pi}-${k}`}
                      cx={x + (k % 2 ? 12 : -12) + rand(pi + k) * 6}
                      cy={GROUND + 34 + k * 20}
                      r={3.5}
                      fill="#e8a2a2"
                      stroke="#fff"
                      strokeWidth="1"
                      initial={calm ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 1.4 + k * 0.1 }}
                    />
                  )),
                )
              : null}
          </g>
        ) : null}
      </g>
      {/* ground surface */}
      <rect x="0" y={GROUND - 3} width={W} height="6" fill="#5b3a22" />

      {/* Crops above ground */}
      <AnimatePresence mode="popLayout">
        {isFallow
          ? plants.map((x, i) => (
              <motion.g key={`stubble-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <path d={`M${x - 10} ${GROUND} l4 -16 M${x} ${GROUND} l0 -20 M${x + 10} ${GROUND} l-3 -14`} stroke="#c9a56b" strokeWidth="3" strokeLinecap="round" />
              </motion.g>
            ))
          : plants.map((x, i) => (
              <motion.g
                key={`${step.cropId}-${i}`}
                initial={calm ? false : { opacity: 0, y: 30, scale: 0.5 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: 'spring', stiffness: 120, damping: 14, delay: i * 0.07 }}
                style={{ originX: `${x}px`, originY: `${GROUND}px` }}
              >
                <g className={calm ? undefined : 'fv-sway'} style={{ animationDelay: `${i * 0.4}s` }}>
                  {crop ? <image href={crop.image.src} x={x - 55} y={GROUND - 112} width="110" height="116" preserveAspectRatio="xMidYMax meet" /> : null}
                </g>
              </motion.g>
            ))}
      </AnimatePresence>
    </svg>
  );
}
