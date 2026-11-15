#!/usr/bin/env node
/**
 * FieldVerse — demo observation preparation script.
 *
 * Fetches a SMALL set of real, openly licensed point observations for the three
 * demonstration regions and writes them as versioned fixtures with provenance.
 * This is NOT an ML pipeline and does NOT preprocess large NASA archives.
 *
 * Sources (all free, no API key):
 *  - NASA POWER (climatology + monthly time series)       https://power.larc.nasa.gov/
 *  - ISRIC SoilGrids 2.0 (soil properties by depth)        https://soilgrids.org/ (CC-BY 4.0)
 *  - MODIS MOD13Q1 NDVI via ORNL DAAC subset API           https://modis.ornl.gov/
 *  - NASA GIBS monthly NDVI imagery (timelapse videos)     https://earthdata.nasa.gov/gibs
 *
 * Usage:  node scripts/prepare-demo-data.mjs [--skip-video] [--region <id>]
 * Requires ffmpeg on PATH for video generation (optional).
 */
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const SKIP_VIDEO = args.includes('--skip-video');
const ONLY_REGION = args.includes('--region') ? args[args.indexOf('--region') + 1] : null;
const RETRIEVED_AT = new Date().toISOString();

const REGIONS = [
  { id: 'sri-lanka-anuradhapura', folder: 'sri-lanka', lat: 8.3114, lon: 80.4037 },
  { id: 'kenya-nakuru', folder: 'kenya', lat: -0.33, lon: 35.94 },
  { id: 'brazil-mato-grosso', folder: 'brazil', lat: -12.5425, lon: -55.7211 },
];

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const round = (v, d = 1) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

async function getJson(url, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'FieldVerse-demo-data/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`  attempt ${i} failed for ${url.slice(0, 90)}…: ${err.message}`);
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function getBinary(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FieldVerse-demo-data/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

/* ----------------------------- NASA POWER ----------------------------- */
async function fetchPowerClimatology(r) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=PRECTOTCORR,T2M,T2M_MAX,T2M_MIN` +
    `&community=AG&longitude=${r.lon}&latitude=${r.lat}&format=JSON`;
  const json = await getJson(url);
  const p = json.properties.parameter;
  const fill = json.header.fill_value;
  const v = (x) => (x === fill ? null : x);
  return {
    url,
    range: json.header.range,
    apiVersion: json.header.api?.version,
    sources: json.header.sources,
    months: MONTH_KEYS.map((k, i) => ({
      month: i + 1,
      rainfallMm: round(v(p.PRECTOTCORR[k]) * DAYS_IN_MONTH[i], 0),
      rainfallMmPerDay: round(v(p.PRECTOTCORR[k]), 2),
      temperatureMeanC: round(v(p.T2M[k])),
      temperatureMaxC: round(v(p.T2M_MAX[k])),
      temperatureMinC: round(v(p.T2M_MIN[k])),
    })),
  };
}

async function fetchPowerAnnual(r, start = 2015, end = 2024) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=PRECTOTCORR_SUM,T2M` +
    `&community=AG&longitude=${r.lon}&latitude=${r.lat}&start=${start}&end=${end}&format=JSON`;
  const json = await getJson(url);
  const p = json.properties.parameter;
  const fill = json.header.fill_value;
  const years = [];
  for (let y = start; y <= end; y++) {
    const total = p.PRECTOTCORR_SUM[`${y}13`];
    const t = p.T2M[`${y}13`];
    years.push({
      year: y,
      rainfallTotalMm: total === fill ? null : round(total, 0),
      temperatureMeanC: t === fill ? null : round(t),
    });
  }
  return { url, apiVersion: json.header.api?.version, sources: json.header.sources, years };
}

/* ----------------------------- SoilGrids ----------------------------- */
const SOIL_PROPS = {
  phh2o: { key: 'phH2O', factor: 10 },
  soc: { key: 'organicCarbonGPerKg', factor: 10 },
  clay: { key: 'clayPercent', factor: 10 },
  sand: { key: 'sandPercent', factor: 10 },
  silt: { key: 'siltPercent', factor: 10 },
  nitrogen: { key: 'nitrogenGPerKg', factor: 100 },
  bdod: { key: 'bulkDensityGPerCm3', factor: 100 },
  cec: { key: 'cecCmolPerKg', factor: 10 },
};
const SOIL_DEPTHS = ['0-5cm', '5-15cm', '15-30cm', '30-60cm', '60-100cm'];

async function fetchSoil(r) {
  const props = Object.keys(SOIL_PROPS).map((p) => `property=${p}`).join('&');
  const depths = SOIL_DEPTHS.map((d) => `depth=${d}`).join('&');
  const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${r.lon}&lat=${r.lat}&${props}&${depths}&value=mean&value=Q0.05&value=Q0.95`;
  const json = await getJson(url, 4);
  const layers = SOIL_DEPTHS.map((label) => {
    const [top, bottom] = label.replace('cm', '').split('-').map(Number);
    const layer = { depthLabel: label, topCm: top, bottomCm: bottom, values: {}, intervals: {} };
    for (const l of json.properties.layers) {
      const meta = SOIL_PROPS[l.name];
      if (!meta) continue;
      const d = l.depths.find((x) => x.label === label);
      const mean = d?.values?.mean;
      layer.values[meta.key] = mean == null ? null : round(mean / meta.factor, 2);
      const lo = d?.values?.['Q0.05'];
      const hi = d?.values?.['Q0.95'];
      if (lo != null && hi != null) layer.intervals[meta.key] = { lower: round(lo / meta.factor, 2), upper: round(hi / meta.factor, 2), level: 0.9 };
    }
    return layer;
  });
  return { url, layers };
}

/* ----------------------------- MODIS NDVI ----------------------------- */
async function fetchNdvi(r, years = [2023, 2024]) {
  const series = [];
  const urls = [];
  for (const y of years) {
    // MOD13Q1 composites start on day 1, 17, 33 ... (16-day). API allows ~10 dates per call.
    for (let startDoy = 1; startDoy <= 353; startDoy += 160) {
      const endDoy = Math.min(startDoy + 159, 366);
      const pad = (n) => String(n).padStart(3, '0');
      const url =
        `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${r.lat}&longitude=${r.lon}` +
        `&band=250m_16_days_NDVI&startDate=A${y}${pad(startDoy)}&endDate=A${y}${pad(endDoy)}&kmAboveBelow=0&kmLeftRight=0`;
      urls.push(url);
      const json = await getJson(url, 4);
      for (const s of json.subset ?? []) {
        const raw = s.data?.[0];
        series.push({ date: s.calendar_date, ndvi: raw == null || raw <= -2000 ? null : round(raw * 0.0001, 3) });
      }
    }
  }
  series.sort((a, b) => a.date.localeCompare(b.date));
  const dedup = series.filter((s, i) => i === 0 || s.date !== series[i - 1].date);
  return { urls, series: dedup };
}

/* ----------------------------- GIBS video ----------------------------- */
function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function buildTimelapse({ name, bbox, width, height, outDir, year = 2024 }) {
  const tmp = path.join(outDir, '_frames');
  await mkdir(tmp, { recursive: true });
  const frameUrls = [];
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const url =
      `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
      `&LAYERS=MODIS_Terra_L3_NDVI_Monthly&CRS=EPSG:4326&BBOX=${bbox.join(',')}&WIDTH=${width}&HEIGHT=${height}` +
      `&FORMAT=image/jpeg&TIME=${year}-${mm}-01&STYLES=&BGCOLOR=0x0B1F18`;
    frameUrls.push(url);
    await getBinary(url, path.join(tmp, `frame_${mm}.jpg`));
  }
  const input = path.join(tmp, 'frame_%02d.jpg');
  const vf = `framerate=fps=25:interp_start=0:interp_end=255:scene=100,scale=${width}:-2,format=yuv420p`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1.25', '-i', input, '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '38', '-an', path.join(outDir, `${name}.webm`)]);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1.25', '-i', input, '-vf', vf, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-movflags', '+faststart', '-an', path.join(outDir, `${name}.mp4`)]);
  // poster = a mid-year frame
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(tmp, 'frame_07.jpg'), '-q:v', '4', path.join(outDir, `${name}-poster.jpg`)]);
  await rm(tmp, { recursive: true, force: true });
  return { year, frameUrls, framesPerSecond: 1.25, files: [`${name}.webm`, `${name}.mp4`, `${name}-poster.jpg`] };
}

/* ----------------------------- main ----------------------------- */
async function main() {
  const ff = !SKIP_VIDEO && hasFfmpeg();
  if (!SKIP_VIDEO && !ff) console.warn('ffmpeg not found — skipping timelapse video generation.');
  const mediaRoot = path.join(ROOT, 'apps', 'web', 'public', 'media');

  for (const r of REGIONS) {
    if (ONLY_REGION && ONLY_REGION !== r.id) continue;
    console.log(`\n▶ ${r.id}`);
    const dir = path.join(ROOT, 'data', 'demo', r.folder);
    await mkdir(dir, { recursive: true });

    const climatology = await fetchPowerClimatology(r);
    console.log('  ✓ NASA POWER climatology');
    const annual = await fetchPowerAnnual(r);
    console.log('  ✓ NASA POWER annual series');
    let soil = null;
    try {
      soil = await fetchSoil(r);
      console.log('  ✓ SoilGrids');
    } catch (e) {
      console.warn('  ✗ SoilGrids unavailable:', e.message);
    }
    let ndvi = null;
    try {
      ndvi = await fetchNdvi(r);
      console.log(`  ✓ MODIS NDVI (${ndvi.series.length} composites)`);
    } catch (e) {
      console.warn('  ✗ MODIS NDVI unavailable:', e.message);
    }

    let video = null;
    if (ff) {
      const outDir = path.join(mediaRoot, r.folder);
      await mkdir(outDir, { recursive: true });
      const d = 0.75;
      // WMS 1.3.0 + EPSG:4326 => BBOX order is minLat,minLon,maxLat,maxLon
      video = await buildTimelapse({ name: 'ndvi-2024', bbox: [r.lat - d, r.lon - d, r.lat + d, r.lon + d], width: 480, height: 480, outDir });
      console.log('  ✓ GIBS NDVI timelapse video');
    }

    const observations = {
      schemaVersion: '1.0',
      regionId: r.id,
      location: { latitude: r.lat, longitude: r.lon },
      preparedAt: RETRIEVED_AT,
      preparedBy: 'scripts/prepare-demo-data.mjs',
      climate: {
        monthly: climatology.months,
        period: climatology.range,
        source: {
          id: 'nasa-power-climatology',
          name: 'NASA POWER — Climatology API',
          provider: 'NASA Langley Research Center (LaRC) POWER Project',
          sourceType: 'observed',
          datasetVersion: `POWER API ${climatology.apiVersion} (${(climatology.sources || []).join(', ')})`,
          spatialResolution: '0.5° × 0.625° (MERRA-2 grid)',
          temporalCoverage: climatology.range,
          url: climatology.url,
          retrievedAt: RETRIEVED_AT,
          license: 'NASA open data — no restrictions; acknowledgement requested',
          notes:
            'Precipitation is PRECTOTCORR (bias-corrected, mm/day) converted to a monthly total by multiplying by days in the month. Values are reanalysis/satellite-derived estimates for a ~50 km grid cell, not a farm rain gauge.',
        },
      },
      annual: {
        years: annual.years,
        source: {
          id: 'nasa-power-monthly',
          name: 'NASA POWER — Monthly & Annual API',
          provider: 'NASA Langley Research Center (LaRC) POWER Project',
          sourceType: 'observed',
          datasetVersion: `POWER API ${annual.apiVersion} (${(annual.sources || []).join(', ')})`,
          spatialResolution: '0.5° × 0.625° (MERRA-2 grid)',
          temporalCoverage: '2015–2024',
          url: annual.url,
          retrievedAt: RETRIEVED_AT,
          license: 'NASA open data — no restrictions; acknowledgement requested',
          notes: 'Annual totals are PRECTOTCORR_SUM; annual temperature is the T2M annual mean.',
        },
      },
      soil: soil
        ? {
            layers: soil.layers,
            source: {
              id: 'isric-soilgrids-2',
              name: 'SoilGrids 2.0',
              provider: 'ISRIC — World Soil Information',
              sourceType: 'estimated',
              datasetVersion: 'SoilGrids 2.0 (2020 release)',
              spatialResolution: '250 m',
              url: soil.url,
              retrievedAt: RETRIEVED_AT,
              license: 'CC-BY 4.0',
              notes:
                'SoilGrids values are predictions from a global machine-learning model, not field soil tests. Intervals are the 5th–95th percentile prediction range. A local soil test is required before decisions.',
            },
          }
        : null,
      vegetation: ndvi
        ? {
            ndvi: ndvi.series,
            source: {
              id: 'modis-mod13q1-ndvi',
              name: 'MODIS Terra Vegetation Indices (MOD13Q1 v061) — NDVI',
              provider: 'NASA LP DAAC, accessed via ORNL DAAC MODIS/VIIRS Web Service',
              sourceType: 'observed',
              datasetVersion: 'MOD13Q1 Collection 6.1',
              spatialResolution: '250 m, 16-day composites',
              temporalCoverage: '2023–2024',
              url: ndvi.urls[0],
              retrievedAt: RETRIEVED_AT,
              license: 'NASA open data — no restrictions; acknowledgement requested',
              notes:
                'Single 250 m pixel at the demo point. Clouds and mixed land cover can lower values. Quality flags were not applied in this demo fixture.',
            },
          }
        : null,
      media: video
        ? {
            ndviTimelapse: {
              webm: `/media/${r.folder}/ndvi-2024.webm`,
              mp4: `/media/${r.folder}/ndvi-2024.mp4`,
              poster: `/media/${r.folder}/ndvi-2024-poster.jpg`,
              year: video.year,
              framesPerSecond: video.framesPerSecond,
              boundingBox: { minLat: r.lat - 0.75, minLon: r.lon - 0.75, maxLat: r.lat + 0.75, maxLon: r.lon + 0.75 },
              source: {
                id: 'nasa-gibs-modis-ndvi-monthly',
                name: 'NASA GIBS — MODIS Terra L3 NDVI Monthly',
                provider: "NASA Global Imagery Browse Services (GIBS), part of NASA's ESDIS",
                sourceType: 'observed',
                datasetVersion: 'MODIS_Terra_L3_NDVI_Monthly (WMS, best available)',
                spatialResolution: '~1 km imagery',
                temporalCoverage: `${video.year} (12 monthly frames)`,
                url: video.frameUrls[0],
                retrievedAt: RETRIEVED_AT,
                license: 'NASA imagery — no restrictions; GIBS acknowledgement included',
              },
            },
          }
        : null,
    };
    // Never discard previously prepared blocks when a source fails or videos are skipped.
    const existingPath = path.join(dir, 'observations.json');
    if (existsSync(existingPath)) {
      const prev = JSON.parse(await readFile(existingPath, 'utf8'));
      if (!observations.soil && prev.soil) observations.soil = prev.soil;
      if (!observations.vegetation && prev.vegetation) observations.vegetation = prev.vegetation;
      if (!observations.media && prev.media) observations.media = prev.media;
    }
    await writeFile(existingPath, JSON.stringify(observations, null, 2) + '\n');
    console.log(`  → data/demo/${r.folder}/observations.json`);
  }

  if (ff && !ONLY_REGION) {
    const outDir = path.join(mediaRoot, 'global');
    await mkdir(outDir, { recursive: true });
    const g = await buildTimelapse({ name: 'earth-ndvi-2024', bbox: [-60, -180, 80, 180], width: 1280, height: 498, outDir });
    await writeFile(
      path.join(outDir, 'earth-ndvi-2024.json'),
      JSON.stringify({ ...g, layer: 'MODIS_Terra_L3_NDVI_Monthly', retrievedAt: RETRIEVED_AT, credit: "Imagery: NASA GIBS / MODIS Terra NDVI (monthly), part of NASA's ESDIS." }, null, 2) + '\n',
    );
    console.log('\n✓ Global NDVI timelapse');
  }
  console.log('\nDone. Commit the generated fixtures and media.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
