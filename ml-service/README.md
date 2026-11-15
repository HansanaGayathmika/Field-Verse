# FieldVerse ML service

A small FastAPI service that connects the Roots of Tomorrow rotation engine and crop suitability model (`Nova-05-main/`) to FieldVerse. The Express API calls it; the browser never does.

```
Browser ──► Express API (/api/v1) ──► ml-service (port 8000) ──► Nova-05-main engine + model
                                                                   reads: dt sets/, ml_inputs/
```

| Endpoint | Used by |
|---|---|
| `POST /v1/rotations/compare` | Rotation Lab and My Plan, through `HttpAnalysisAdapter` (`ANALYSIS_PROVIDER=remote`) |
| `POST /v1/scenarios/analyze` | Climate Time Machine and Roots of Tomorrow |
| `POST /v1/gaps/analyze` | Gap Finder |
| `GET /v1/model-info` | `/api/v1/analysis/status` |
| `POST /api/recommend` | The `/recommend` page, through `POST /api/v1/recommend` (raw engine output) |

**Climate "what if":** the farmer's own prediction, rainfall −50% to +50% and temperature −2 °C to +5 °C.
- The change is applied to every month of the location's NASA POWER climate.
- The engine re-checks each crop's rain and temperature needs, in the same seasons, and re-scores today's plans.
- It also reports which plan it would choose under that climate.
- FAO GAEZ suitability maps describe today's climate, so only the rain and temperature checks change. This is a "what if", not a forecast.

**Gap Finder:** for each run of idle months, it lists engine crops that fit:
- **Sowing month:** each crop gets the earliest month in the gap from which it still fits and is not too cold or hot ("Sow in Apr").
- **Duration:** fits, tight, or too long (counted from that sowing month).
- **Crops you already grow:** kept even if the regional data rates them poorly (same rule as the rotation engine), with a note saying so.
- **Excluded:** crops too cold, too hot, or rated unsuitable here are left out.
- **Rain-limited:** crops that rain alone can't support in those months are listed last, marked "only with irrigation".
- **Rest:** resting the land is always offered.
- **Data:** durations and water needs are the catalogue's starter values.

**What the ML model does:** when the farmer enters a soil-test pH, the suitability model's per-crop adjustment replaces the engine's rule-based pH penalty, before the plans are ranked. The adjustment is blended across management levels exactly like the engine's suitability layers. Without a pH value, the engine runs unchanged. The hook is `PH_ADJUSTER` in `roots_engine.py`.

## Setup (once)

The model file needs **scikit-learn 1.6**, which needs **Python 3.13** (there is no build for 3.14). [`uv`](https://docs.astral.sh/uv/) can download a private Python 3.13 without installing one system-wide:

```
pip install uv
uv venv --python 3.13 ml-service/.venv
uv pip install --python ml-service/.venv/Scripts/python.exe -r ml-service/requirements.txt
```

The data folders must be at the repo root:
- `dt sets/` (`fao_gaez/`, `isric_soilgrids/`, `nasa_gpm/`)
- `ml_inputs/`

To use other locations, set `ROOTS_DATA_DIR`, `ROOTS_ML_INPUTS_DIR` or `ROOTS_ENGINE_DIR`.

## Run

From the repo root:

```
ml-service/.venv/Scripts/python -m uvicorn main:app --app-dir ml-service --host 127.0.0.1 --port 8000
```

Then, in the repo-root `.env`:

```
ANALYSIS_PROVIDER=remote
ML_SERVICE_URL=http://127.0.0.1:8000
VITE_RECOMMEND_MODE=live
```

Restart the API and web dev servers after changing `.env`. Startup takes a few seconds; one comparison takes about 1–4 seconds.

- **Use 127.0.0.1, not localhost:** on Windows, `localhost` can resolve to IPv6 while the service listens on IPv4.
- **Responses are cached:** the API caches engine responses for 6 hours (`ENGINE_CACHE_TTL_SECONDS`). After changing the engine, restart the API and clear the `enginecaches` collection.

**Tests:** the automated tests use demo mode and the sample outputs. Playwright starts its servers with `ANALYSIS_PROVIDER=demo` and `VITE_RECOMMEND_MODE=mock`.
