"""Engine A with Claude as the AI reviewer.

Claude rates each product's aspects from its listing (specs + price only).
Ratings are cached in data/engine_a_ratings.json together with the model,
prompt version and temperature, so Engine A is reproducible and the live
site never calls a model during the study.

Run:  ANTHROPIC_API_KEY=... python pipeline/engine_a_claude.py
Then: python pipeline/build_recs.py --engine-a claude
"""
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROMPT_VERSION = "engine_a_v1"
MODEL = os.environ.get("ENGINE_A_MODEL", "claude-sonnet-5-5")
TEMPERATURE = 0.0


def listing(p):
    s = p["specs"]
    return json.dumps({
        "name": p["name"], "price_usd": p["price_usd"],
        "active_noise_cancelling": ["none", "basic", "good", "strong"][s["anc_level"]],
        "battery_hours_per_charge": s["battery_hours"], "battery_hours_with_case": s["case_battery_hours"],
        "water_resistance": s["ip_rating"], "weight_per_bud_g": s["weight_g"],
        "microphones_per_bud": s["mics_per_bud"], "multipoint_pairing": s["multipoint"],
        "ear_hooks_or_wings": s["ear_hooks_or_wings"], "codecs": s["codec"],
    }, indent=1)


def main():
    try:
        import anthropic
    except ImportError:
        sys.exit("pip install anthropic")
    client = anthropic.Anthropic()
    template = (ROOT / "prompts" / f"{PROMPT_VERSION}.md").read_text()
    products = json.loads((ROOT / "data" / "catalog.json").read_text())["products"]
    ratings, log = {}, []
    for p in products:
        prompt = template.replace("{{LISTING}}", listing(p))
        msg = client.messages.create(model=MODEL, max_tokens=200, temperature=TEMPERATURE,
                                     messages=[{"role": "user", "content": prompt}])
        text = msg.content[0].text.strip()
        ratings[p["id"]] = json.loads(text[text.find("{"): text.rfind("}") + 1])
        log.append({"product_id": p["id"], "prompt": prompt, "output": text, "ts": time.time()})
        print(p["id"], ratings[p["id"]])
    (ROOT / "data" / "engine_a_ratings.json").write_text(json.dumps({
        "model": MODEL, "prompt_version": PROMPT_VERSION, "temperature": TEMPERATURE,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ratings": ratings,
    }, indent=2))
    (ROOT / "data" / "engine_a_calls.jsonl").write_text("\n".join(json.dumps(r) for r in log))


if __name__ == "__main__":
    main()
