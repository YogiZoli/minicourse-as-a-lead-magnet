# STATUS

Updated: 2026-10-10

## End goal

A lead magnet that turns a creator's expertise into a complete course outline and pushes it into their course platform (Whop, GHL, MCG, Skool export, YouTube playlist). After v2 works: a brand-design duplicate on a separate route.

## Where we are

- Live: https://minicourse-as-a-lead-magnet-production.up.railway.app
- Railway project and service: `minicourse-as-a-lead-magnet` (project ID `0cf1639a-b698-40fa-9bed-669f50d31a15`)
- GCP project `minicourse-as-a-lead-magnet` exists, YouTube Data API v3 enabled.

| Part | State |
|---|---|
| 12 questions, email gate, Prompt Pack, paste back | works, tested in browser |
| Own AI key mode (Anthropic, OpenAI, Gemini) | built, not tested (no key yet) |
| PDF, .md, outline .json | works. PDF layout not yet reviewed by eye |
| Video Course Content Brief (.json, .md, per lesson .md) | works |
| YouTube playlist plan (copy blocks, CSV) | works |
| GHL push | works end to end, tested on the vidrev location |
| Whop push | built, not tested (waiting for API key and company ID) |
| MCG push | sign-in and tool listing built, course creation not built (tool list needed from a signed-in account) |
| Skool export | works |
| YouTube playlist | built, not tested (waiting for OAuth Client ID) |

## Next step

1. Zoltan: Whop API key into `.env.test`, company ID in chat. Then run `node scripts/test-push.mjs whop`.
2. Zoltan: OAuth consent screen and client in GCP, send the Client ID. Then set `GOOGLE_CLIENT_ID` on Railway and test the playlist button.
3. Zoltan: click Connect Mini Course Generator on the result screen, copy the connection details, send them. Then write `mcgCreate()` in `public/app.js`.
4. Check the GHL test course by eye: are the posts drafts, does the lesson text render.
5. Fill `WEBHOOK_URL`, `PROGRAM_URL`, `SNAPSHOT_URL` in `public/config.js`.
6. After all pushes work: brand-design duplicate on a separate route.
