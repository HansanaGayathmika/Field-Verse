"""
FieldVerse ML service: wraps the Roots of Tomorrow rotation engine and suitability model (Nova-05-main)
behind the contract the Express API already uses (docs/ML_HANDOFF.md, HttpAnalysisAdapter).

  GET  /health                 liveness
  GET  /v1/model-info          ModelInfo
  POST /v1/rotations/compare   RotationComparisonRequest -> RotationComparisonResponse (engine + ML)
  POST /v1/scenarios/analyze   ClimateScenarioRequest -> same plans re-scored under the farmer's rainfall/temperature change
  POST /v1/gaps/analyze        GapAnalysisRequest -> crops (or rest) that fit the farmer's idle months
  POST /api/recommend          raw engine output for the /recommend page (UI_TEAM_PROMPT.md contract)

Run (from the repo root):  ml-service/.venv/Scripts/python -m uvicorn main:app --app-dir ml-service --port 8000
"""
from __future__ import annotations

import datetime as dt
import contextlib
import json
import math
import os
import sys
import threading
import uuid

import numpy as np

from fastapi import Body, FastAPI
from fastapi.responses import JSONResponse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.environ.get("ROOTS_ENGINE_DIR", os.path.join(ROOT, "Nova-05-main"))
DATA_DIR = os.environ.get("ROOTS_DATA_DIR", os.path.join(ROOT, "dt sets"))
ML_INPUTS_DIR = os.environ.get("ROOTS_ML_INPUTS_DIR", os.path.join(ROOT, "ml_inputs"))
sys.path.insert(0, ENGINE_DIR)

import roots_engine as E  # noqa: E402
from ml_adjust import SoilAdjuster  # noqa: E402
from ml_features import FeatureBuilder, adjust_for_farmer  # noqa: E402

# ------------------------------------------------------------------ load once
KB = E.KnowledgeBase(os.path.join(ENGINE_DIR, "kb"))
DATA = E.RootsData(DATA_DIR, KB, power_dir=ML_INPUTS_DIR)
META_PATH = os.path.join(ENGINE_DIR, "model_metadata_v2.json")
with open(META_PATH, encoding="utf-8") as fh:
    META = json.load(fh)
ADJUSTER = SoilAdjuster(os.path.join(ENGINE_DIR, "roots_suitability_model_v2.joblib"), META_PATH)
FEATURES = FeatureBuilder(DATA_DIR, ML_INPUTS_DIR, META_PATH)
MGMT = ["HRLM", "HILM", "LRLM", "LILM"]


_ML_CACHE: dict = {}


def _ml_ph_adjuster(n):
    """Model pH effect per crop, blended over management layers with the engine's own central weights (cached)."""
    key = (round(n["lat"], 4), round(n["lon"], 4), n["soil_ph"], n["water_access"], n["input_level"])
    if key in _ML_CACHE:
        return _ML_CACHE[key]
    a, b = E._scenario_weights(n["water_access"], n["input_level"])
    a, b = a[0], b[0]
    w = {"LRLM": (1 - a) * (1 - b), "HRLM": (1 - a) * b, "LILM": a * (1 - b), "HILM": a * b}
    out = {c: 0.0 for c in KB.crops}
    for m in MGMT:
        if w[m] <= 0:
            continue
        d = adjust_for_farmer(FEATURES, ADJUSTER, n["lat"], n["lon"], KB.crops, m, n["soil_ph"])
        for c in KB.crops:
            v = d.get(c, 0.0)
            out[c] += w[m] * (v if math.isfinite(v) else 0.0)
    if len(_ML_CACHE) > 500:
        _ML_CACHE.clear()
    _ML_CACHE[key] = out
    return out


E.PH_ADJUSTER = _ml_ph_adjuster

# Climate "what if": the engine reads each location's monthly rainfall and temperature from its site profile.
# For a scenario request, the profile's monthly values are shifted (rain x (1 + %/100), temperature + degC) for the
# current request thread only, so every engine check (rain fit, temperature limits, seasons) uses the farmer's climate.
_SHIFT = threading.local()
_build_site_profile = E.build_site_profile


def _shifted_site_profile(n, data, kb, as_of_month):
    site, *rest = _build_site_profile(n, data, kb, as_of_month)
    rain, temp = getattr(_SHIFT, "rain", 0.0), getattr(_SHIFT, "temp", 0.0)
    if rain and site["_clim"] is not None:
        site["_clim"] = site["_clim"] * (1 + rain / 100.0)
        if site.get("rainfall"):
            site["rainfall"]["monthly_mean_mm"] = [round(float(x), 1) for x in site["_clim"]]
            site["rainfall"]["annual_mm"] = round(float(site["_clim"].sum()), 0)
            site["rainfall"]["wet_months_ge_100mm"] = int((site["_clim"] >= 100).sum())
    if temp and site["_temp"] is not None:
        site["_temp"] = site["_temp"] + temp
        if site.get("temperature"):
            site["temperature"]["monthly_mean_c"] = [round(float(x), 1) for x in site["_temp"]]
            site["temperature"]["annual_mean_c"] = round(float(site["_temp"].mean()), 1)
    return (site, *rest)


E.build_site_profile = _shifted_site_profile


@contextlib.contextmanager
def _climate(rain, temp):
    _SHIFT.rain, _SHIFT.temp = float(rain), float(temp)
    try:
        yield
    finally:
        _SHIFT.rain, _SHIFT.temp = 0.0, 0.0

MODEL_VERSION = f"roots-engine {E.KB_VERSION} + suitability model {META.get('version', 'v2')}"[:100]
app = FastAPI(title="FieldVerse ML service", version="1.0")


# ------------------------------------------------------------------ helpers
def _error(status, code, message, details=None):
    body = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status, content=body)


def _clean(o):
    """JSON-safe copy: numpy scalars -> Python, NaN/inf -> None."""
    if isinstance(o, dict):
        return {str(k): _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if hasattr(o, "item") and not isinstance(o, (str, bytes)):
        o = o.item()
    if isinstance(o, float) and not math.isfinite(o):
        return None
    return o


def _now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _slug(crop_id: str) -> str:
    """Engine crop id -> FieldVerse slug (rice / common-bean match the existing crop catalogue)."""
    return {"wetland_rice": "rice", "phaseolus_bean": "common-bean"}.get(crop_id, crop_id.replace("_", "-"))


def _levels(weights: dict) -> dict:
    """FieldVerse priority weights (form level 0-3 / total) -> engine priority levels."""
    names = ["not_important", "slightly_important", "important", "very_important"]
    keys = {"water": "water_saving", "soilHealth": "soil_health", "risk": "risk_reduction", "income": "income",
            "idleLand": "fallow_use", "foodSecurity": "food_security"}
    w = {g: float(weights.get(k) or 0) for k, g in keys.items()}
    for total in range(1, 19):  # exact inverse of the form's normalisation when possible
        lv = {g: round(v * total) for g, v in w.items()}
        if sum(lv.values()) == total and all(0 <= x <= 3 for x in lv.values()) and all(abs(w[g] - lv[g] / total) <= 0.006 for g in w):
            return {g: names[x] for g, x in lv.items()}
    top = max(w.values()) or 1.0  # older profiles: proportional to the most important goal
    return {g: names[max(0, min(3, round(3 * v / top)))] for g, v in w.items()}


def _farmer_input(req: dict):
    """RotationComparisonRequest -> engine farmer input (+ how each farmer constraint was handled)."""
    f = req["field"]
    hist = f.get("cropHistory") or []
    water = {"none": "rainfall_only", "limited": "limited_irrigation", "full": "reliable_irrigation"}.get(f.get("irrigation"), "unknown")
    logging = {"several_weeks": "weeks", "few_days": "days", "drains_well": "none"}.get(f.get("waterlogging"), "unknown")
    hm = f.get("harvestMonth")
    excluded = list(f.get("excludedCrops") or [])
    applied = []
    for c in req.get("constraints") or []:
        t, crop = c.get("type"), c.get("cropId")
        if t in ("seeds_unavailable", "cannot_sell", "crop_failed_before", "excluded_crop") and crop:
            excluded.append(crop)
            applied.append({"constraint": c, "handled": True, "handling": "rule", "message": f"{crop} is left out of the plans."})
        elif t == "no_irrigation":
            water = "rainfall_only"
            applied.append({"constraint": c, "handled": True, "handling": "rule", "message": "Plans assume rain-fed farming (no irrigation)."})
        elif t == "soil_floods":
            logging = "weeks"
            applied.append({"constraint": c, "handled": True, "handling": "rule", "message": "Plans assume water stands for weeks in the rainy season."})
        else:
            applied.append({"constraint": c, "handled": False, "handling": "not_supported", "message": "The rotation engine cannot use this correction yet."})
    farmer = {
        "location": {"lat": f["latitude"], "lon": f["longitude"]},
        "current_crop": f.get("currentCrop") or "unknown",
        "harvest_month": "already_harvested" if hm == "harvested" else hm,
        "previous_crop": hist[0] if len(hist) > 0 else "unknown",
        "previous_crop_2": hist[1] if len(hist) > 1 else "unknown",
        "next_planting_month": f.get("nextPlantingMonth"),
        "seasons_per_year": f.get("seasonsPerYear"),
        "water_access": water,
        "waterlogging": logging,
        "input_level": f.get("inputLevel") or "unknown",
        "soil_texture": f.get("soilType") or "unknown",
        "soil_ph": f.get("soilPh"),
        "excluded_crops": excluded,
        "priorities": _levels(req.get("priorities") or {}),
    }
    return farmer, applied


GOAL_LABEL = {"water_saving": "Water saving", "soil_health": "Soil health", "risk_reduction": "Lower production risk",
              "income": "Income potential", "fallow_use": "Use of idle land", "food_security": "Household food supply"}
MONTH = {m: i + 1 for i, m in enumerate(E.MONTH_NAME)}


def _level(score):
    return "unknown" if score is None else ("high" if score >= 70 else "medium" if score >= 45 else "low")


def _indicators(goals: dict):
    return [{
        "id": g, "label": GOAL_LABEL[g],
        "rating": max(1, min(5, 1 + round(float(v) / 25))),
        "direction": "higher_is_better", "ratingType": "rule", "sourceType": "modelled",
        "explanation": f"Relative engine score {float(v):.0f}/100 for comparing plans — not a yield or money value.",
    } for g, v in goals.items() if g in GOAL_LABEL]


def _step(crop_id, plant_month, duration_days, season_no, notes=None):
    start = MONTH.get(plant_month, 1)
    end = (start - 1 + max(0, round((duration_days or 30) / 30.4) - 1)) % 12 + 1
    return {
        "cropId": "fallow" if crop_id == "fallow" else _slug(crop_id),
        "role": "fallow" if crop_id == "fallow" else "main",
        "season": {"name": f"Season {season_no}", "startMonth": start, "endMonth": end},
        "plantingWindow": {"startMonth": start, "endMonth": start},
        "notes": "; ".join(notes)[:500] if notes else None,
    }


def _soil_cover(steps):
    """Calendar months with a crop in the ground (the months the Rotation Lab timeline fills)."""
    months = set()
    for st in steps:
        if st["role"] == "fallow":
            continue
        m, end = st["season"]["startMonth"], st["season"]["endMonth"]
        while True:
            months.add(m)
            if m == end:
                break
            m = m % 12 + 1
    return {"monthsCovered": len(months), "notes": ["Months with a crop in the ground across the three seasons, from typical crop durations."],
            "sourceType": "modelled"}


def _uncertainty(conf):
    level = {"High": "low", "Medium": "medium", "Low": "high"}.get(conf.get("level"), "unknown")
    notes = " ".join([conf.get("note") or ""] + list(conf.get("reasons") or []))[:800]
    return {"level": level, "notes": notes or "No notes from the engine."}


def _alternative(plan, rec):
    seq = plan["sequence"]
    vs = plan.get("vs_current_practice")
    water = "unknown"
    if vs:
        dw = vs["goal_changes"].get("water_saving", 0)
        water = "lower" if dw > 5 else "higher" if dw < -5 else "similar"
    agro = plan["scores"]["agronomic_fit"]
    name = " – ".join(s["crop_name"] for s in seq)
    sources = sorted({s["id"] for b in plan["benefits"] for s in b.get("sources", [])})
    steps = [_step(s["crop"], s["plant_month"], s["approx_duration_days"], s["season"], s.get("notes")) for s in seq]
    return {
        "id": f"plan-{plan['option']}-" + "-".join(_slug(s["crop"]) for s in seq)[:50].rstrip("-"),
        "name": name[:120],
        "kind": "alternative",
        "summary": plan["label"][:400],
        "steps": steps,
        "feasibility": {
            "status": "needs_review" if rec["status"] == "provisional" else "feasible",
            "reasons": [rec["status_note"][:400]] if rec["status"] == "provisional" and rec.get("status_note") else [],
        },
        "suitability": {"level": _level(agro), "score": round(agro, 1), "scoreType": "model", "sourceType": "modelled"},
        "indicators": _indicators(plan["scores"]["goals"]),
        "water": {"relativeDemand": water, "sourceType": "modelled",
                  "notes": [] if vs else ["Not compared: your current crop could not be scored here."]},
        "soilCover": _soil_cover(steps),
        "benefits": [{"text": f"{b['title']}: {b['text']}"[:600], "sourceType": "estimated"} for b in plan["benefits"]],
        "risks": [{"text": t[:600], "severity": "medium", "sourceType": "modelled"} for t in plan["trade_offs"]],
        "explanation": {
            "summary": f"{plan['label']}. Composite score {plan['scores']['composite']:.0f}/100 for your priorities "
                       f"(agronomic fit {agro:.0f}/100)."[:800],
            "details": [(f"Season {s['season']} – {s['crop_name']}: "
                         + ("the land rests this season." if s["crop"] == "fallow" or s.get("suitability_score") is None else
                            f"suitability {s['suitability_score']:.0f}/100, rain fit {(s.get('rain_fit') or {}).get('status', 'unknown')}."))[:800]
                        for s in seq],
            "technical": (vs["note"] + f" Change vs current practice: {vs['composite_change']:+.1f} points.")[:2000] if vs else None,
        },
        "dataGaps": [],
        "localChecks": sorted({c for b in plan["benefits"] for c in b.get("conditions", [])})[:6],
        "uncertainty": _uncertainty(rec["confidence"]),
        "constraintFlags": [],
        "priorityFit": None,  # set after ranking
        "sourceIds": ["roots-engine", "roots-ml-model", *sources],
    }


def _current(rec):
    """Current practice as a strategy, plus its composite score; None when the engine has no reference."""
    ref = rec.get("current_practice_reference")
    if not ref or not ref.get("sequence"):
        return None
    considered = {c["crop"]: c for c in rec.get("crops_considered", [])}
    plan_months = [s["plant_month"] for s in rec["site_profile"].get("season_plan", [])]
    steps, scores, reasons = [], [], []
    for i, crop in enumerate(ref["sequence"]):
        cat = KB.catalog.loc[crop] if crop in KB.catalog.index else None
        dur = (cat.duration_min_d + cat.duration_max_d) / 2 if cat is not None else 30
        steps.append(_step(crop, plan_months[i] if i < len(plan_months) else "Jan", dur, i + 1))
        cc = considered.get(crop)
        if cc:
            scores.append(cc["suitability_score"])
            reasons += cc.get("why_not", [])
    score = round(sum(scores) / len(scores), 1) if scores else None
    name = " – ".join("Fallow" if c == "fallow" else KB.catalog.loc[c, "name"] if c in KB.catalog.index else _slug(c) for c in ref["sequence"])
    return {
        "id": "current-" + "-".join(_slug(c) for c in ref["sequence"])[:52].rstrip("-"),
        "name": f"{name} (current)"[:120],
        "kind": "current",
        "summary": "Repeating what you grow now for the next three seasons, scored with the same method.",
        "steps": steps,
        "feasibility": {"status": "needs_review" if reasons else "feasible", "reasons": sorted(set(reasons))[:5]},
        "suitability": {"level": _level(score), "score": score, "scoreType": "model" if score is not None else "none", "sourceType": "modelled"},
        "indicators": _indicators(ref.get("goals", {})),
        "water": {"relativeDemand": "similar", "notes": [], "sourceType": "modelled"},
        "soilCover": _soil_cover(steps),
        "benefits": [], "risks": [],
        "explanation": {"summary": f"Your current practice. Composite score {ref.get('composite', 0):.0f}/100 for your priorities.", "details": []},
        "dataGaps": [], "localChecks": [],
        "uncertainty": _uncertainty(rec["confidence"]),
        "constraintFlags": [],
        "priorityFit": None,
        "sourceIds": ["roots-engine", "roots-ml-model"],
    }, float(ref.get("composite", 0))


def _environment(req, rec):
    """The engine's own site data for this field (NASA POWER climate + SoilGrids soil at the suitability cell)."""
    sp = rec.get("site_profile") or {}
    rain, temp, soil = sp.get("rainfall") or {}, sp.get("temperature") or {}, sp.get("soil") or {}
    rm, tm = rain.get("monthly_mean_mm"), temp.get("monthly_mean_c")

    def num(v, nd=1):
        return None if v is None or (isinstance(v, float) and not math.isfinite(v)) else round(float(v), nd)

    period = "2001–2020 average"
    climate = None
    if rm and len(rm) == 12:
        climate = {"monthly": [{"month": i + 1, "rainfallMm": None if num(rm[i]) is None else max(0.0, num(rm[i])),
                                "temperatureMeanC": num(tm[i]) if tm and len(tm) == 12 else None} for i in range(12)],
                   "period": period, "sourceId": "nasa-power", "sourceType": "observed"}
    soil_vals = {"phH2O": num(soil.get("ph"), 2), "organicCarbonGPerKg": num(soil.get("organic_carbon_g_kg")),
                 "clayPercent": num(soil.get("clay_pct")), "sandPercent": num(soil.get("sand_pct")),
                 "siltPercent": num(soil.get("silt_pct")), "nitrogenGPerKg": num(soil.get("total_nitrogen_g_kg"), 2)}
    soil_block = ({"layers": [{"depthLabel": "0-30 cm", "topCm": 0, "bottomCm": 30, "values": soil_vals}],
                   "sourceId": "isric-soilgrids", "sourceType": "estimated"}
                  if any(v is not None for v in soil_vals.values()) else None)

    def mv(v, unit, sid, stype, per=None):
        return None if v is None else {"value": v, "unit": unit, "sourceType": stype, "sourceId": sid, "period": per}
    return {
        "location": {"latitude": req["field"]["latitude"], "longitude": req["field"]["longitude"]},
        "climate": climate, "annual": None, "soil": soil_block, "vegetation": None, "media": None,
        "highlights": {
            "annualRainfallMm": mv(num(rain.get("annual_mm"), 0), "mm/year", "nasa-power", "observed", period),
            "meanTemperatureC": mv(num(temp.get("annual_mean_c")), "°C", "nasa-power", "observed", period),
            "topsoilPh": mv(num(soil.get("ph")), "pH", "isric-soilgrids", "estimated", "0-30 cm"),
            "topsoilOrganicCarbonGPerKg": mv(num(soil.get("organic_carbon_g_kg")), "g/kg", "isric-soilgrids", "estimated", "0-30 cm"),
        },
    }


def _data_sources(rec):
    base = [
        {"id": "roots-engine", "name": "Roots of Tomorrow rotation engine", "provider": "FieldVerse AI/ML team", "sourceType": "modelled",
         "datasetVersion": E.KB_VERSION, "notes": "Rule-based ranking over GAEZ suitability; rotation points are ranking heuristics, not yield forecasts."},
        {"id": "roots-ml-model", "name": "Crop suitability model (gradient boosting)", "provider": "FieldVerse AI/ML team", "sourceType": "modelled",
         "datasetVersion": META.get("version"), "notes": "Adjusts crop suitability for a farmer-entered soil pH. Test MAE about 6.6 index points."},
        {"id": "fao-gaez-v5", "name": "FAO GAEZ v5 crop suitability", "provider": "FAO / IIASA", "sourceType": "estimated", "spatialResolution": "about 55 km sample grid"},
        {"id": "isric-soilgrids", "name": "SoilGrids 2.0", "provider": "ISRIC", "sourceType": "estimated", "license": "CC-BY 4.0"},
        {"id": "nasa-gpm-imerg", "name": "NASA GPM IMERG monthly rainfall", "provider": "NASA", "sourceType": "observed", "temporalCoverage": "2015-2025"},
        {"id": "nasa-power", "name": "NASA POWER monthly climate", "provider": "NASA", "sourceType": "observed", "temporalCoverage": "2001-2020"},
    ]
    seen = set()
    for p in rec.get("plans", []):
        for b in p.get("benefits", []):
            for s in b.get("sources", []):
                if s["id"] in seen:
                    continue
                seen.add(s["id"])
                ref = {"id": s["id"], "name": s["cite"][:200], "sourceType": "estimated"}
                if str(s.get("url", "")).startswith("http"):
                    ref["url"] = s["url"]
                base.append(ref)
    return base


# ------------------------------------------------------------------ endpoints
@app.get("/health")
def health():
    return {"status": "ok", "modelVersion": MODEL_VERSION}


@app.get("/v1/model-info")
def model_info():
    return {
        "schemaVersion": "1.0", "provider": "remote", "name": "Roots of Tomorrow engine + crop suitability model",
        "modelVersion": MODEL_VERSION, "status": "ready",
        "capabilities": {"rotationComparison": True, "climateScenario": True, "gapAnalysis": True, "constraints": "rules", "scenarioInput": "continuous"},
        "supportedRegions": ["custom", "sri-lanka-anuradhapura", "kenya-nakuru", "brazil-mato-grosso"],
        "supportedCrops": sorted({_slug(c) for c in KB.crops}),
        "trainingDataSummary": "FAO GAEZ v5 attainable yields (85,857 cells), ISRIC SoilGrids, NASA POWER 2001-2020 climate.",
        "notes": "Works for any location. Climate 'what if' accepts any rainfall (-50..+50%) and temperature (-2..+5 degC) change.",
    }


def _comparison(req: dict):
    """Engine baseline for one request -> (rec, strategies, constraint results, limitations, farmer) or an error response."""
    try:
        farmer, applied = _farmer_input(req)
        rec = E.recommend(farmer, DATA, KB)
        moved = None
        best_m = rec.get("suggested_planting_month")
        if not rec["plans"] and best_m:
            # The farmer's planting month is too cold/dry/short here (e.g. January in a temperate winter).
            # Use the month the engine itself says opens the most crops, and say so plainly.
            retry = E.recommend({**farmer, "next_planting_month": best_m}, DATA, KB)
            if retry["plans"]:
                asked = farmer.get("next_planting_month")
                asked_name = E.MONTH_NAME[asked - 1] if isinstance(asked, int) and 1 <= asked <= 12 else "the month you gave"
                moved = (f"Planting in {asked_name} leaves too few crops that can grow here (too cold, dry or short a season), "
                         f"so no rotation could be built for that month. These plans start in {E.MONTH_NAME[best_m - 1]} instead, "
                         f"the planting month that opens the most crops at your field. "
                         f"To keep them, change 'When do you plan to plant your next crop?' in your farm answers.")
                farmer, rec = {**farmer, "next_planting_month": best_m}, retry
    except (KeyError, ValueError, TypeError) as e:
        return _error(422, "VALIDATION_ERROR", f"The field description could not be used: {e}")
    if not rec["plans"]:
        return _error(422, "DATA_UNAVAILABLE", rec.get("status_note") or "No valid rotation could be built for these answers.",
                      {"status": rec["status"], "cropsConsidered": [{"crop": _slug(c["crop"]), "whyNot": c["why_not"]} for c in rec["crops_considered"]]})
    current = _current(rec)
    plans = rec["plans"][: (2 if current else 3)]  # Rotation Lab compares three options side by side
    alts = [_alternative(p, rec) for p in plans]
    composites = ([current[1]] if current else []) + [p["scores"]["composite"] for p in plans]
    strategies = ([current[0]] if current else []) + alts
    for rank, i in enumerate(sorted(range(len(strategies)), key=lambda k: -composites[k]), start=1):
        strategies[i]["priorityFit"] = {"rank": rank, "method": "rule", "explanation": "Ordered by the engine's composite score for your priorities."}
    seqs = ([rec["current_practice_reference"]["sequence"]] if current else []) + [[s["crop"] for s in p["sequence"]] for p in plans]
    no_current = None if current else ("Repeating your current crop for three seasons could not be scored here (the engine rates it "
                                       "unsuitable in at least one season), so three alternatives are shown.")
    limitations = [x[:800] for x in [moved, no_current, rec.get("status_note"), *rec.get("warnings", []), *rec.get("assumptions", [])] if x]
    return rec, strategies, seqs, applied, limitations, farmer


def _base_response(req: dict, rec, limitations):
    f = req["field"]
    return {
        "schemaVersion": "1.0", "requestId": str(uuid.uuid4()), "mode": "remote", "modelVersion": MODEL_VERSION,
        "region": {"id": req.get("regionId") or "custom", "name": f"Field at {f['latitude']:.2f}, {f['longitude']:.2f}", "country": "",
                   "countryCode": "ZZ", "latitude": f["latitude"], "longitude": f["longitude"]},
        "limitations": limitations,
        "dataSources": _data_sources(rec) if rec else _data_sources({}),
        "disclaimer": ((rec or {}).get("disclaimer") or E.DISCLAIMER)[:800],
        "generatedAt": _now(),
    }


BASELINE = {"rainfallChangePercent": 0, "temperatureChangeCelsius": 0, "presetId": "baseline", "label": "Today's climate (baseline)"}


def _scenario_label(rain, temp):
    parts = []
    if rain:
        parts.append(f"{abs(rain):g}% {'less' if rain < 0 else 'more'} rain")
    if temp:
        parts.append(f"{abs(temp):g} °C {'warmer' if temp > 0 else 'cooler'}")
    return ", ".join(parts) or "Today's climate (baseline)"


@app.post("/v1/rotations/compare")
def compare(req: dict = Body(...)):
    scen = req.get("scenario") or {}
    if scen.get("rainfallChangePercent", 0) or scen.get("temperatureChangeCelsius", 0):
        return _error(422, "SCENARIO_NOT_SUPPORTED", "Use the climate scenario endpoint for 'what if' climates.")
    out = _comparison(req)
    if isinstance(out, JSONResponse):
        return out
    rec, strategies, _seqs, applied, limitations, _farmer = out
    return _clean({**_base_response(req, rec, limitations), "analysisType": "rotation_comparison", "environment": _environment(req, rec),
                   "scenario": BASELINE, "strategies": strategies, "constraintsApplied": applied})


def _score_under(farmer, rec, seqs, rain, temp):
    """Score fixed crop sequences with the climate shifted, in the exact seasons of today's plan (so plans stay comparable)."""
    n = E.normalise_input(farmer, KB)
    month = dt.date.today().month
    sp = rec["site_profile"]
    length = 12 / max(1, int(sp["seasons_per_year_used"])) * 30.4
    seasons = [{"index": s["season"], "plant_month": MONTH[s["plant_month"]], "length_days": length} for s in sp["season_plan"]]
    with _climate(rain, temp):
        site, _w, _notes, cls, sat_tex, _i = E.build_site_profile(n, DATA, KB, month)
    table = E.evaluate(n, site, cls, sat_tex, KB, seasons, 10)
    hist = [n["previous_crop_2"], n["previous_crop"], n["current_crop"]]
    out = []
    for seq in seqs:
        entries = [table[k][c] for k, c in enumerate(seq) if c != E.FALLOW]
        sc = E.score_sequence(seq, hist, table, n, KB, seasons, 10, check=False)
        out.append({"sc": sc, "entries": entries, "seq": seq})
    return out, site


@app.post("/v1/scenarios/analyze")
def scenarios(req: dict = Body(...)):
    scen = req.get("scenario") or {}
    rain = float(scen.get("rainfallChangePercent") or 0)
    temp = float(scen.get("temperatureChangeCelsius") or 0)
    out = _comparison(req)
    if isinstance(out, JSONResponse):
        return out
    rec, strategies, seqs, applied, limitations, farmer = out
    before, base_site = _score_under(farmer, rec, seqs, 0, 0)
    after, new_site = _score_under(farmer, rec, seqs, rain, temp)

    modified, changes = [], []
    for s, b, a in zip(strategies, before, after):
        s = json.loads(json.dumps(_clean(s)))  # independent copy
        bad = []
        for eb, e in zip(b["entries"], a["entries"]):
            if e["valid"]:
                continue
            for r in e["reason"]:
                if r.startswith("rated not suitable or too marginal") and eb["valid"]:
                    # Suitability maps don't move with the climate: the drop comes from the rain/temperature checks.
                    r = (f"its score falls below the minimum the engine accepts here "
                         f"({eb.get('s_adj', 0):.0f} → {e.get('s_adj', 0):.0f}/100) because of the rain and temperature change")
                bad.append(f"{e['crop'].replace('_', ' ')}: {r}")
        was_bad = any(not e["valid"] for e in b["entries"])
        f_before = "not_feasible" if was_bad else s["feasibility"]["status"]
        f_after = "not_feasible" if bad else s["feasibility"]["status"]
        cb = b["sc"]["composite"] if b["sc"] else None
        ca = a["sc"]["composite"] if a["sc"] else None
        delta = (ca - cb) if (ca is not None and cb is not None) else None
        direction = ("worsens" if f_after == "not_feasible" and f_before != "not_feasible" else
                     "improves" if f_before == "not_feasible" and f_after != "not_feasible" else
                     "unknown" if delta is None else "improves" if delta > 2 else "worsens" if delta < -2 else "unchanged")
        new_notes = sorted({x for e in a["entries"] for x in e["notes"]} - {x for e in b["entries"] for x in e["notes"]})
        if a["sc"]:
            s["suitability"]["score"] = round(a["sc"]["agro"], 1)
            s["suitability"]["level"] = _level(a["sc"]["agro"])
            s["indicators"] = _indicators(a["sc"]["goals"])
        s["feasibility"] = {"status": f_after, "reasons": [x[:400] for x in bad[:5]]}
        s["risks"] = [{"text": t[:600], "severity": "high" if f_after == "not_feasible" else "medium", "sourceType": "modelled"} for t in bad + new_notes][:6] + s["risks"]
        rain_steps = [f"{e['crop'].replace('_', ' ')} rain fit {eb['rain_status']} → {e['rain_status']}"
                      for e, eb in zip(a["entries"], b["entries"]) if e["rain_status"] != eb["rain_status"]]
        summary = ("Not feasible under this climate: " + "; ".join(bad[:2]) + "." if bad and not was_bad else
                   f"Score {cb:.0f} → {ca:.0f} ({delta:+.0f} points)." if delta is not None else "Could not be scored.")
        if rain_steps:
            summary += " " + "; ".join(rain_steps[:2]) + "."
        changes.append({"strategyId": s["id"], "direction": direction, "feasibilityBefore": f_before, "feasibilityAfter": f_after, "summary": summary[:600]})
        modified.append(s)

    base_rain = float(np.nansum(base_site["_clim"])) if base_site["_clim"] is not None else None
    new_rain = float(np.nansum(new_site["_clim"])) if new_site["_clim"] is not None else None
    base_t = float(np.nanmean(base_site["_temp"])) if base_site["_temp"] is not None else None
    new_t = float(np.nanmean(new_site["_temp"])) if new_site["_temp"] is not None else None
    explanation = [
        f"Your assumption: {_scenario_label(rain, temp)}. It is applied to every month of the NASA POWER climate at your field (2001–2020 average).",
        "The engine re-checks each crop's rainfall and temperature needs in its growing window and re-scores the same plans.",
        "Crop suitability maps (FAO GAEZ) describe today's climate, so only the rainfall and temperature checks change — this is a 'what if', not a forecast.",
    ]
    if rain or temp:
        with _climate(rain, temp):
            alt = E.recommend(farmer, DATA, KB)
        if alt["plans"]:
            explanation.append("Under this climate the engine's own best plan would be: "
                               + " – ".join(x["crop_name"] for x in alt["plans"][0]["sequence"]) + ".")
        else:
            explanation.append("Under this climate the engine could not build any valid rotation for your field.")
    applied_scen = {"rainfallChangePercent": rain, "temperatureChangeCelsius": temp, "presetId": None, "label": _scenario_label(rain, temp)}
    return _clean({
        **_base_response(req, rec, limitations), "analysisType": "climate_scenario",
        "baseline": BASELINE, "modified": applied_scen,
        "climateContext": {"baselineAnnualRainfallMm": base_rain, "hypotheticalAnnualRainfallMm": new_rain,
                           "baselineMeanTemperatureC": base_t, "hypotheticalMeanTemperatureC": new_t,
                           "note": "Hypothetical change applied to the observed monthly climate. Not a forecast."},
        "strategies": modified, "changes": changes, "explanation": [x[:800] for x in explanation], "constraintsApplied": applied,
    })


def _windows(months):
    """Idle months -> circular runs of consecutive months, e.g. [12, 1, 2] -> one window starting in December."""
    ms = sorted(set(int(m) for m in months if 1 <= int(m) <= 12))
    if not ms:
        return []
    if len(ms) == 12:
        return [list(range(1, 13))]
    runs, cur = [], [ms[0]]
    for m in ms[1:]:
        if m == cur[-1] + 1:
            cur.append(m)
        else:
            runs.append(cur)
            cur = [m]
    runs.append(cur)
    if len(runs) > 1 and runs[0][0] == 1 and runs[-1][-1] == 12:
        runs[0] = runs.pop() + runs[0]
    return runs


@app.post("/v1/gaps/analyze")
def gaps(req: dict = Body(...)):
    """Crops (or a rest period) that fit the farmer's idle months, from the engine's crop durations, climate and suitability."""
    try:
        f = req["field"]
        farmer, _ = _farmer_input({"field": f, "priorities": {}, "constraints": []})
        n = E.normalise_input(farmer, KB)
        site, _w, _notes, cls, _tex, _i = E.build_site_profile(n, DATA, KB, dt.date.today().month)
    except (KeyError, ValueError, TypeError) as e:
        return _error(422, "VALIDATION_ERROR", f"The field description could not be used: {e}")
    clim, temps = site["_clim"], site["_temp"]
    a, b = E._scenario_weights(n["water_access"], n["input_level"])
    suit = E._bilinear(cls, a[0], b[0])

    # current crop calendar: the current crop ends in its harvest month, lasting its typical duration
    calendar = []
    cur, hm = n["current_crop"], n["harvest_month"]
    if cur in KB.catalog.index and hm:
        cat = KB.catalog.loc[cur]
        dur = int(round((cat.duration_min_d + cat.duration_max_d) / 2 / 30.4))
        months = [((hm - 1 - k) % 12) + 1 for k in range(max(1, dur))][::-1]
        calendar.append({"cropId": _slug(cur), "label": f"{cat['name']} (now)", "months": months, "plantingMonths": [months[0]],
                         "harvestMonths": [hm], "sourceType": "farmer_provided"})

    windows, candidates = [], []
    for wi, ms in enumerate(_windows(req.get("idleMonths") or [])):
        rain = float(sum(clim[m - 1] for m in ms)) if clim is not None else None
        windows.append({"startMonth": ms[0], "endMonth": ms[-1], "months": ms, "rainfallMm": None if rain is None else round(rain),
                        "rainfallSourceId": "nasa-power" if rain is not None else None})
        days = len(ms) * 30.4
        options = []
        for j, c in enumerate(KB.crops):
            if c in n["excluded_crops"]:
                continue
            cat = KB.catalog.loc[c]
            dmin, dmax = int(cat.duration_min_d), int(cat.duration_max_d)
            # A long gap need not be sown in its first month: try each sowing month in the gap (earliest first)
            # and keep the first one where the crop still fits and is not too cold or hot.
            sow, tw = None, None
            for off in range(len(ms)):
                left = (len(ms) - off) * 30.4
                if dmin > left:
                    break
                t = E.temp_in_window(temps, ms[off], min(left, dmin), start_day=1) if temps is not None else None
                if t is None or cat.temp_abs_min <= t <= cat.temp_abs_max:
                    sow, tw = off, t
                    break
            if sow is None:
                if dmin <= days:
                    continue  # long enough, but too cold or hot whenever it is sown in these months
                sow = 0  # shorter than the crop needs: still listed as "too long" so the farmer sees why
                tw = E.temp_in_window(temps, ms[0], days, start_day=1) if temps is not None else None
                if tw is not None and not (cat.temp_abs_min <= tw <= cat.temp_abs_max):
                    continue
            sow_month = ms[sow]
            days_left = (len(ms) - sow) * 30.4
            fit = "fits" if dmax <= days_left else "tight" if dmin <= days_left else "does_not_fit"
            grow = min(days_left, dmin)
            risks, water_note = [], None
            if tw is not None and (tw < cat.temp_opt_min or tw > cat.temp_opt_max):
                risks.append(f"About {tw:.0f} °C while it grows, outside its ideal {cat.temp_opt_min:.0f}-{cat.temp_opt_max:.0f} °C.")
            ratio, dry = None, False
            if clim is not None:
                ratio = 0.75 * E.rain_in_window(clim, sow_month, grow, start_day=1) / ((cat.water_need_mm_low + cat.water_need_mm_high) / 2)
                dry = ratio < 0.5 and n["water_access"] != "reliable_irrigation"
                water_note = f"Rain in these months covers about {min(ratio, 9.99):.0%} of its water need."
                if ratio < 0.8:
                    risks.append("Likely needs irrigation or stored soil moisture." if ratio >= 0.5 else
                                 "Too dry for rain alone in these months: only with irrigation.")
            grown_here = c in {n["current_crop"], n["previous_crop"], n["previous_crop_2"]}
            if suit[j] < 25 and not grown_here:
                continue  # rated unsuitable here by the regional suitability data
            if suit[j] < 25:
                # Same rule as the rotation engine: the farmer already grows it on this field, so the regional data likely under-rates it.
                risks.append("The regional data rates this crop poorly here, but you already grow it on this field, so it is kept as an option.")
            benefits = []
            if int(cat.n_fixing):
                benefits.append("A legume: it adds nitrogen for the next crop.")
            if cat["group"] == "cereal":
                benefits.append("A staple grain for household food.")
            if cat.drought_tol == "high":
                benefits.append("Tolerates dry spells.")
            options.append((
                (dry, {"fits": 0, "tight": 1, "does_not_fit": 2}[fit]), -suit[j] * min(1.0, ratio or 1.0),
                {"cropId": _slug(c), "role": "short_season", "windowIndex": wi, "durationDays": {"min": dmin, "max": dmax},
                 "fit": fit, "fitMethod": "rule", "benefits": benefits, "risks": risks, "waterNote": water_note,
                 "explanation": (f"Sow in {E.MONTH_NAME[sow_month - 1]}: {cat['name']} usually takes {dmin}-{dmax} days, "
                                 f"and from {E.MONTH_NAME[sow_month - 1]} the gap has about {int(days_left)} days left. "
                                 f"Regional suitability {suit[j]:.0f}/100.")[:800],
                 "sourceType": "estimated"}))
        candidates += [o[2] for o in sorted(options, key=lambda o: (o[0], o[1]))[:5]]
        candidates.append({"cropId": "fallow", "role": "fallow", "windowIndex": wi, "durationDays": None, "fit": "fits", "fitMethod": "rule",
                           "benefits": ["Rests the soil and needs no inputs."], "risks": ["The land produces nothing and bare soil can erode."],
                           "waterNote": None, "explanation": "Leaving the land to rest is always possible.", "sourceType": "estimated"})
    return _clean({**_base_response(req, None, [
        "Durations, water needs and temperature limits are starter values from the engine's crop catalogue (not yet reviewed by agronomists).",
        "Crops that cannot grow in these months (too cold, too hot, or unsuitable here) are left out. Crops that rain alone cannot "
        "support in these months are listed last and marked as needing irrigation."]),
        "analysisType": "gap_analysis", "currentCalendar": calendar, "idleWindows": windows, "candidates": candidates})


@app.post("/api/recommend")
def recommend_raw(farmer: dict = Body(...)):
    try:
        rec = E.recommend(farmer, DATA, KB)
    except (KeyError, ValueError, TypeError) as e:
        return JSONResponse(status_code=422, content={"detail": f"Some answers could not be used: {e}"})
    return _clean(rec)
