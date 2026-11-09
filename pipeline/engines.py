"""Engine H (human reviews) and Engine A (AI reviewer, spec rubric) scoring.

Both engines return the same structure so the web app cannot tell them apart:
    {"product_id", "match_score" (0-100), "strengths" [aspect, aspect], "weakness" aspect}
Wording is produced later by one shared template (rationale.py), which keeps
the writing style identical across sources.
"""
from __future__ import annotations

ASPECTS = ["sound", "noise_cancelling", "battery", "comfort", "call_quality", "durability", "fit_security"]
IP_SCORE = {"none": 0.2, "IPX4": 0.5, "IP55": 0.8, "IPX7": 0.9}


def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def in_budget(products, scenario):
    """Shared candidate pool: same filter for every engine."""
    min_anc = scenario.get("min_anc_level", 0)
    return [p for p in products if p["price_usd"] <= scenario["budget_usd"] and p["specs"]["anc_level"] >= min_anc]


def _pick_strengths_weakness(aspect_scores: dict, needs: dict):
    need_ranked = sorted(needs, key=lambda a: aspect_scores[a], reverse=True)
    strengths = need_ranked[:2]
    # weakness = the weakest of the scenario's remaining needs, so it is always relevant
    weakness = need_ranked[-1]
    return strengths, weakness


# ---------------------------------------------------------------- Engine H
def engine_h(products, scenario, prior_m=100, aspect_prior=0.6, aspect_k=30):
    """Rank by Bayesian-average rating + aspect sentiment matched to the scenario's needs."""
    pool = in_budget(products, scenario)
    global_mean = sum(p["reviews"]["avg_rating"] for p in products) / len(products)
    out = []
    for p in pool:
        r = p["reviews"]
        v = r["count"]
        bayes = (v / (v + prior_m)) * r["avg_rating"] + (prior_m / (v + prior_m)) * global_mean
        bayes_norm = clamp((bayes - 3.0) / 2.0)
        shrunk = {}
        for a in ASPECTS:
            share = r["aspect_positive_share"].get(a)
            n = r["aspect_mentions"].get(a, 0)
            if share is None:  # feature absent (e.g. no ANC): owners can't praise it
                shrunk[a] = 0.15
            else:
                shrunk[a] = (share * n + aspect_prior * aspect_k) / (n + aspect_k)
        fit = sum(w * shrunk[a] for a, w in scenario["needs"].items())
        score = 0.4 * bayes_norm + 0.6 * fit
        strengths, weakness = _pick_strengths_weakness(shrunk, scenario["needs"])
        out.append({"product_id": p["id"], "raw": score, "strengths": strengths, "weakness": weakness,
                    "evidence": {"bayes_rating": round(bayes, 2), "aspect_scores": {k: round(x, 2) for k, x in shrunk.items()}}})
    return _finalize(out)


# ---------------------------------------------------------------- Engine A
def spec_aspect_scores(p):
    s = p["specs"]
    return {
        "sound": clamp(0.55 + 0.2 * (s["codec"] != "SBC/AAC") + 0.15 * (p["price_usd"] >= 150)),
        "noise_cancelling": s["anc_level"] / 3,
        "battery": clamp((s["battery_hours"] - 4) / 8),
        "comfort": clamp((8.0 - s["weight_g"]) / 4.0),
        "call_quality": s["mics_per_bud"] / 3,
        "durability": IP_SCORE[s["ip_rating"]],
        "fit_security": 0.85 if s["ear_hooks_or_wings"] else 0.45,
    }


def engine_a_rubric(products, scenario):
    """Offline AI-reviewer stand-in: a fixed rubric over specs and price only (no reviews).

    engine_a_claude.py replaces these aspect scores with Claude's own ratings;
    everything downstream stays the same.
    """
    pool = in_budget(products, scenario)
    out = []
    for p in pool:
        asp = spec_aspect_scores(p)
        out.append(_score_a(p, asp, scenario))
    return _finalize(out)


def _score_a(p, asp, scenario):
    fit = sum(w * asp[a] for a, w in scenario["needs"].items())
    bonus = 0.08 if scenario.get("bonus_spec") and p["specs"].get(scenario["bonus_spec"]) else 0
    value = 0.03 * (1 - p["price_usd"] / scenario["budget_usd"])
    strengths, weakness = _pick_strengths_weakness(asp, scenario["needs"])
    return {"product_id": p["id"], "raw": fit + bonus + value, "strengths": strengths, "weakness": weakness,
            "evidence": {"aspect_scores": {k: round(x, 2) for k, x in asp.items()}}}


def engine_a_from_ratings(products, scenario, ratings: dict):
    """Build Engine A output from Claude's ratings: {product_id: {aspect: 0-10}}."""
    pool = in_budget(products, scenario)
    out = []
    for p in pool:
        asp = {a: clamp(ratings[p["id"]][a] / 10) for a in ASPECTS}
        out.append(_score_a(p, asp, scenario))
    return _finalize(out)


# ---------------------------------------------------------------- Hybrid
def hybrid(h_ranked, a_ranked):
    """Borda count over the two full rankings; strengths drawn from both sources."""
    n = len(h_ranked)
    pts, by_id_h, by_id_a = {}, {}, {}
    for i, r in enumerate(h_ranked):
        pts[r["product_id"]] = pts.get(r["product_id"], 0) + (n - i)
        by_id_h[r["product_id"]] = r
    for i, r in enumerate(a_ranked):
        pts[r["product_id"]] = pts.get(r["product_id"], 0) + (n - i)
        by_id_a[r["product_id"]] = r
    out = []
    for pid, score in pts.items():
        h, a = by_id_h[pid], by_id_a[pid]
        strengths = [h["strengths"][0]] + [s for s in a["strengths"] if s != h["strengths"][0]][:1]
        weakness = h["weakness"] if h["weakness"] not in strengths else a["weakness"]
        out.append({"product_id": pid, "raw": score, "strengths": strengths, "weakness": weakness,
                    "evidence": {"h_match": h["match_score"], "a_match": a["match_score"]}})
    return _finalize(out)


def _finalize(rows):
    rows.sort(key=lambda r: r["raw"], reverse=True)
    lo, hi = min(r["raw"] for r in rows), max(r["raw"] for r in rows)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
        # Display score 60-98 so both engines show the same range on screen.
        r["match_score"] = int(round(60 + 38 * ((r["raw"] - lo) / (hi - lo) if hi > lo else 1)))
        del r["raw"]
    return rows


# ---------------------------------------------------------------- offline eval
def kendall_tau(order_a, order_b):
    pos_b = {pid: i for i, pid in enumerate(order_b)}
    items = [pid for pid in order_a if pid in pos_b]
    conc = disc = 0
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            s = pos_b[items[i]] - pos_b[items[j]]
            conc += s < 0
            disc += s > 0
    total = conc + disc
    return round((conc - disc) / total, 3) if total else None
