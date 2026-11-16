# Study v2: two-group AI disclosure experiment

Use AI_Recommendation_Labels_Repaired.qsf as a new pilot survey, preserving the original.

1. Declare study_id=ai-disclosure-v1, scenario=commute, task_completed=0; declare arm, choice fields and stimuli_version.
2. Consent; end the survey unless Yes is selected.
3. Online-shopping screener; end unless Yes is selected.
4. Randomizer: randomly present **1** element, Evenly Present Elements enabled:
   - Separate Embedded Data element: arm=1 (Recommended).
   - Separate Embedded Data element: arm=2 (Recommended by AI).
5. Task QID19 contains embed_question.js; Next stays hidden until a server-confirmed choice message from the exact iframe, matching respondent, condition and study.
6. Trust, usefulness and confidence.
7. Open-ended choice explanation.
8. Disclosure and attention checks.
9. Background measures, including post-task AI attitudes.
10. Pilot debrief describing fictional stimuli and the offline rubric.

Both groups receive exactly the same Engine A content for commute. This supersedes the prior six-arm instructions. Do not run the repaired survey against the old deployment.

## Configure and validate before piloting

- Apply schema.sql to the staging D1 binding and deploy the repaired Worker to staging.
- Set BASE in QID19 JavaScript to the exact staging Worker URL returned by deployment. The existing URL in the file is a configuration starting point, not confirmation of a repaired live deployment.
- Keep PILOT=true in QID19, ALLOW_PREVIEW=true on staging, STUDY_OPEN=false. Prototype access is allowed only with preview=1 on that staging deployment.
- Confirm custom JavaScript is available for the Qualtrics account; after QSF import verify QID19 retained its JavaScript and both end-survey branches appear.
- Preview two distinct respondents in different arms. Verify wording is the only stimulus difference and Next is unavailable before confirming a choice.
- Verify refreshing keeps the assignment and saved choice; changing arm in the URL produces an error.
- Test an alternative (nonrecommended) product and verify chosen_rank=0, chosen_from_recs=0.
- Confirm the exported task_completed=1 and chosen fields match study_assignments.choice_json in D1. Optional events live in study_events.
- A failed save or unavailable storefront must not permit the participant to answer outcome questions as if the task succeeded. Log pilot failures separately.
- The QSF includes only a basic consent question from the draft; finalize institution-required consent details and eligibility before recruitment.

## Main-study release

Generate genuine AI ratings using the existing Claude pipeline, then build_recs.py --engine-a claude. Review/freeze stimuli, update the debrief to the actual verified provenance, set PILOT=false, update BASE, and set ALLOW_PREVIEW=false on production. Only after approval and a separate pilot should STUDY_OPEN=true be set. Fictional stimuli require explicit protocol approval; ALLOW_SAMPLE_DATA=false blocks them by default. Changing versions after first assignment returns 409, rather than silently changing a respondent's stimuli.

## Data export

Join Qualtrics ResponseID to study_assignments.rid, filtering study_id='ai-disclosure-v1'. Use study_assignments.choice_json as the authoritative final choice; do not infer confirmed choices from optional telemetry. The old sessions/events tables remain intact for the previous experiment. Never publish participant exports or session tokens in the public repository.
