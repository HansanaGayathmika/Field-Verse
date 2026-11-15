# Feature status

**Audience:** the FieldVerse team and judges.
**Last verified:** 2026-11-14, on Windows 11, Node 24, MongoDB 7.0 (mongodb-memory-server), and Microsoft Edge (Playwright `msedge` channel).

## Verification results

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | ✅ 0 errors, 0 warnings |
| Type-check (contracts, API, web) | `npm run typecheck` | ✅ 0 errors |
| Contract tests | `npm test -w @fieldverse/contracts` | ✅ 14 / 14 |
| API tests: demo adapter, HTTP adapter, endpoints, MongoDB/auth | `npm test -w @fieldverse/api` | ✅ 51 / 51 |
| Web component tests | `npm test -w @fieldverse/web` | ✅ 9 / 9 |
| Production build (tsup + Vite) | `npm run build` | ✅ Built; bundled API started and served `/regions` |
| End-to-end, desktop + 360 px mobile (needs MongoDB for sign-up) | `PW_CHANNEL=msedge npm run test:e2e` | ✅ 10 / 10, with zero browser console errors in the main journey |
| Login gate: guest header, display-only cards, protected routes, redirect home after login | e2e | ✅ |
| Worldwide locations (map tap, typed coordinates, device location), live NASA POWER/SoilGrids, farmer-added crops | API tests + e2e | ✅ |

## Bugs found and fixed while testing

1. **Wizard skipped its Review step.** React reused the same `<button>` node, so the last "Continue" click became a submit. The buttons now have separate keys, and pressing Enter before the last step advances instead of submitting.
2. **Animated SVG circles rendered without a radius,** which caused console errors. They now use plain CSS transitions.
3. **Crop images rendered with an empty `href`** while the crop catalogue loaded. They now render only once the crop is known.
4. **Duplicate Vite installs** broke type-checking. The web app was aligned on Vite 7.
5. **An all-null SoilGrids response was shown as "Estimated" soil.** Empty soil and NDVI blocks are now reported as **Not available**.
6. **Layout and accessibility polish:** navigation wrapping at 1366 px, cramped strategy cards, a clipped soil label, and redundant chart ARIA labels.

## Status legend

| Status | Meaning |
|---|---|
| ✅ | Implemented and tested (automated tests or a verified browser run) |
| 🟡 | Implemented, not covered by automated tests (exercised manually or partly) |
| ⬜ | Not implemented |
| ⛔ | Blocked |

## Analysis source legend

| Label | Meaning |
|---|---|
| **P** | Prepared observations (real data) |
| **D** | Illustrative demo fixtures |
| **R** | Documented rules |
| **ML** | Connected real ML inference |
| **U** | Unavailable data |

## Data & assets

| Feature | Status | Source | Notes |
|---|---|---|---|
| NASA POWER climatology + annual (3 regions) | ✅ | P | |
| SoilGrids soil layers | ✅ Sri Lanka, Kenya · U Brazil | P / U | SoilGrids returns no values at the Sorriso point, so the app shows "Not available" |
| MODIS NDVI 2023–2024 (3 regions) | ✅ | P | |
| NASA GIBS NDVI timelapse videos (3 regions + global hero) | ✅ | P | |
| 9 original crop illustrations | ✅ | – | Visually checked |
| Demo fixtures (rotations, scenarios, gaps) | ✅ | D | Schema-validated by tests for all 3 regions |
| Contract example responses + JSON Schema | ✅ | – | Generated and validated |

## Backend

| Feature | Status | Source |
|---|---|---|
| Express app, Helmet, CORS, rate limits, request IDs, error envelope | ✅ | – |
| Runs without MongoDB, then reconnects automatically when it appears | ✅ (verified live) | – |
| `DemoAnalysisAdapter` (compare / scenario / gaps / model info) | ✅ | D + R |
| `HttpAnalysisAdapter` (validation, timeouts, error mapping), tested with mocked fetch | ✅ | ML-ready (not connected) |
| No silent fallback; explicit `X-Analysis-Mode: demo` | ✅ | – |
| Regions / Crops / Observations (database, with fixture fallback) | ✅ | P |
| Field CRUD with owner isolation; guest TTL | ✅ | – |
| Saved scenarios with server-derived provenance | ✅ | – |
| Accounts: register, login, logout, delete; scrypt; guest-data adoption | ✅ | – |
| EngineCache (remote responses only) | 🟡 | Remote path covered only through mocks |
| `verify:ml` script | 🟡 | Needs a real FastAPI service |

## Frontend

| Feature | Status | Source |
|---|---|---|
| Landing page with full-page background video (AI-generated intro animation, labelled as such) | ✅ | P |
| Global Farm Explorer: any location worldwide (map tap, coordinates, "Use my current location"), live data panel, demo list, timelapse | ✅ | P (live) |
| Farmer-added crops in setup (plus the default catalogue) | ✅ | farmer_provided |
| Farmer input form per *Farmer Input Form Specification* (location-only step 1, timing questions, water/waterlogging/inputs, excluded crops, 6 priorities, review notice) | ✅ | farmer_provided |
| Village/town search (OpenStreetMap Nominatim via server, throttled and cached) | ✅ | – |
| Wheat and cassava added to the crop catalogue | ✅ | estimated |
| Rotation, scenario and gap analysis for custom locations | ⛔ Needs the AI/ML service | U (honest message shown) |
| 5-step onboarding wizard | ✅ | – |
| My Farm dashboard and charts with data-computed takeaways | ✅ | P / U |
| Rotation Lab + comparison bars | ✅ | D |
| Farmer's Right to Disagree | ✅ | R |
| Recommendation detail | ✅ | D |
| Climate Time Machine (presets + unsupported-combination refusal) | ✅ | D + P |
| Roots of Tomorrow (region switch, seasons, soil layers) | ✅ | P + D |
| Gap Finder + add to plan | ✅ | D + R + P |
| Decision card | ✅ | D |
| Save plan, Saved page, Auth pages UI | 🟡 | – |
| Low-bandwidth mode / reduced motion | 🟡 | – |
| Mobile 360 px (no horizontal overflow, menu, demo journey) | ✅ | – |
| i18n: English complete; si/ta/pt/sw planned and disabled | 🟡 | – |

## Community (P2 → implemented)

| Feature | Status | Notes |
|---|---|---|
| Location-based feed (district → province → country → other countries), filters, search, sort, pagination | ✅ API + e2e tests | Deterministic rule, no ML |
| Server-side anonymity (strict public DTOs, coarse signed areas, no coordinates) | ✅ API + e2e tests | |
| Share form with preview and privacy check; guest draft; login required to publish | ✅ e2e | |
| My experiences: status, edit (re-review), delete | ✅ API + e2e | |
| Helpful reactions (one per account, undo) | ✅ API + e2e | |
| Reports, auto-hide after 3, moderation queue and actions | ✅ API + e2e | Premoderation on by default |
| Related experiences with reasons | ✅ e2e | |
| Rotation Lab links (labelled not verified) | ✅ e2e | |
| Photo upload (secure re-encoding, EXIF/GPS removal) | ⬜ Deferred | Needs an image-processing library; the UI says photos are not supported yet |
| Community link in the logged-out header | ⬜ | The guest header shows only Log in and Sign up, as requested earlier. Guests can still open `/community` directly. |

## Not implemented (P2)

- Extension officer dashboard
- Notifications
- PWA offline mode
- Administration
- Password reset (no email service)

## ML integration

**Not connected.** Integration is complete only after the AI/ML FastAPI service passes `npm run verify:ml` and the end-to-end suite passes with `ANALYSIS_PROVIDER=remote`.
