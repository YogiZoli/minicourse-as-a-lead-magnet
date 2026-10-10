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
- `WHOP_CLIENT_ID`: the Whop app id (`app_...`) for the Connect Whop button. Empty means the panel asks for an API key.
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

## When something goes wrong: how to trace it

- Every API request gets a short reference, for example `ref 2aa496`. The visitor sees it at the end of the error message.
- The visitor also has an "Activity log" at the bottom of the page with the time of every step. They can copy it and send it. It holds no keys.
- On the server, each API request writes one line with the same ref: path, status, duration, and which outside service answered with what status. No content, keys or tokens.

Find a request in the Railway logs by its ref:

```text
railway logs -s minicourse-as-a-lead-magnet | findstr 2aa496
```

Example line: `api ref=2aa496 /api/ghl/push 502 508ms upstream=services.leadconnectorhq.com:401`

Reading `upstream`: a status number is what the platform answered, `timeout` means it did not answer in time, `noanswer` means the connection failed, `invalid-outline` means an AI model answered but the outline was not complete. A line with `bug=` is an error in our own code.

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
