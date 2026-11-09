# Pickwise: human-review vs. AI-reviewer recommendation engine

Web stimulus for a Qualtrics experiment comparing earbud recommendations built from
**customer reviews (Engine H)**, from **an AI reviewer (Engine A)**, and a **hybrid**,
crossed with what the recommendation is *labeled* as. Runs on Cloudflare Workers + D1.

> **Sample data.** `data/catalog.json` holds fictional products with synthetic review
> statistics so everything can be built and tested. Swap in real, licensed review data
> before any live study.

## How it fits together

```
Qualtrics (rid, arm, scenario) ──iframe──▶ Worker ──▶ precomputed picks (src/recs.json)
            ▲                               │
            └──── postMessage(choice) ◀─────┴──▶ D1: sessions + events
GitHub Actions: build_recs.py → deploy;  engine-a.yml: Claude ratings → PR
```

| Arm | Content | Label |
| --- | --- | --- |
| 1 | Engine H | From customer reviews |
| 2 | Engine H | From an AI reviewer |
| 3 | Engine A | From customer reviews |
| 4 | Engine A | From an AI reviewer |
| 5 | Hybrid | From customer reviews and an AI reviewer |
| 6 | H or A (50/50 by rid) | none |

Both engines are worded by one template (`pipeline/rationale.py`), so the copy never gives the source away.

## Tips

**Run it locally**
```bash
npm install
npm run db:init:local
npm run dev            # http://localhost:8787/?rid=R_test&arm=3&scenario=gym
```
- Tip: leave out `arm` / `scenario` and the Worker assigns them from `rid`.
- Tip: `npx wrangler dev --env staging` + `&preview=1` shows the researcher toolbar with the true source.

**Rebuild recommendations**
```bash
python3 pipeline/generate_sample_catalog.py   # sample data only
npm run build:recs                            # Engine A = offline spec rubric
```
- Tip: offline metrics (overlap@3, Kendall's tau) land in `data/offline_eval.json`.
- Tip: every build stamps a `stimuli_version`; it's stored with each session in D1.

**Use Claude as Engine A**
```bash
ANTHROPIC_API_KEY=... python3 pipeline/engine_a_claude.py
cd pipeline && python3 build_recs.py --engine-a claude
```
- Tip: the prompt lives in `prompts/engine_a_v1.md`; copy to `_v2` and bump `PROMPT_VERSION` to change it.
- Tip: or run the **Regenerate Engine A** workflow in GitHub; it opens a PR so the change is reviewed.

**Deploy to Cloudflare**
```bash
npx wrangler login
npx wrangler d1 create rec-engine      # paste the id into wrangler.toml (both places)
npm run db:init:remote
npm run deploy
```
- Tip: for CI, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repo secrets; pushes to `main` deploy.
- Tip: deploy `--env staging` for pilots; production keeps preview mode off.

**Connect Qualtrics**
- Tip: follow `qualtrics/SURVEY_FLOW.md`, then paste `qualtrics/embed_question.js` into the task question and set `BASE` to your Worker URL.

**Pull data for analysis (Hex or a notebook)**
```bash
npx wrangler d1 execute rec-engine --remote --json --command "SELECT * FROM sessions" > sessions.json
npx wrangler d1 execute rec-engine --remote --json --command "SELECT * FROM events" > events.json
```
- Tip: join to the Qualtrics export on `ResponseID = rid`.

**Researcher preview (no server)**
```bash
npm run build:preview     # dist/preview.html
```

## Files

| Path | What it is |
| --- | --- |
| `pipeline/engines.py` | Engine H, Engine A rubric, hybrid (Borda), Kendall's tau |
| `pipeline/rationale.py` | Shared, source-neutral wording |
| `pipeline/engine_a_claude.py` | Claude rates products from listings only |
| `pipeline/build_recs.py` | Precomputes `src/recs.json` + offline eval |
| `src/index.js`, `src/resolve.js` | Worker: `/api/recs`, `/api/event`, static assets |
| `public/` | Participant page |
| `schema.sql` | D1 tables |
| `qualtrics/` | Survey flow + embed script |
