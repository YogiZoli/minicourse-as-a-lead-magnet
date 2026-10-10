# BUILD PROMPT: Course Outliner v2 (Minicourse as a Lead Magnet)

Paste everything inside the code block into a new Claude chat.

```
You are a senior full-stack builder and online course architect. Task: build "Course Outliner" v2, a lead magnet that turns a creator's expertise into a complete course outline and pushes it straight into their course platform.

PHASE 0: MANUAL STEPS FIRST (do this before writing any code)
Read this whole prompt, then send me ONE list of every manual step I must do myself (accounts, API keys, test accounts, GCP project, OAuth consent screen, Railway project, env vars), in the order I should do them, each with the exact URL or click path. Then STOP and wait for my "done". Do not build anything before that.
Rules for the infrastructure:
- New Railway project "course-outliner". Do NOT touch the existing PDT (publishing-dreamteam) or C2C Railway projects or their env vars.
- New, separate GCP project "course-outliner" for the YouTube part. Do NOT reuse the PDT GCP project, so quotas and consent screens stay separate.

REUSE FIRST
- Structure: Ryan Levesque's bucket.io "Delivery Program Blueprint". Reconstructed sections: Program Format, Name, Bold Promise, Ideal Client, Who Delivers, Process Steps (modules), Unique Approach (name, summary, how to visualize, rationale), Number and Duration of Sessions, Outline per Session (steps covered, relevance, Teach / Do / Review timing, rationale), Resources and Handouts per session. Generalize it. Questions in Ryan Levesque voice: short, plain, friendly, each says why it asks.
- Same pattern and visual quality as my live Freedom Calculator (https://yogizoli.github.io/freedom-calculator/) and GHL Income Calculator (https://yogizoli.github.io/ghl-income-calculator/): same constants (WEBHOOK_URL, PROGRAM_URL), same email gate, same PDF approach.

ARCHITECTURE
- One Railway service (Node): serves the static frontend and a thin stateless proxy. The proxy only forwards the user's own credentials per request to Whop, GHL, MCG and YouTube, because those APIs cannot be called safely from the browser.
- NEVER store keys, tokens, answers or outlines. No database. Never log secrets or request bodies.
- Code lives in this repo: YogiZoli/minicourse-as-a-lead-magnet (private).

FLOW
1. Questions, one per screen, 10 to 14 max.
2. Email gate BEFORE any generation: name + email, POST {name, email, source:"course-outliner", answers} to WEBHOOK_URL (empty now; skip silently if empty).
3. Generation, two modes:
   a. Prompt Pack (default): copy-ready prompt for any AI app (Claude, ChatGPT, Gemini); user pastes the result back.
   b. Own AI key (optional): user pastes an Anthropic, OpenAI or Gemini key; one click generates the outline. Key kept in sessionStorage only, sent directly from the browser to the AI provider, never to my server. Say so in one line next to the field.
   Both modes produce one strict JSON outline schema (define it in /schema): course, modules, lessons with Teach / Do / Review, resources, and per lesson a YouTube title, description and playlist position.
4. Outputs on the result screen:
   - PDF "My Course Blueprint" and .md
   - Per lesson Video Brief .md (title, keyword, hook, Teach / Do / Review, CTA). My internal IdeaToVideo tool will read this later; keep the format clean and stable, documented in /schema.
   - YouTube playlist plan: ordered lessons with YouTube-optimized titles and descriptions (copy blocks, CSV).
5. Direct push, built and tested IN THIS ORDER, each behind its own button, each with a dry-run preview, then confirm, then the created item's link or the platform error in plain words:
   1) Whop: create course, chapters, lessons via the official API with the user's Whop API key.
   2) GHL: Import Courses endpoint (POST https://services.leadconnectorhq.com/courses/courses-exporter/public/import, header Version: v3). User gives locationId + Private Integration Token. Modules to categories, lessons to posts (visibility draft). Verify against current docs first; the published examples are inconsistent.
   3) MCG (Mini Course Generator): FIRST verify what exists: a REST API with an API key, or only the MCP server with OAuth (course_create exists; check lesson creation). Implement the path that creates a full course with lessons. If lessons cannot be created, create course plus modules, ship lesson content as an import file, and tell me exactly what was missing.
   4) Skool: export only (copy-ready modules and lessons, CSV). Skool has no official API; never use unofficial scrapers or session cookies.
   5) YouTube: create ONE empty playlist on the user's channel (title, description, privacy unlisted by default) via YouTube Data API v3 playlists.insert with Google OAuth. No video upload, no other calls. Request only the scope playlists.insert needs (youtube.force-ssl or youtube) and nothing else. While the app is in Testing mode only my test users can connect; show a clear message to others. Tell me what Google verification requires to go public.
6. Final CTA on the result screen and last PDF page: one line to my 6-pillar cohort program (PROGRAM_URL).

CONSTRAINTS
- English UI. No emojis anywhere. No dashes as sentence punctuation.
- Mobile first, premium look.
- Test each push only against my own test accounts, never a real client account.

DELIVERABLES
- Live Railway URL plus this repo
- 6-line summary: question list, schema location, which pushes work end to end, what MCG supported, how to test each push, where the constants are.
- After v2 works: a brand-design duplicate using my shared design system (YogiZoli/brand-frames, as in vidrev, PDT, IdeaToVideo), as a separate route; original untouched.
```
