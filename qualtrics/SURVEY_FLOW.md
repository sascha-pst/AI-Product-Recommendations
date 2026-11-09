# Qualtrics setup

## Survey Flow

1. **Embedded Data** (top of flow): `arm`, `scenario`, `chosen_product`, `chosen_rank`, `chosen_from_recs`, `time_to_choice_ms` (all blank).
2. Block: Consent.
3. Block: Screener (bought earbuds or electronics online in the last 12 months).
4. Block: Covariates (AI attitudes scale, earbud knowledge, last purchase).
5. **Randomizer** — randomly present 1 of 6, check *Evenly Present Elements*. Each element is an Embedded Data element setting `arm` = 1 … 6.
6. **Randomizer** — randomly present 1 of 3, *Evenly Present Elements*. Each sets `scenario` = `commute` / `gym` / `calls`.
7. Block: Recommendation task — one Text/Graphic question with `embed_question.js`.
8. Block: Outcomes (trust scale, usefulness, choice confidence, willingness to pay).
9. Block: Manipulation check ("Where did the recommendations come from?") and attention check.
10. Block: Open-ended "Why did you choose this pair?"
11. Block: Debrief — tells everyone the true source. Pipe it with Display Logic on `arm`:
    - arms 1, 2 → "came from customer reviews"; arms 3, 4 → "came from an AI reviewer"; arm 5 → both; arm 6 → the source is in the data file (`sessions.content_source`).

## Joining the data

Qualtrics `ResponseID` = `rid` in the D1 `sessions` and `events` tables.

## Redirect alternative

If iframes are blocked on a device, send participants to the site with a return link instead:

`https://rec-engine.YOUR-SUBDOMAIN.workers.dev/?rid=${e://Field/ResponseID}&arm=${e://Field/arm}&scenario=${e://Field/scenario}&return=<URL-encoded anonymous link to a second survey section>`

The site appends `choice`, `rank`, `from_recs` and `ttc` to the return URL. Capture them as embedded data fields of the same names at the top of the flow. Only `*.qualtrics.com` return URLs are honored.
