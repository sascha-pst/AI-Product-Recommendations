# Verified Qualtrics task sessions

The Worker accepts a launch only from a trusted **server-side Survey Flow Web Service** call authenticated with a shared secret. Browser-provided ResponseIDs, iframe origins, and preview URLs are not proof of a survey session. The Web Service attests that the response reached this point of the configured survey. This does not authenticate a participant's identity or prevent someone from starting multiple legitimate Qualtrics responses.

## Required setup (staging first)

1. Apply `schema.sql` to the correct D1 database. Set `QUALTRICS_SURVEY_ID` to the imported survey's actual `SV_...` ID in the appropriate Wrangler environment. Keep staging and production databases, survey IDs, and secrets separate.
2. Generate a random secret of at least 32 characters (for example, `openssl rand -hex 32`). Store it with `npx wrangler secret put QUALTRICS_LAUNCH_SECRET --env staging`. Use the same value only in the server-side Web Service custom header below. Never place it in question JavaScript, URLs, embedded data, committed QSF exports, or the public repository. Restrict survey-editor access; editors can see this header. Configure production separately without `--env staging`.
3. Import the repaired QSF. Its `launch_token` field starts empty deliberately. **Add a Web Service element after the arm randomizer and immediately before the Recommendations task block.** This account-specific element must be configured in Qualtrics; the bundled QSF cannot launch the task until it is added. Do not put it in a post-survey Workflow or browser fetch.
4. Configure the Web Service:
   - URL: `https://YOUR-STAGING-WORKER/api/launch`
   - Method: `POST`; body type: `application/json`
   - Custom header: `Authorization: Bearer YOUR_SHARED_SECRET`
   - JSON body (use Qualtrics piped text for the fields):

   ```json
   {
     "survey_id": "YOUR_ACTUAL_SV_ID",
     "rid": "${e://Field/ResponseID}",
     "arm": "${e://Field/arm}",
     "scenario": "${e://Field/scenario}",
     "preview": true
   }
   ```

   Use a JSON boolean for `preview`. Set it to `false` for the main study; preview credentials are issued only when `ALLOW_PREVIEW=true`. A browser `preview=1` parameter cannot enable preview access.
5. Wait for the Web Service response: **disable Fire and Forget**. Map the returned top-level `launch_token` field to the `launch_token` embedded data field. Qualtrics' Web Service test may need temporary valid test values for ResponseID/arm; restore piped text after testing. Do not export or publish a QSF containing the header secret.
6. Set `BASE` in QID19 to the exact matching Worker origin. The credential is passed in the iframe URL fragment (not its query string), then sent as a Bearer authorization header on engine API calls. The fragment stays on reload so the same task resumes. Keep the credential private, like a session cookie; possession permits resuming that one task.

Qualtrics documents custom headers, JSON bodies, response-field mapping, and synchronous Web Service execution at https://www.qualtrics.com/support/survey-platform/survey-module/survey-flow/advanced-elements/web-service/ . Availability and imported JavaScript must be checked in your account.

## Guarantees and lifecycle

- Every recommendation load, event write, and choice save requires an unexpired credential issued by the authenticated survey service, bound to the configured survey, study, ResponseID, condition, scenario, and stimulus version.
- First successful recommendation loading creates one task row. Reloads, duplicate tabs, and retried Web Service calls reuse that task and credential. A saved choice resumes the completion screen; the first saved choice remains authoritative.
- The credential lasts seven days from issuance. Retries do not extend it. Expired responses fail closed; do not silently issue a fresh exposure under the same response ID. Changing survey, assignment, preview mode, or stimulus version also fails closed.
- Tokens are opaque random 256-bit credentials stored server-side. No browser signing secret or self-asserted response ID can mint them. Copying a credential can resume its existing task; it cannot create another respondent's task. This is one logical task per verified response, not a guarantee of a single screen rendering or single physical browser.
- Previously created, unverified task rows cannot be resumed with their old credentials. A legacy row with a different token returns 409; use fresh Qualtrics test responses after this migration. Historical data is preserved.
- Main-study release gates still apply. Verification does not enable collection or certify AI provenance.

## Acceptance checks before publishing

Run `npm test` and a staging Worker dry run. Then test in a real Qualtrics response:

- Both arms get a token only after consent, eligibility, and assignment.
- Missing/wrong header, wrong survey ID, invented response IDs without credentials, and direct engine URLs are denied.
- Reload before choosing and opening the same task in another tab retain one assignment; reload after saving restores completion and lets the same survey continue.
- Swapping response ID or arm with the same credential is denied. Disabling preview invalidates pilot credentials.
- Web Service failure or absent `launch_token` keeps Next hidden and does not show recommendations.
- Exported ResponseID joins to `verified_study_sessions.rid` and `study_assignments.rid`. Exclude session tokens from research exports and never publish participant data.
