# STATUS

Updated: 2026-10-10

## End goal

A lead magnet that turns a creator's expertise into a complete course outline and pushes it into their course platform (Whop, GHL, MCG, Skool export, YouTube playlist), in the brand design.

## Where we are

- Live: https://minicourse-as-a-lead-magnet-production.up.railway.app
- Railway project and service: `minicourse-as-a-lead-magnet` (project ID `0cf1639a-b698-40fa-9bed-669f50d31a15`)
- GCP project `minicourse-as-a-lead-magnet` exists, YouTube Data API v3 enabled.

| Part | State |
|---|---|
| 12 questions, email gate, Prompt Pack, paste back | works, tested in browser |
| Detailed logging (structured server log, page events, session and ref codes, `scripts/logs.mjs`) | live. See README, "Logging" |
| Reliability pass (time limits, live status, refs, activity log, crash notice, safe restart of saved work) | live. Every server error path probed with wrong keys and bad input. See README, "When something goes wrong" |
| Brand design (Shine) on the main page, brand PDF with embedded Open Sans | live. Checked on phone width for the question, generation and result screens. Zoltan has not reviewed it yet |
| One-click generation (server-side Gemini key) | works live. 14 s when the first model answers, about 65 s when it hangs and the next one takes over |
| Own AI key mode | Gemini only, verified with `scripts/test-ai.mjs`. Claude, ChatGPT and Grok are listed but disabled ("coming soon"). The Claude and ChatGPT calls exist in `callAi()` but are untested, Grok is not written |
| PDF, .md, outline .json | works. PDF layout not yet reviewed by eye |
| Video Course Content Brief (.json, .md, per lesson .md) | works |
| YouTube playlist plan (copy blocks, CSV) | works |
| GHL push | works end to end, tested on the vidrev location: 2 modules, 4 lessons, all Draft. Lesson body text not yet checked by eye |
| Connect Whop and Connect GoHighLevel (OAuth, no keys to copy) | code live, switched off until the app ids are set. Tested locally with a simulated sign-in window. Not yet run against real Whop or GHL sign-in |
| Whop push | works end to end, tested on FreedompreneurAI, Courses experience. Two hidden test courses exist there: `cors_xcrIup1Ssb5mz` (has a leftover placeholder chapter) and `cors_FGVYRfhMOeUup` (clean). The "Open it" link is `whop.com/experiences/{exp_id}/`, which Whop redirects to the right company route |
| MCG push | works end to end, run live by Zoltan on 2026-10-10: dry run passed, course and draft module created, link opened. Lesson content inside the MCG editor not yet checked by eye |
| Skool export | works |
| YouTube playlist | works end to end, tested live by Zoltan on 2026-10-10 (unlisted playlist created) |

## Next step

All five targets work. v2 is functionally complete.

0. Zoltan: create the Whop app and the HighLevel Marketplace app (steps were given in chat on 2026-10-10), send the Whop app id and the GHL client id, put the GHL client secret into `.env.test` as `GHL_CLIENT_SECRET=`. Then set the three Railway variables and test both Connect buttons live. Open question for the first live test: does Whop list the visitor's companies with `company:basic:read`.
1. Zoltan: fill `WEBHOOK_URL`, `PROGRAM_URL`, `SNAPSHOT_URL` in `public/config.js` (still empty or placeholder).
2. Zoltan: review the brand design and the PDF by eye, and one lesson body in GHL, Whop and MCG.
3. Zoltan has more UI requests (one known: feedback after an action is too small). He wants them as a separate round.
4. Open: Claude, ChatGPT and Grok in the own-key mode are listed as "coming soon".
5. Open: test data left in his accounts, his call whether to delete: GHL vidrev (1 course), Whop FreedompreneurAI (2 hidden courses), MCG (1 course), YouTube (1 unlisted playlist).

GHL testing happens only in the vidrev sub-account. Never touch VoxFlow.
