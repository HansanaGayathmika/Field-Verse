# FieldVerse

**One Farm. Three Futures. Better Decisions.**
*NASA Space Apps Challenge 2026 — Software Engineering component*

FieldVerse is a farmer-first web app for exploring crop-rotation possibilities. It combines:

- NASA climate observations
- satellite vegetation imagery
- global soil estimates
- the farmer's own knowledge and priorities

This repository is the **MERN application**. It runs on its own with a clearly labelled **Demo Analysis Adapter**, and is ready to connect to the AI/ML team's Python FastAPI service through the **HttpAnalysisAdapter**. That switch needs no frontend changes.

| | |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn-style Radix components, TanStack Query, React Hook Form + Zod, Recharts, Motion, Leaflet, i18next |
| Backend | Node.js, Express 5, TypeScript, MongoDB + Mongoose, Zod, Helmet, CORS, rate limiting |
| Contracts | `packages/contracts` — Zod schemas shared by web, API and the ML handoff (exported as JSON Schema) |
| Real data | NASA POWER, MODIS NDVI (ORNL DAAC), NASA GIBS timelapse videos, ISRIC SoilGrids |
| Tests | Vitest, React Testing Library, Supertest, mongodb-memory-server, Playwright |

## Quick start

```bash
# 1. Install (Node ≥ 20.11)
npm install

# 2. Configure
cp .env.example .env

# 3. Start MongoDB — choose ONE (or skip: the public demo works without a database)
npm run db:memory               # real mongod via mongodb-memory-server, no install needed
docker compose up -d mongo      # or Docker

# 4. Seed reference data (regions + crops)
npm run seed

# 5. Run API (http://localhost:5000/api/v1) + web (http://localhost:5173)
npm run dev
```

Open http://localhost:5173, click **Sign up**, then **Try Demo**. **No Python is required.**

**Access:** logged-out visitors can only *view* the home page; its region and tool cards are display-only. The header shows just **Log in** and **Sign up**. After logging in, users return to the home page with the full navigation. Accounts are stored in MongoDB, so a database must be running (`npm run db:memory`).

### Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API and web in watch mode |
| `npm run test` | Unit and integration tests in all workspaces |
| `npm run test:e2e` | Playwright demo journey on desktop and 360 px mobile. Run `npx playwright install chromium` once, or use an installed browser with `PW_CHANNEL=msedge` (or `chrome`) |
| `npm run typecheck` / `npm run lint` | Type-checking and linting |
| `npm run build` | Builds the API bundle (tsup) and the web bundle |
| `npm run data:prepare` | Re-fetches the prepared observations and rebuilds the satellite videos (needs ffmpeg) |
| `npm run contracts:jsonschema` | Exports the analysis contract as JSON Schema for the Python team |
| `npm run examples -w @fieldverse/api` | Regenerates example contract responses |
| `ML_SERVICE_URL=… npm run verify:ml` | Checks a running FastAPI service against the contract |

### Which variables go where

- **Backend only** (never exposed to the browser): `MONGODB_URI`, `ANALYSIS_PROVIDER`, `ML_SERVICE_URL`, `ML_SERVICE_API_KEY`, `CORS_ORIGIN`, and the other server settings.
- **Frontend** (public, bundled into the page): `VITE_API_BASE_URL` only. Never put secrets in `VITE_` variables.

## Community — "Learn from farmers near you"

Farmers can share experiences anonymously and discover experiences from their own district first, then their province or region, then their country.

- Posts show only a general area (district, province or country) and the farmer's own text. No names, accounts or coordinates are ever shown.
- New posts are reviewed by a moderator. To make a moderator: `npm run make-moderator -w @fieldverse/api -- email@example.org`.
- Community content is personal experience, not data, and never changes the Rotation Lab.

See [docs/COMMUNITY_FEATURE.md](docs/COMMUNITY_FEATURE.md) and [docs/COMMUNITY_PRIVACY.md](docs/COMMUNITY_PRIVACY.md).

## Connecting the AI/ML service

```env
ANALYSIS_PROVIDER=remote
ML_SERVICE_URL=http://localhost:8000
```

See **[docs/ML_HANDOFF.md](docs/ML_HANDOFF.md)** for the endpoints, schemas, units, error formats, provenance rules and contract tests.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [REST API contract](docs/API_CONTRACT.md)
- [ML handoff](docs/ML_HANDOFF.md)
- [Data sources & licences](docs/DATA_SOURCES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Farmer UX guidelines](docs/FARMER_UX_GUIDELINES.md)
- [Feature status](docs/FEATURE_STATUS.md)
- [Community feature](docs/COMMUNITY_FEATURE.md) · [Community privacy](docs/COMMUNITY_PRIVACY.md)
- [Demo script](docs/DEMO_SCRIPT.md)

## Scientific honesty

- Climate, vegetation and soil values come from real prepared datasets, each labelled **Observed** or **Estimated**.
- Rotation strategies, scenario effects and ratings are currently **illustrative demo fixtures**, and the app says so everywhere.
- Nothing in this repository trains or runs an ML model.
- Unsupported inputs return explicit messages, never invented predictions.

*FieldVerse was built for the NASA Space Apps Challenge. It is not an official NASA product.*
