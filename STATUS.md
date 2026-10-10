# STATUS

Updated: 2026-10-11

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
| Reliability pass, two rounds (time limits, live status, refs, activity log, crash notice, safe restart of saved work, sign-in window that never false-fails, expired sign-ins, cut-off requests, clean shutdown) | live. Round two was driven by the live log. Checked with simulated sign-ins and wrong keys, see DECISIONS 2026-10-11 |
| Brand design (Shine) on the main page, brand PDF with embedded Open Sans | live. Checked on phone width for the question, generation and result screens. Zoltan has not reviewed it yet |
| One-click generation (server-side Gemini key) | works live. 14 s when the first model answers, about 65 s when it hangs and the next one takes over |
| Own AI key mode | Gemini only, verified with `scripts/test-ai.mjs`. Claude, ChatGPT and Grok are listed but disabled ("coming soon"). The Claude and ChatGPT calls exist in `callAi()` but are untested, Grok is not written |
| PDF, .md, outline .json | works. PDF layout not yet reviewed by eye |
| Video Course Content Brief (.json, .md, per lesson .md) | works |
| YouTube playlist plan (copy blocks, CSV) | works |
| GHL push | works end to end, tested on the vidrev location: 2 modules, 4 lessons, all Draft. Lesson body text not yet checked by eye |
| Connect Whop and Connect GoHighLevel (OAuth, no keys to copy) | both work end to end, run live by Zoltan on 2026-10-11. GHL: sign-in, sub-account pick, course created in vidrev. Whop: sign-in, company and Courses apps found, course with 6 chapters and 6 lessons created hidden. The GHL Marketplace app is Public but still Draft, so outside agencies cannot install it until GHL reviews it |
| Whop push | works end to end, tested on FreedompreneurAI, Courses experience. Two hidden test courses exist there: `cors_xcrIup1Ssb5mz` (has a leftover placeholder chapter) and `cors_FGVYRfhMOeUup` (clean). The "Open it" link is `whop.com/experiences/{exp_id}/`, which Whop redirects to the right company route |
| MCG push | works end to end, run live by Zoltan on 2026-10-10: dry run passed, course and draft module created, link opened. Lesson content inside the MCG editor not yet checked by eye |
| Skool export | works |
| YouTube playlist | works end to end, tested live by Zoltan on 2026-10-10 (unlisted playlist created) |

## Next step

All five targets work. v2 is functionally complete.

0. Zoltan, when ready for outside users: "Submit for review" on the HighLevel Marketplace app, and "Publish app" on the Whop app if Whop requires it for other accounts (not verified).
1. Zoltan: fill `WEBHOOK_URL`, `PROGRAM_URL`, `SNAPSHOT_URL` in `public/config.js` (still empty or placeholder).
2. Zoltan: review the brand design and the PDF by eye, and one lesson body in GHL, Whop and MCG.
3. Zoltan has more UI requests (one known: feedback after an action is too small). He wants them as a separate round.
4. Open: Claude, ChatGPT and Grok in the own-key mode are listed as "coming soon".
5. Zoltan deletes the test data himself (asked 2026-10-11, the assistant does not delete data in his accounts): GHL vidrev 3 courses, Whop FreedompreneurAI 3 hidden courses, MCG 1 course, YouTube 1 unlisted playlist. Exact names and links were given in chat.

GHL testing happens only in the vidrev sub-account. Never touch VoxFlow.
