# Roots of Tomorrow: recommendation UI

**Audience:** the FieldVerse team, and the teammate building the Python recommendation engine.

The farmer answers a 5-step form. The UI sends **one `FarmerInput` JSON object** and renders the **`Recommendation` JSON** that comes back. The UI does no agronomy itself. The contract comes from `UI_TEAM_PROMPT.md`.

This is a self-contained module. It does not change any existing FieldVerse page, API or test.

| What | Where |
|---|---|
| Form (5 steps) | `/recommend`, in `apps/web/src/recommend/form/` |
| Results | `/recommend/results`, in `apps/web/src/recommend/results/` |
| API adapter (the only file that talks to the engine) | `apps/web/src/recommend/api/recommend.ts` |
| Contract types | `apps/web/src/recommend/types.ts` |
| Tolerant response reader | `apps/web/src/recommend/normalise.ts` |
| **Crop list (one file; edit here when the engine adds crops)** | `apps/web/src/recommend/config/crops.ts` |
| UI strings (`recommend` i18n namespace) | `apps/web/src/recommend/i18n/en.json` |
| Mock data (copied from `/fixtures`) | `apps/web/src/mocks/fixtures/{inputs,outputs}` |
| Unit tests (all 8 fixtures, adapter, contract) | `apps/web/src/recommend/recommend.test.tsx` |
| Browser test | `tests/e2e/recommend.spec.ts` |

Both routes need a logged-in user, like the other feature pages. They are not linked from the navbar yet; open `/recommend` directly.

## Switching to the real engine

Set these in the repo-root `.env` (Vite reads `VITE_*` variables):

```
VITE_RECOMMEND_MODE=live                      # default: mock
VITE_RECOMMEND_API_URL=http://localhost:8000  # base URL of the Python service (no trailing /api)
```

The UI then calls `POST {VITE_RECOMMEND_API_URL}/api/recommend`. `checkHealth()` uses `GET /api/health`.

- **Cross-origin requests:** the engine must allow the web origin (e.g. `http://localhost:5173`).
- **Don't leave the URL empty in live mode.** The Vite dev proxy would send `/api/*` to the FieldVerse Express server instead of the engine.

**Mock mode (the default):**
- Waits 1–2 s, then returns the fixture of the nearest pilot location:
  - Sri Lanka (8.26, 80.21) → `LK_rainfed_smallholder`
  - Kenya (−0.33, 35.94) → `KE_Njoro_maize_farmer`
  - Brazil (−12.56, −55.72) → `BR_Sorriso_soy_farmer`
- On the dev server only (`npm run dev`), a "Dev: mock fixture" picker chooses any fixture by name. There's also a "fill answers from fixture" button.

**Errors:**

| What happened | What the farmer sees |
|---|---|
| Network failure or timeout (30 s) | Friendly screen with **Try again** |
| HTTP 5xx | Friendly screen with **Try again** |
| HTTP 422 | The engine's `{ "detail": string }` text, and **Change my answers** |
| A response the UI can't read | Friendly screen with **Try again** |

## Behaviour notes

- **"I do not know" never blocks the farmer.** It is on every question except location. Unanswered optional questions are sent as `"unknown"` or `null`.
- **Only four answers are required:** location, current crop, next planting month and water access. "I do not know" counts as an answer for the last three. An entered soil pH must be 3.0–10.0.
- **Answers are saved on the device** (`localStorage`), so a reload or lost connection keeps them. The last submitted input is also saved, for the results page.
- **The results branch on `status`:**
  - `ok`: plans.
  - `provisional`: plans, plus a low-confidence banner with `status_note`.
  - No-plan statuses: `status_note`, `crops_considered` with `why_not`, and a way back to the form.
- **Goal scores** appear in the farmer's priority order and are labelled as relative 0–100 scores, never yields or money.
- **Evidence badges:** text containing "meta-analysis" is shown as strong; text containing "heuristic" or "uncited" is shown as weak.
- **Confidence** is shown with an icon and text, plus "Why this confidence?" with the engine's reasons and note.
- **Unknown or missing fields are tolerated.** Extra fields (e.g. a future `ml_adjusted`) are ignored. Debug fields (`rule_events`, `gaez_classes_*`, `farmer_input_normalised`) appear only in the dev-server "Developer view".
- **Displayed as sent, never interpreted:** `suitability_range` and `suitability_score`. In the fixtures the range can lie above the score.
- **The knowledge base version is visible** under "About this result" (currently "starter-0.1 (unreviewed by agronomists)").

## Adding a language

1. Copy `recommend/i18n/en.json` to e.g. `si.json` and translate it.
2. Register it in `recommend/i18n/index.ts` the same way `en` is registered.

Month names use the browser's locale automatically. Engine text arrives in English for now.
