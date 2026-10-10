# Minicourse as a Lead Magnet

Course Outliner v2. A lead magnet: a creator answers 12 short questions, gets a complete course outline, and pushes it straight into their course platform.

## Stack

- One Railway service, Node, no dependencies: `server.js` serves `public/` and a thin stateless proxy.
- Frontend: plain HTML, CSS and JavaScript. PDF with jsPDF 2.5.1 from cdnjs, built in the browser.
- No database. Nothing is stored. The server logs method, path and status only, never bodies, keys or tokens.
- One-click generation goes through `/api/ai/generate` with the site's own Gemini key. Answers pass through and are not kept.

## Settings

All three constants are at the top of `public/config.js`:

- `WEBHOOK_URL`: GHL inbound webhook. Empty means no POST.
- `PROGRAM_URL`: the link behind the cohort program CTA (page and last PDF page).
- `SNAPSHOT_URL`: GHL snapshot link. Empty hides the panel shown after a GHL push.

Environment variables on Railway:

- `GOOGLE_CLIENT_ID`: public OAuth client ID for the YouTube playlist button.
- `GEMINI_API_KEY`: the site's own Gemini key for one-click generation. Empty hides the "fast way" box.
- Optional: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `AI_DAILY_LIMIT`.
- `WHOP_CLIENT_ID`: the Whop app id (`app_...`) for the Connect Whop button. Empty means the panel asks for an API key. Set the Whop app to "Public" in its OAuth tab. If it stays "Confidential", also set `WHOP_CLIENT_SECRET`.
- `GHL_CLIENT_ID` and `GHL_CLIENT_SECRET`: the HighLevel Marketplace app for the Connect GoHighLevel button. Both empty means the panel asks for a Private Integration Token. The secret is used only on the server, for the token exchange.

## Connect buttons (OAuth)

| Platform | Return address to register in the platform's app | Scopes |
|---|---|---|
| Whop | `https://<domain>/connect/whop/callback` | `openid courses:read courses:update company:basic:read` |
| GoHighLevel | `https://<domain>/connect/crm/callback` (HighLevel forbids its own name in a return address) | `courses.write` |
| MCG | `https://<domain>/mcg-callback` (registered automatically per visitor) | `mcp` |
| YouTube | none, only the JavaScript origin | `youtube.force-ssl` |

Tokens from a Connect sign-in live in the visitor's tab memory only. Nothing is stored on the server. The API key and token fields still work, under "Use an API key instead".

## Design

Zoltan Gero "Shine" design system. `public/tokens.css` is a verbatim copy of `YogiZoli/design-system/tokens.css`. When the design system changes, copy the file again. Do not edit it here. App styles are in `public/app.css`.

## Where things are

| Path | What |
|---|---|
| `public/questions.js` | The 12 questions and the prompt builder |
| `public/outline.js` | Outline logic: validate, markdown, briefs, CSV, push payload. Runs in browser and Node |
| `public/pdf.js` | My Course Blueprint PDF |
| `public/app.css` | App styles, brand role tokens only |
| `public/tokens.css` | Brand tokens, verbatim copy |
| `public/app.js` | Page flow and the push buttons |
| `server.js` | Static files and the proxy routes under `/api/` |
| `schema/outline.schema.json` | The outline format both generation modes produce |
| `schema/video-course-content-brief.md` | The video brief format for IdeaToVideo |
| `schema/example-outline.json` | A small test outline |

## Logging: how to find out what happened

Everything is in the Railway log of the service. Every line is one JSON object, so it can be filtered on any field.

**Read it from this folder:**

```text
node scripts/logs.mjs
node scripts/logs.mjs errors
node scripts/logs.mjs ref 2aa496
node scripts/logs.mjs session io7mblyuk5
node scripts/logs.mjs find whop
node scripts/logs.mjs full ref 2aa496
```

Add a number at the end to look further back, for example `node scripts/logs.mjs errors 5000`.

**Where the two codes come from:**

- `ref`: the visitor sees it at the end of every error message, for example `(ref 2aa496)`. It names one request.
- `session`: the first line of the "Activity log" at the bottom of the page. It names one browser tab, so it shows the visitor's whole path.

**What is logged (the `event` field):**

| event | when | what it carries |
|---|---|---|
| `server_start`, `server_stop` | start and redeploy | which features are on, the AI model order, uptime |
| `page_view` | the page is opened | browser, where the visitor came from |
| `api_start` | a request arrives | ref, path, size, session, visitor |
| `api_end` | a request is answered | status, duration, every outside call (`upstream`), every step (`steps`), the message the visitor was shown (`shown`), a stack if it was our bug (`bug`) |
| `page` | the visitor's page reports something | screen changes, each question answered (not the answer), sign-in windows opening and closing, pushes started and failed, downloads, files that did not load, page errors, going offline, the tab being closed while work was running |
| `signin_return` | a sign-in window comes back | whether it carried a code or an error, never the code |
| `not_found`, `bad_method`, `bad_request` | odd requests | the path |
| `crash` | anything outside the normal path | message and stack |

An `upstream` entry is one call to Whop, GoHighLevel, MCG, YouTube or Gemini: host, path, status, duration, and on a refusal the service's own words (`said`). `result: timeout` means it did not answer in time, `noanswer` means the connection failed.

**Levels:** `error` is ours to fix or a service that did not answer. `warn` is something the visitor can fix (a wrong key, a closed window). `info` is the normal path.

**What is never logged:** keys, tokens, passwords, answers, outlines, names, emails. Anything that looks like a key is masked on the page and again on the server. A visitor is a short code made from the day and the address, the address itself is not written down.

**If nothing seems to have happened:** an `api_start` without an `api_end` means the server stopped mid-request (look for `server_stop` or `crash` right after it). A session whose last line is "page closed or hidden WHILE WORK WAS RUNNING" means the visitor left during a push. No lines at all for a session means the request never reached us: the visitor's own activity log will say "could not be reached".

**How long it is kept:** as long as Railway keeps logs for the plan the project is on. Nothing is copied anywhere else.

## Run

```text
npm start
```

Then open http://localhost:3000

## Test the pushes

Copy `.env.test.example` to `.env.test` (gitignored), fill in your own test accounts, start the server, then:

```text
node scripts/test-push.mjs ghl
node scripts/test-push.mjs whop-check
node scripts/test-push.mjs whop
node scripts/test-ai.mjs gemini-flash-latest
node scripts/test-hosted-ai.mjs
```

Test only against your own test accounts, never a client account.
