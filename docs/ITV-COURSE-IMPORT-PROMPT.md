# Minicourse to IdeaToVideo: leírás és prompt

Frissítve: 2026-10-11. A Minicourse oldal kész rá (M1 és M3 él). Az IdeaToVideo oldal még nincs megépítve, arról szól a lenti prompt.

A teljes terv a Drive doksiban van: https://docs.google.com/document/d/1KsI3-BgoPnOi-EAarbQePz8I_WBAAAQ-J0bwGA2QItw/edit

## 1. Leírás

### A lánc

1. **Offer:** kinek és mit adsz el.
2. **Minicourse as a Lead Magnet:** ebből készül a **Course Content Structure**: modulok, leckék, és minden leckéhez cím, kulcsszó, hook, Teach, Do, Review, CTA, YouTube cím és leírás. Ez a terv, videó nincs benne.
3. **IdeaToVideo:** beolvassa a Course Content Structure-t, és minden leckéből egy előre kitöltött videóprojekt lesz. Egyesével legyártod őket, nem üres lapról.
4. **Feltöltés:** kézi, a gépedről a YouTube Studióban. Egyik eszköz sem tölt fel videót.
5. **PDT:** elkészíti a Publishing Packet. Ha ugyanezt a Course Content Structure fájlt olvassa be, a csomag a lecke címéből, kulcsszavából és leírásából indul, nem nulláról.

Egy fájl köti össze mind a hármat: Minicourse, IdeaToVideo, PDT.

### Az átadás módja

Fájl és vágólap, ugyanarra a tartalomra. A Minicourse eredmény képernyőjén, a "Course Content Structure" panelben: "Copy for IdeaToVideo" és "Download the file". Szerver, API és közvetlen link nincs.

### Mi van kész a Minicourse oldalon

| # | Feladat | Állapot |
|---|---|---|
| M1 | A Course Content Structure formátuma leírva és lefagyasztva: `schema/course-content-structure.md`, séma 1.1 | kész, él |
| M3 | Letöltés, "Copy for IdeaToVideo", és "Open a Course Content Structure" az első képernyőn | kész, él |

A playlist azonosítója is bekerül a fájlba, ha a playlistet ugyanabban a munkamenetben hoztad létre az oldalon.

### Ami nem lesz

Zoltan döntése (2026-10-11): ezek nem kellenek, később sem.

- A push-ok nem jegyzik meg a platformon létrehozott kurzus és leckék azonosítóit.
- Nincs "Add my videos", a videók nem kerülnek be automatikusan a kurzus leckéibe. A kész videó linkjét kézzel teszed be.
- Nincs videófeltöltés egyik eszközben sem.

## 2. A prompt

Illeszd be az egész kódblokkot egy új Claude beszélgetésbe, amit az IdeaToVideo mappában nyitsz.

```
You are a senior desktop app engineer working in the IdeaToVideo repo (Tauri, Svelte, Node runner, HyperFrames).

Task: add "Course import", so a course planned in my Minicourse web app arrives in IdeaToVideo as one ready-to-produce video project per lesson. The input is a "Course Content Structure" file.

PRECONDITION (check before anything else)
The input format is owned by the Minicourse repo and is frozen. Check that this file exists:
  C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-content-structure.md
If it does not exist, STOP and tell me. Do not design your own format, and do not change that one.

PHASE 0: READ FIRST, THEN PLAN (no code before my "go")
1. Read STATUS.md and DECISIONS.md in this repo, then docs/import-export.md and docs/ui-simplify.md. Say back: end goal, where we are, next step.
2. Read the input format and the example:
   - C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-content-structure.md
   - C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/example-course-content-structure.json
   Also online: https://minicourse-as-a-lead-magnet-production.up.railway.app/schema/course-content-structure.md
3. Send me ONE short plan: what you will add, which existing screens and files it touches, what you will NOT touch, and every open question with your recommendation. Then STOP and wait for my "go".

WHAT IT MUST DO
1. Two ways in, one parser:
   a. Settings, Import & Export: a new row "Course Content Structure (.json)" with a file picker.
   b. The same place: "Paste Course Content Structure", for the "Copy for IdeaToVideo" button on the Minicourse page. The pasted text is the exact file content.
   Follow the "Rules for readers" in the spec: check type and the major schema_version, refuse anything else in plain words, ignore fields you do not know (including the "outline" block).
2. Before anything is created, show a preview: course title, number of lessons, lesson titles in playlist order, and the playlist link if the file has one. Create only after I confirm.
3. Create one video project per lesson, prefilled from lessons[]:
   - title, keyword, hook, CTA
   - a script seed built from teach.points, do.exercise and review.check, in that order, with the minutes as target lengths
   - packaging: youtube.title and youtube.description
   - series data kept with the project: course slug, lesson id (for example m1-l1), playlist position, playlist id and URL if present
4. Keep the existing rule: IdeaToVideo always works on one video. A course is only a grouping above the videos. Show the group in a way that fits the current UI (propose: a filter on Videos, or a small course view) with each lesson's status.
5. Re-import must be safe: the key is course slug plus lesson id. Update only the prefilled fields I have not edited by hand, never create duplicates. Tell me what was updated and what was left alone.
6. Never start anything that costs money or takes long by itself: no HeyGen, no AI B-roll, no render. Import only prepares.
7. No video upload, here or anywhere. Upload stays manual in YouTube Studio. Make that manual step easy on the Video tab: show "Playlist: position N of M" with the playlist link, next to the existing "Upload on YouTube" copy buttons, and tell me to upload the lessons in order.
8. Video Publishing Card: add an optional "series" block (courseSlug, lessonId, playlistPosition, playlistId). Bump the card schema the way DECISIONS says versions are bumped. It must stay harmless to a receiver that does not know it.
9. Keep the imported file with the course group, unchanged, and offer "Export Course Content Structure", so the same file can go on to the publishing app or back to the Minicourse page.

CONSTRAINTS
- The two house rules stand: we write text, HyperFrames makes frames. The picture shows what the voice is talking about.
- No new render or video engine. No change to the pipeline phases.
- English UI. No emojis anywhere. No dashes as sentence punctuation.
- Everything stays local. No new network calls, no listening port, no custom URL scheme.
- Follow the existing code style, test style and the DECISIONS numbering.

DELIVERABLES
- The feature on a branch with a PR, tests green (Node, Rust, e2e, UI check).
- A fixture under the tests: a copy of example-course-content-structure.json.
- DECISIONS.md entries for every choice you made, STATUS.md updated.
- A 5-line summary: where the import lives, how lessons map to projects, how re-import behaves, what changed in the publishing card, how to test it by hand.
- No installer build unless I ask.

OPEN QUESTIONS FOR ME (answer each in your plan with a recommendation)
- Course view: a new screen, or a filter on Videos?
- Script seed: only prepared, or written by the AI right at import (costs tokens)?
```

## 3. Megjegyzés a PDT-hez

A PDT olvassa be ugyanezt a Course Content Structure fájlt, hogy a Publishing Pack minden leckénél a `title`, a `keyword` és a `youtube.description` mezőből induljon. Ez külön feladat a PDT repóban, ehhez még nincs prompt. A formátum leírása ugyanaz: `schema/course-content-structure.md`.
