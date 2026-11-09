"""Generate a SAMPLE earbud catalog with synthetic review aggregates.

Everything here is fictional: brand names, products and review statistics are
invented so the pipeline and web app can be built and tested end to end.
Replace data/catalog.json with real data (e.g. the Amazon Reviews 2023
dataset, Electronics category) via pipeline/load_reviews.py before any study.

Run:  python pipeline/generate_sample_catalog.py
"""
import json
import random
from pathlib import Path

random.seed(42)
OUT = Path(__file__).resolve().parents[1] / "data" / "catalog.json"

BRANDS = ["Aurel", "Brisa", "Cobalt", "Dune", "Ember", "Fjord", "Gala", "Halo Audio",
          "Ion", "Juno", "Kestrel", "Lumen", "Mira", "Nook", "Orca"]
LINES = ["Pods", "Buds", "Air", "Fit", "Pro", "Lite", "Sport", "Studio"]
ASPECTS = ["sound", "noise_cancelling", "battery", "comfort", "call_quality", "durability", "fit_security"]


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def make_product(i):
    brand = BRANDS[i % len(BRANDS)]
    line = LINES[(i * 3) % len(LINES)]
    tier = random.choice(["budget", "mid", "premium"])
    price = {"budget": random.randint(29, 79), "mid": random.randint(80, 149),
             "premium": random.randint(150, 249)}[tier]
    anc = {"budget": random.choice([0, 0, 1]), "mid": random.choice([1, 2, 2]),
           "premium": random.choice([2, 3, 3])}[tier]  # 0 none, 1 basic, 2 good, 3 strong
    specs = {
        "anc_level": anc,
        "battery_hours": random.choice([5, 6, 7, 8, 9, 10, 12]),
        "case_battery_hours": random.choice([20, 24, 28, 30, 36, 40]),
        "ip_rating": random.choice(["none", "IPX4", "IPX4", "IP55", "IPX7"]),
        "weight_g": round(random.uniform(4.0, 7.5), 1),
        "mics_per_bud": random.choice([1, 2, 3]),
        "multipoint": random.random() < (0.3 if tier == "budget" else 0.7),
        "ear_hooks_or_wings": random.random() < 0.3,
        "codec": random.choice(["SBC/AAC", "SBC/AAC", "LDAC", "aptX Adaptive"]),
    }
    # Spec quality and reviewer happiness are only partly linked, as in real data:
    # some spec-sheet winners disappoint owners and some modest products are loved.
    owner_delight = random.gauss(0, 0.1)
    if i in (3, 11, 19):   # strong specs, weak durability / fit in practice
        owner_delight -= 0.22
    if i in (6, 14, 25):   # modest specs, loved by owners
        owner_delight += 0.18

    def aspect_pos(base):
        return round(clamp(base + owner_delight + random.gauss(0, 0.06), 0.2, 0.96), 2)

    aspects = {
        "sound": aspect_pos(0.62 + 0.04 * (tier != "budget") + 0.04 * (specs["codec"] != "SBC/AAC")),
        "noise_cancelling": aspect_pos(0.35 + 0.17 * anc) if anc else None,
        "battery": aspect_pos(0.45 + 0.03 * specs["battery_hours"]),
        "comfort": aspect_pos(0.95 - 0.06 * specs["weight_g"]),
        "call_quality": aspect_pos(0.48 + 0.1 * specs["mics_per_bud"]),
        "durability": aspect_pos(0.6 + (0.12 if specs["ip_rating"] in ("IP55", "IPX7") else 0)),
        "fit_security": aspect_pos(0.6 + (0.2 if specs["ear_hooks_or_wings"] else 0)),
    }
    mean_pos = sum(v for v in aspects.values() if v is not None) / sum(v is not None for v in aspects.values())
    avg_rating = round(clamp(2.6 + 2.4 * mean_pos + random.gauss(0, 0.1), 2.8, 4.9), 2)
    n_reviews = int(random.lognormvariate(6.2, 1.1))
    mentions = {a: (int(n_reviews * random.uniform(0.08, 0.45)) if aspects[a] is not None else 0) for a in ASPECTS}
    return {
        "id": f"p{i + 1:02d}",
        "name": f"{brand} {line} {random.choice(['', '2', '3', 'X', 'S'])}".strip(),
        "brand": brand,
        "price_usd": price,
        "tier": tier,
        "color": random.choice(["#2f4858", "#86bbd8", "#f6ae2d", "#f26419", "#33658a", "#55dde0", "#8a5a83", "#7d8691"]),
        "specs": specs,
        "reviews": {
            "count": n_reviews,
            "avg_rating": avg_rating,
            "aspect_positive_share": aspects,
            "aspect_mentions": mentions,
            "helpful_votes": int(n_reviews * random.uniform(0.2, 1.5)),
            "share_last_12_months": round(random.uniform(0.15, 0.7), 2),
        },
    }


def main():
    products = [make_product(i) for i in range(32)]
    # make names unique
    seen = {}
    for p in products:
        if p["name"] in seen:
            seen[p["name"]] += 1
            p["name"] += f" {['II', 'III', 'IV'][seen[p['name']] - 2] if seen[p['name']] < 5 else seen[p['name']]}"
        seen.setdefault(p["name"], 1)
    OUT.write_text(json.dumps({
        "_note": "SAMPLE DATA - fictional products and synthetic review statistics. Do not use in a live study.",
        "category": "Wireless earbuds",
        "products": products,
    }, indent=2))
    print(f"wrote {len(products)} products to {OUT}")


if __name__ == "__main__":
    main()
