"""One shared template turns any engine's output into display copy.

Every engine is worded by the same function, in the same neutral voice, so a
rationale never reveals whether it came from reviews or from the AI reviewer
(no "reviewers say", no "rated 8/10"). That is what lets the experiment cross
true source with displayed label.
"""
STRENGTH = {
    "sound": "rich, balanced sound",
    "noise_cancelling": "strong noise cancelling",
    "battery": "long battery life",
    "comfort": "all-day comfort",
    "call_quality": "clear call quality",
    "durability": "a sturdy, sweat-resistant build",
    "fit_security": "a secure fit",
}
WEAKNESS = {
    "sound": "sound is flatter than rivals",
    "noise_cancelling": "noise cancelling underwhelms",
    "battery": "battery life is on the short side",
    "comfort": "comfort can fade over long sessions",
    "call_quality": "call clarity is middling",
    "durability": "durability is a question mark",
    "fit_security": "the fit may loosen during movement",
}
PURPOSE = {"commute": "a loud commute", "gym": "workouts", "calls": "long call days"}


def rationale(pick, product, scenario):
    s1, s2 = (STRENGTH[a] for a in pick["strengths"])
    spec = product["specs"]
    text = (
        f"{s1[0].upper() + s1[1:]} and {s2} make it a strong match for {PURPOSE[scenario['id']]}. "
        f"It runs {spec['battery_hours']} hours per charge ({spec['case_battery_hours']} with the case) "
        f"and costs ${product['price_usd']}, within your ${scenario['budget_usd']} budget. "
        f"Watch for: {WEAKNESS[pick['weakness']]}."
    )
    return text
