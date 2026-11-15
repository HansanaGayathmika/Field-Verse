# Architecture

**Audience:** developers joining the FieldVerse SE team.

## Overview

```
fieldverse/
├── apps/web          React 19 + Vite + TypeScript + Tailwind v4 (farmer UI)
├── apps/api          Express 5 + TypeScript + Mongoose (REST API, adapters)
├── packages/contracts Zod schemas shared by web, api and the ML handoff
├── data/demo         Versioned fixtures: real prepared observations + illustrative demo content
├── scripts/          prepare-demo-data.mjs (fetches small NASA/ISRIC point datasets, builds videos)
├── tests/e2e         Playwright journeys
└── docs/
```

## Request flow

```
React page ─(TanStack Query)─► services/api.ts ─fetch /api/v1─► Express route
     ▲                                                             │ Zod validation
     │                                                             ▼
     │                                           analysisService (cache: remote only)
     │                                                             │
     │                                     resolveProvider(): Demo | Http adapter
     │                                                             │
     └──────────── contract-valid JSON ◄───────────────────────────┘
```

- **One seam.** The `AnalysisProvider` interface (`apps/api/src/adapters/analysis/AnalysisProvider.ts`) is the only place analytical logic plugs in. React has no suitability maths.
- **Validated on both sides.** Express validates every request on the way in. It also validates provider responses: the demo adapter calls `Schema.parse()` before returning, and the HTTP adapter calls `safeParse()` and rejects anything that fails.
- **No silent fallback.** If remote mode fails, the API returns an explicit error with `demoFallbackAvailable`. The UI offers a button, and only then sends `X-Analysis-Mode: demo`.

## Backend layers (`apps/api/src`)

| Layer | Responsibility |
|---|---|
| `config/` | Environment parsing (Zod) and a resilient MongoDB connection that never crashes the server and retries every 15 s |
| `middleware/` | Request IDs, CSRF header and origin check, sessions (guest or user identity), error envelope |
| `routes/`, `controllers/` | HTTP mapping only |
| `services/` | Reference data (fixtures with DB preference), analysis cache, password hashing |
| `adapters/analysis/` | `DemoAnalysisAdapter`, `HttpAnalysisAdapter`, provider selection |
| `models/` | User, Session (TTL), Field (partial TTL for guests only), Crop, Region, SavedScenario (partial TTL), EngineCache (TTL) |
| `seeds/` | Idempotent upsert of regions and crops, plus `syncIndexes` |

### Demo adapter honesty rules

- Strategies, scenario effects and gap candidates are **hand-prepared fixtures** with `sourceType: "demo"`.
- Indicator ratings are labelled `ratingType: "illustrative"`. Suitability scores are `null`.
- A few **documented rules** run in Express, and each result says `handling`/`method: "rule"`:
  - Priority ordering: weighted illustrative ratings.
  - The irrigation rule: compares crop water need with observed NASA POWER monthly rain, using thresholds of 40, 75 and 150 mm per month.
  - Constraint flags for seeds, markets, flooding and crop failures.
  - Gap fit: crop duration compared with window length.
- Unsupported inputs throw explicit errors and are never answered with invented results. These include an unprepared crop, a location outside the demo radius, and a scenario that is not a preset.

## Community

The community has its own routes (`routes/community.ts`, mounted at `/api/v1/community`), controller, service (`services/community.ts`) and models (`models/Community.ts`):

- `communityExperiences`, `communityReactions`, `communityReports`.
- **Coarse areas only.** Locations are converted to administrative areas by `services/geocode.ts#resolveAdminArea` (Nominatim reverse, rounded to about 1 km), signed with an HMAC, and stored at the level the farmer chose.
- **Transparent ranking.** A deterministic MongoDB aggregation assigns each post a geographic level (same district, province, country, or elsewhere).
- **Explicit public DTOs** contain no owner or coordinates.
- **Moderation:** premoderation, auto-hide after reports, and a `moderator` role checked in the database.

On the frontend, `features/community/*` and `pages/community/*`. `CommunityAreaProvider` derives the feed area from the farm, or a farmer-chosen area stored in `localStorage`.

Details are in [COMMUNITY_FEATURE.md](COMMUNITY_FEATURE.md).

## Persistence and privacy

- Guest identity is a random id held in a server-side session. The cookie carries only a random token, and only its SHA-256 hash is stored.
- Every field and scenario query is filtered by `ownerKey`. Other users' records return 404, not 403.
- TTL indexes apply only to temporary data: sessions, the engine cache, and guest fields and scenarios (through `partialFilterExpression`). Registered users' records never expire.
- When a guest registers or logs in, their records are moved to the account and become permanent.

## Frontend (`apps/web/src`)

| Folder | Contains |
|---|---|
| `pages/` | One file per route. Heavy pages are code-split. Every route except `/`, `/login` and `/register` is wrapped in `RequireAuth`, which redirects to `/login`. |
| `features/` | Charts, rotations (cards, timeline, disagree panel), roots scene, explorer map, landing art |
| `components/` | UI primitives (shadcn-style on Radix), provenance badges, chart card, timelapse player, status states |
| `contexts/` | `FarmContext` (the farm profile in localStorage; request builders) and `PreferencesContext` (low-bandwidth mode, reduced motion, forced demo) |
| `hooks/queries.ts` | All TanStack Query hooks |
| `i18n/` | i18next. English is complete; si, ta, pt and sw are registered but disabled until reviewed. |

## Why these choices

- **Fixtures plus a DB preference** keep the public demo working with no database. The `X-Data-Origin` header makes the source visible.
- **scrypt from Node's crypto module** gives a memory-hard KDF without a native build step on Windows or ARM.
- **Custom-header CSRF with SameSite=Lax** suits a JSON API. There is no token round-trip, and the custom header forces a CORS preflight.
- **Recharts with a custom HTML/SVG layer** handles charts that need special honesty (soil profile, comparison bars, calendar), so labels and text alternatives are fully controlled.
