# FieldVerse REST API (`/api/v1`)

**Audience:** frontend developers and integrators.

The machine-readable source of truth is [`packages/contracts`](../packages/contracts). This page summarises it.

The API uses JSON throughout. Every response has an `X-Request-Id` header. Errors use one envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [], "requestId": "…" } }
```

## Conventions

- **CSRF:** every non-GET request must send `X-FieldVerse-Client: 1`. When an `Origin` header is present, it must be an allowed origin.
- **Sessions:** the `fv_sid` cookie is HTTP-only and `SameSite=Lax`, and is `Secure` in production. A guest session is created automatically the first time something is saved.
- **Analysis mode override:** the header `X-Analysis-Mode: demo` asks explicitly for labelled demo results. The UI sends it only after the farmer chooses it.
- **Response headers:**
  - `X-Analysis-Provider`: `demo` or `remote`
  - `X-Analysis-Cache`: `hit` or `miss`
  - `X-Data-Origin`: `database` or `fixtures`
- **Rate limits:**
  - 600 requests per 15 minutes overall
  - 60 analysis requests per minute
  - 20 auth attempts per 15 minutes

## Status

| Method | Path | Description |
|---|---|---|
| GET | `/health` | API version, uptime, database status, configured provider |
| GET | `/analysis/status` | Actual adapter state. In remote mode it calls the ML service's `/v1/model-info`. Includes scenario presets. |
| GET | `/data-sources/status` | Every data source, what it is used for, and which regions it covers |

## Reference data (public)

| Method | Path | Description |
|---|---|---|
| GET | `/regions` | Supported regions with display content, seasons, data status and demo farm |
| GET | `/regions/:id` | One region (404 if unknown) |
| GET | `/crops?regionId=` | Crop catalogue, optionally filtered by region |
| GET | `/crops/:id` | One crop |
| GET | `/observations/point?lat=&lon=` | Live NASA POWER (+ SoilGrids) observations for **any location**. Coordinates are rounded to about 1 km and results are cached. Returns 503 `DATA_UNAVAILABLE` if NASA POWER fails. |
| GET | `/observations?regionId=` | Prepared observations as an `EnvironmentSummary`, plus `dataSources` and `preparedAt` |

Reference data comes from MongoDB when it is connected and seeded. Otherwise it comes from the versioned fixtures in `data/demo`.

## Analysis (public, nothing stored)

| Method | Path | Body → Response |
|---|---|---|
| POST | `/rotations/compare` | `RotationComparisonRequest` → `RotationComparisonResponse` |
| POST | `/rotations/scenario` | `ClimateScenarioRequest` → `ClimateScenarioResponse` |
| POST | `/gaps/analyze` | `GapAnalysisRequest` → `GapAnalysisResponse` |

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | The request is malformed or values are out of range |
| 422 | `REGION_NOT_SUPPORTED`, `CROP_NOT_SUPPORTED`, `SCENARIO_NOT_SUPPORTED`, `DATA_UNAVAILABLE` | The provider has no prepared or valid analysis for this input |
| 503 | `ANALYSIS_UNAVAILABLE` | The remote analysis service is down |
| 504 | `ANALYSIS_TIMEOUT` | The remote analysis service timed out |
| 502 | `ANALYSIS_BAD_RESPONSE` | The remote service broke the contract |

In remote mode, failure responses include `details.demoFallbackAvailable: true`.

## Fields (owner-scoped)

| Method | Path | Notes |
|---|---|---|
| GET | `/fields` | The caller's fields (empty without a session) |
| POST | `/fields` | `FieldInput` → 201 `{ field }`. `regionId` may be `"custom"` for any location, and crop ids may be farmer-added slugs. Creates a guest session if needed. Guest records expire after 30 days. |
| GET | `/fields/:id` | 404 if it doesn't exist **or isn't yours** (no information leak) |
| PATCH | `/fields/:id` | `FieldUpdate` (partial) |
| DELETE | `/fields/:id` | 204 |

Without MongoDB, these routes return `503 DATABASE_UNAVAILABLE`.

## Saved scenarios (owner-scoped)

| Method | Path | Notes |
|---|---|---|
| GET | `/scenarios` | The caller's saved plans |
| POST | `/scenarios` | `SavedScenarioInput`. The server reads `mode`, `modelVersion`, `requestId`, `generatedAt` and source ids **from the stored analysis**. |
| GET | `/scenarios/:id` | One plan |
| DELETE | `/scenarios/:id` | 204 |

## Community (`/community`)

The full table is in [COMMUNITY_FEATURE.md](COMMUNITY_FEATURE.md#api-apiv1community).

- **Public:** `GET /experiences`, `/experiences/:id`, `/experiences/:id/related`, `/locations`, `/locations/resolve`, `/categories`.
- **Signed in:** `POST /experiences`, `GET /my-experiences`, `PATCH /experiences/:id`, `DELETE /experiences/:id`, `POST|DELETE /experiences/:id/helpful`, `POST /experiences/:id/report`.
- **Moderators:** `GET /moderation/queue`, `PATCH /moderation/:id`.

Public responses use `PublicExperienceSchema` (strict), which contains no author identity and no coordinates.

## Accounts (optional)

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/session` | `{ authenticated, user, guest }` |
| POST | `/auth/register` | `{ name, email, password ≥ 10 }`. Moves guest data to the new account and rotates the session. |
| POST | `/auth/login` | `{ email, password }`. Rotates the session. |
| POST | `/auth/logout` | 204 |
| PATCH | `/auth/account` | `{ name?, language? }` |
| DELETE | `/auth/account` | `{ password }`. Deletes the account, its fields, scenarios and sessions. |

Passwords are hashed with scrypt (N=16384, r=8, p=1, 16-byte salt). Password reset is **not implemented**, because no email delivery mechanism exists yet.
