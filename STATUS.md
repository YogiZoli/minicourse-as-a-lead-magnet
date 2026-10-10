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
| Brand design (Shine) on the main page, brand PDF with embedded Open Sans | live. Checked on phone width for the question, generation and result screens. Zoltan has not reviewed it yet |
| One-click generation (server-side Gemini key) | works, tested locally (75 s when the first model was overloaded) |
| Own AI key mode | Gemini only, verified with `scripts/test-ai.mjs`. Claude, ChatGPT and Grok are listed but disabled ("coming soon"). The Claude and ChatGPT calls exist in `callAi()` but are untested, Grok is not written |
| PDF, .md, outline .json | works. PDF layout not yet reviewed by eye |
| Video Course Content Brief (.json, .md, per lesson .md) | works |
| YouTube playlist plan (copy blocks, CSV) | works |
| GHL push | works end to end, tested on the vidrev location: 2 modules, 4 lessons, all Draft. Lesson body text not yet checked by eye |
| Whop push | works end to end, tested on FreedompreneurAI, Courses experience. Two hidden test courses exist there: `cors_xcrIup1Ssb5mz` (has a leftover placeholder chapter) and `cors_FGVYRfhMOeUup` (clean). The "Open it" link is `whop.com/experiences/{exp_id}/`, which Whop redirects to the right company route |
| MCG push | sign-in works (tested live by Zoltan). Create is written: `course_create` then one `module_push` (our modules become sections), with a real `dryRun` in the preview. Not yet run against the account |
| Skool export | works |
| YouTube playlist | works end to end, tested live by Zoltan on 2026-10-10 (unlisted playlist created) |

## Next step

2. Zoltan: run the MCG push once on the live page (Connect, then Confirm and create) and report the result.
4. Fill `WEBHOOK_URL`, `PROGRAM_URL`, `SNAPSHOT_URL` in `public/config.js`.
5. Review the PDF and one GHL lesson body by eye.
6. After the MCG push is confirmed: the 6-line summary from the brief.
7. Zoltan has more UI requests. He wants them handled separately, after v2 is complete.

GHL testing happens only in the vidrev sub-account. Never touch VoxFlow.
