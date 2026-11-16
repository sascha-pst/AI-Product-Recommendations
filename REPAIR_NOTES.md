# Assignment and storefront repair

## What changed

- Qualtrics now assigns one of two separate conditions equally, with commute fixed.
- Both groups use the same Engine A picks; only Recommended / Recommended by AI changes. Condition-specific icons are removed.
- Server assignment is immutable per study/respondent and version. No anonymous or six-arm fallback is allowed.
- Durable, idempotent /api/choice computes rank and recommendation uptake on the server. The survey unlocks only after the saved choice is returned.
- A reload resumes a saved choice. Failed saves allow retry and never claim success.
- Telemetry is authenticated with a study session token and uses server assignment.
- Consent and screener exit logic are present; accidental embedded fields removed; export tags are unique.
- The original survey is preserved. Willingness to pay is retained in Trash; AI attitudes are after outcomes and explanation is before the disclosure check.

## Run checks

Requires Node 22+ with node:sqlite and Python 3.12. No API keys or model calls are required for tests.

    npm test

## Install

1. Import qualtrics/AI_Recommendation_Labels_Repaired.qsf as a NEW Qualtrics survey; inspect the randomizer, branches and QID19 JavaScript. Structural tests cannot substitute for a real Qualtrics import/preview.
2. Configure the existing Cloudflare account/database IDs in wrangler.toml. Apply schema.sql to the staging D1 database before deploying. Existing tables are preserved.
3. Deploy the repaired code to staging using the existing repository's workflow/tooling; set the returned exact URL as BASE in QID19. Keep PILOT=true and ALLOW_PREVIEW=true on staging. Keep STUDY_OPEN=false.
4. Complete both arms, refresh and failed-save checks, and export a test response to verify joining. Main-study collection remains closed until verified AI provenance and release settings are completed (see qualtrics/SURVEY_FLOW.md).

The bundled QSF is a PROTOTYPE PILOT, with an explicit debrief about fictional products and the current offline rubric. It is not a research-ready survey with final institutional consent wording. Main-study debrief wording must be updated after verified AI generation. Do not collect study evidence from an AI label applied to an unverified rubric as though it were a genuine AI disclosure.

## Deployment status

Changes were prepared and tested locally. GitHub write operations previously returned 403; no branch, PR, live Cloudflare deployment, or live Qualtrics edit is claimed. Apply storefront-repair.patch at the repository root with git apply, review, and deploy to staging. The patch includes QSF and the checks. No secrets or participant response data are bundled.
