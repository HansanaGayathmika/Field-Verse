# Data sources and licences

**Audience:** the team, judges, and anyone checking where FieldVerse's information comes from.

## Prepared observations (real data)

These are fetched once by `npm run data:prepare` (`scripts/prepare-demo-data.mjs`) and saved in `data/demo/<region>/observations.json`. Each block records its URL, dataset version and retrieval timestamp. This is a **small point extract**, not a bulk download.

| Source | What | Used for | Licence / terms |
|---|---|---|---|
| **NASA POWER** Climatology API (MERRA-2 based) | Monthly PRECTOTCORR, T2M, T2M_MAX, T2M_MIN; 2001–2025 normals | Rainfall and temperature charts, irrigation rule, scenario baseline, rain in the Roots scene | NASA open data; acknowledgement requested |
| **NASA POWER** Monthly API | PRECTOTCORR_SUM, T2M annual, 2015–2024 | Year-to-year rainfall chart | NASA open data |
| **ISRIC SoilGrids 2.0** | pH, SOC, clay, sand, silt, N, bulk density and CEC at 0–100 cm, with mean and 5–95% range | Soil profile, Roots soil layers, dashboard metrics | **CC-BY 4.0** (attribution shown in the UI) |
| **MODIS MOD13Q1 v061 NDVI** via ORNL DAAC web service | 16-day, 250 m composites for 2023–2024 at the demo point | Vegetation chart and NDVI metric | NASA open data |
| **NASA GIBS** `MODIS_Terra_L3_NDVI_Monthly` | 12 monthly frames for 2024 (regional ±0.75° and global) | Satellite **timelapse videos**: hero, explorer and dashboard | NASA imagery, no restrictions; GIBS acknowledgement included |

Video files are built with ffmpeg from the GIBS frames: WebM/VP9 plus an MP4/H.264 fallback, and a poster JPEG. They are stored in `apps/web/public/media/`. No third-party stock video is used.

**Known gap** in the current fixtures, shown as "Not available" in the UI:

- Brazil (Sorriso point): SoilGrids returns no values. Every property is null, so the app treats the soil block as unavailable.

Re-run `npm run data:prepare -- --region <id> --skip-video` to fill them. The script never discards blocks that were fetched successfully before.

## Live observations for any location (worldwide)

For farms outside the demo regions, `GET /api/v1/observations/point?lat=&lon=` fetches data **live, on the server**:

- NASA POWER climatology and the 2015–2024 annual series (required)
- ISRIC SoilGrids soil layers (optional; shown as "Not available" if the service fails)

Privacy and caching:

- Coordinates are rounded to 2 decimals (about 1 km) before leaving the server. Nothing about the user is sent.
- Results are cached for 30 days, or 1 hour if SoilGrids failed, in the MongoDB `EngineCache` (TTL) and in memory.
- Vegetation (NDVI) and satellite videos are available only for the three prepared regions.
- Set `LIVE_OBSERVATIONS=false` to disable live fetching.

## Illustrative demo content (not data)

| Content | File | Label in the app |
|---|---|---|
| Rotation strategies, ratings, benefits and risks | `data/demo/*/rotations.json` | "Illustrative demo" |
| Scenario effect descriptions (5 presets) | `data/demo/*/scenarios.json` | "Illustrative demo" |
| Crop calendars and gap candidates | `data/demo/*/gaps.json` | "Illustrative demo" plus "Fit: simple rule" |
| Regional farming context and seasons | `data/demo/*/region.json` | "Estimated", with "verify locally" |
| Crop durations and tolerances | `data/demo/crops.json` | "Estimated", described as general reference ranges |

Scientific names are standard binomials (*Oryza sativa*, *Zea mays*, *Vigna radiata*, *Vigna unguiculata*, *Phaseolus vulgaris*, *Sorghum bicolor*, *Glycine max*, *Crotalaria juncea*, *Lablab purpureus*).

## Place search

"Search by village or town" uses the OpenStreetMap **Nominatim** service through `GET /api/v1/geocode`.

- The server sends only the search text, never anything about the user.
- Requests are throttled to at most 1 per second, with an identifying User-Agent, as the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) requires.
- Results are cached for 24 hours.
- Attribution is shown with the results.

## Map tiles

OpenStreetMap standard tiles (`tile.openstreetmap.org`) with the required attribution. They suit light, interactive demo use only, under the [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).

For production traffic, use a dedicated tile provider or self-hosted tiles. Low-bandwidth mode hides the map entirely and uses the list selector.

## Software licences (main dependencies)

| Package | Licence |
|---|---|
| React, React DOM, React Router, Vite, Vitest, TanStack Query, React Hook Form, Zod, Recharts, Motion, Tailwind CSS, Express, Helmet, CORS, express-rate-limit, dotenv, cookie-parser, i18next, react-i18next, Radix UI, class-variance-authority, clsx, tailwind-merge, Playwright, Supertest, tsx, tsup, mongodb-memory-server | MIT |
| Mongoose | MIT |
| Leaflet, React-Leaflet | BSD-2-Clause / Hippocratic-2.1 (React-Leaflet) — review if your deployment has policy restrictions |
| Lucide icons | ISC |
| Manrope, Fraunces fonts (Fontsource) | SIL Open Font License 1.1 |
| TypeScript | Apache-2.0 |
| MongoDB Community Server | SSPL (server, used locally; not distributed with the app) |

All crop illustrations, the logo and the landing artwork are original SVGs made for FieldVerse and released as CC0.

No paid APIs are required.

## Home page background video

- **Source:** `assets/gemini_generated_video_13742e39.mp4`, supplied by the team. It is AI-generated (Google Gemini) and is **not** satellite data.
- **Web copies:** `apps/web/public/media/home/` holds `field-verse-home.webm` (VP9, about 1.5 MB), `field-verse-home.mp4` (H.264, about 2.0 MB) and `field-verse-home-poster.jpg`. The audio is removed and the resolution stays 1280 × 720.
- **Labelling:** the home page states that it is an illustrative AI-generated animation, not real satellite data.
- **Regenerating** (needs ffmpeg):
  ```
  ffmpeg -i assets/gemini_generated_video_13742e39.mp4 -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart apps/web/public/media/home/field-verse-home.mp4
  ffmpeg -i assets/gemini_generated_video_13742e39.mp4 -an -c:v libvpx-vp9 -crf 38 -b:v 0 -row-mt 1 apps/web/public/media/home/field-verse-home.webm
  ffmpeg -i assets/gemini_generated_video_13742e39.mp4 -frames:v 1 -q:v 4 apps/web/public/media/home/field-verse-home-poster.jpg
  ```
- The NASA GIBS NDVI time-lapses in `public/media/` are still used by the region pages.
