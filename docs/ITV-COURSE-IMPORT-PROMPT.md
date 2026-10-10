# PROMPT: IdeaToVideo, Course brief import

Paste everything inside the code block into a new Claude chat opened in the IdeaToVideo folder.
Status: draft for Zoltan to review. Nothing here is built yet. Written 2026-10-10.

```
You are a senior desktop app engineer working in the IdeaToVideo repo (Tauri, Svelte, Node runner, HyperFrames).

Task: add "Course brief import", so a course outlined in my Minicourse web app arrives in IdeaToVideo as one ready-to-produce video project per lesson.

PHASE 0: READ FIRST, THEN PLAN (do this before writing any code)
1. Read STATUS.md and DECISIONS.md in this repo, then docs/import-export.md and docs/ui-simplify.md. Say back: end goal, where we are, next step.
2. Read the input format. It is owned by another repo, do not change it:
   - Spec: https://minicourse-as-a-lead-magnet-production.up.railway.app/schema/video-course-content-brief.md
   - Example source: C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/ and public/outline.js (function videoBrief)
3. Send me ONE short plan: what you will add, which existing screens and files it touches, what you will NOT touch, and every open question. Then STOP and wait for my "go". Do not build before that.

WHAT IT MUST DO
1. New row on Settings, Import & Export: "Course brief (.json)". File picker. Validate type == "video-course-content-brief" and the major schema_version. Refuse an unknown major version in plain words.
2. Before anything is created, show a preview: course title, number of lessons, the lesson titles in playlist order. Create only after I confirm.
3. Create one video project per lesson, prefilled from the brief:
   - title, keyword, hook, CTA
   - a script seed built from teach.points, do.exercise and review.check, in that order, with the minutes as target lengths
   - packaging: youtube.title and youtube.description
   - series data kept with the project: course slug, lesson id (for example m1-l1), playlist_position, and playlist id if the brief has one
4. Keep the existing rule: IdeaToVideo always works on one video. A course is only a grouping above the videos. Show the group somewhere sensible (a filter, a tag or a small course view, propose what fits the current UI) with each lesson's status.
5. Re-import must be safe: match on course slug plus lesson id, update the untouched prefilled fields, never create duplicates, never overwrite something I edited by hand. Tell me what was updated and what was left alone.
6. Never start anything that costs money or takes long by itself: no HeyGen, no AI B-roll, no render. Import only prepares.
7. Video Publishing Card: add an optional "series" block (courseSlug, lessonId, playlistPosition, playlistId). Bump the card schema the way DECISIONS says versions are bumped. Unknown to old receivers must stay harmless.
8. Export, for the way back: "Course videos map (.json)": for one course, lesson id to the published YouTube video id and URL, as far as they are known. The Minicourse app will read this to embed the videos into the course lessons.

FORWARD COMPATIBILITY
The brief will grow into a "Course Passport" (schema 1.1): the same fields plus an optional playlist block (id, url) and an optional platforms block (ids of the course created in Whop, GHL or MCG). Read them if present, keep them with the course group, ignore what you do not know.

CONSTRAINTS
- The two house rules stand: we write text, HyperFrames makes frames. The picture shows what the voice is talking about.
- No new render or video engine. No change to the pipeline phases.
- English UI. No emojis anywhere. No dashes as sentence punctuation.
- Everything stays local. No new network calls. The brief is a local file.
- Follow the existing code style, test style and the DECISIONS numbering.

DELIVERABLES
- The feature on a branch with a PR, tests green (Node, Rust, e2e, UI check).
- A fixture brief under the tests, copied from the Minicourse example.
- DECISIONS.md entries for every choice you made, STATUS.md updated.
- A 5-line summary: where the import lives, how lessons map to projects, how re-import behaves, what changed in the publishing card, how to test it by hand.
- No installer build unless I ask.

OPEN QUESTIONS FOR ME (answer these in your plan with a recommendation each)
- Course view: a new screen, or a filter on Videos?
- Script seed: only prepared, or written by the AI right at import (costs tokens)?
- Should import also accept a pasted link instead of a file, later?
- Where should the embed-back happen: here after publishing, or in the Minicourse app?
```

## Background for the reviewer

- The full idea, the chain of steps and the open decisions are in the Drive doc "Minicourse to IdeaToVideo: az outline-ból kész videós kurzus (terv, 2026-10-10)".
- The Minicourse side needs two small changes of its own (playlist id and platform ids in the brief). Those belong to the Minicourse repo, not to this prompt.
- PDT must be checked separately: can it upload into a given playlist at a given position.
