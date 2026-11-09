"""Precompute every recommendation the site can show, plus offline metrics.

Writes:
  src/recs.json           bundled into the Worker (identical stimuli per arm)
  data/offline_eval.json  overlap@3 and Kendall's tau between engines

Run:  python pipeline/build_recs.py                 # Engine A = offline spec rubric
      python pipeline/build_recs.py --engine-a claude  # uses data/engine_a_ratings.json
"""
import argparse
import hashlib
import json
import time
from pathlib import Path

from engines import in_budget, engine_a_from_ratings, engine_a_rubric, engine_h, hybrid, kendall_tau
from rationale import rationale

ROOT = Path(__file__).resolve().parents[1]
TOP_K = 3


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine-a", choices=["rubric", "claude"], default="rubric")
    args = ap.parse_args()

    catalog = json.loads((ROOT / "data" / "catalog.json").read_text())
    products = catalog["products"]
    by_id = {p["id"]: p for p in products}
    scenarios = json.loads((ROOT / "data" / "scenarios.json").read_text())["scenarios"]
    arms = json.loads((ROOT / "data" / "arms.json").read_text())
    a_meta = {"mode": "rubric"}
    ratings = None
    if args.engine_a == "claude":
        cached = json.loads((ROOT / "data" / "engine_a_ratings.json").read_text())
        ratings = cached["ratings"]
        a_meta = {k: cached[k] for k in ("model", "prompt_version", "temperature", "generated_at")} | {"mode": "claude"}

    out_scen, evals = {}, {}
    for sc in scenarios:
        h = engine_h(products, sc)
        a = engine_a_from_ratings(products, sc, ratings) if ratings else engine_a_rubric(products, sc)
        hy = hybrid(h, a)
        engines = {}
        for name, ranked in (("H", h), ("A", a), ("HY", hy)):
            engines[name] = [{
                "product_id": r["product_id"], "rank": r["rank"], "match_score": r["match_score"],
                "rationale": rationale(r, by_id[r["product_id"]], sc),
            } for r in ranked[:TOP_K]]
        out_scen[sc["id"]] = {
            "title": sc["title"], "brief": sc["brief"], "budget_usd": sc["budget_usd"],
            "engines": engines,
            "all_in_budget": sorted((p["id"] for p in in_budget(products, sc)),
                                    key=lambda pid: by_id[pid]["price_usd"]),
        }
        h_ids, a_ids = [r["product_id"] for r in h], [r["product_id"] for r in a]
        evals[sc["id"]] = {
            "pool_size": len(h_ids),
            "overlap_at_3": len(set(h_ids[:3]) & set(a_ids[:3])),
            "kendall_tau_full_ranking": kendall_tau(h_ids, a_ids),
            "top3_H": h_ids[:3], "top3_A": a_ids[:3], "top3_HY": [r["product_id"] for r in hy[:3]],
        }

    display_products = {p["id"]: {
        "name": p["name"], "price_usd": p["price_usd"], "color": p["color"],
        "specs": {
            "Noise cancelling": ["None", "Basic", "Good", "Strong"][p["specs"]["anc_level"]],
            "Battery": f"{p['specs']['battery_hours']} h ({p['specs']['case_battery_hours']} h with case)",
            "Water resistance": p["specs"]["ip_rating"].replace("none", "None"),
            "Weight": f"{p['specs']['weight_g']} g per bud",
            "Mics": f"{p['specs']['mics_per_bud']} per bud",
            "Multipoint": "Yes" if p["specs"]["multipoint"] else "No",
            "Ear wings": "Yes" if p["specs"]["ear_hooks_or_wings"] else "No",
        },
    } for p in products}

    payload = {
        "sample_data": "_note" in catalog,
        "category": catalog["category"],
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "engine_a": a_meta,
        "arms": arms,
        "scenarios": out_scen,
        "products": display_products,
    }
    body = json.dumps(payload, indent=1)
    payload["stimuli_version"] = hashlib.sha256(body.encode()).hexdigest()[:10]
    (ROOT / "src" / "recs.json").write_text(json.dumps(payload, indent=1))
    (ROOT / "data" / "offline_eval.json").write_text(json.dumps(evals, indent=2))
    print(json.dumps(evals, indent=2))
    print("stimuli_version", payload["stimuli_version"])


if __name__ == "__main__":
    main()
