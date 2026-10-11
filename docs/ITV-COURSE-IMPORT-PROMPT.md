# Minicourse to IdeaToVideo: leírás és prompt

Állapot: terv, Zoltan átnézésére vár. Ebből még semmi nincs megépítve. Frissítve: 2026-10-11.

A teljes terv a Drive doksiban van: https://docs.google.com/document/d/1KsI3-BgoPnOi-EAarbQePz8I_WBAAAQ-J0bwGA2QItw/edit

## 1. Leírás

### Mi a cél

A user válaszol a Minicourse kérdéseire, és a végén kész videós kurzust kap: a leckevideók elkészülnek az IdeaToVideóban, felkerülnek a YouTube playlistbe, és megjelennek a kurzus leckéiben.

### Mi lehetséges és mi nem

Egy kézi lépés marad: a kész videók feltöltése a YouTube Studióban. Ennek oka a Google szabálya. Nem ellenőrzött Google projektből API-n feltöltött videót a YouTube privát állapotba zár, amíg a projekt át nem megy az auditon. Minden más automatizálható.

Az IdeaToVideo asztali app, ezért a teljes lánc azoknak megy, akiknél telepítve van.

### A lánc

1. Kérdések és kurzusváz. Minicourse, megvan.
2. Kurzus a platformon és üres playlist. Minicourse, megvan.
3. Átadás: a Minicourse kiad egy Course Passport fájlt (vagy vágólapra teszi). Új.
4. Import: az IdeaToVideo minden leckéből egy előre kitöltött videóprojektet hoz létre. Új, erről szól a lenti prompt.
5. Gyártás: a user videónként legyártja az MP4-et. IdeaToVideo, megvan.
6. Feltöltés a playlistbe a YouTube Studióban. Kézi.
7. Beágyazás: a Minicourse beolvassa a playlistet, és beírja a videókat a kurzus leckéibe. Új.

### Az átadás módja

Első körben fájl import és vágólap, együtt. Ugyanaz a kód olvassa be mindkettőt, és egyikhez sem kell szerver. Közvetlen link (a weboldal megnyitja az asztali appot) a második körben jöhet. API-t nem javaslok: a helyi API biztonsági felületet nyit a gépen, a felhős API tárolást igényel a szerveren.

### A Course Passport

Egy JSON fájl, a mostani Video Course Content Brief kibővítése (séma 1.1): a kurzusváz, a playlist azonosítója, és a platformon létrehozott kurzus és leckék azonosítói. Ebből dolgozik az IdeaToVideo, és ebből tudja a Minicourse a végén, melyik leckébe melyik videó megy.

### Mikor adható ki a prompt

Csak akkor, ha a Minicourse oldalon ez a három kész van:

| # | Feladat | Állapot |
|---|---|---|
| M1 | A Course Passport sémája (1.1) leírva: `schema/course-passport.md` | nincs kész |
| M2 | A push-ok megjegyzik, mit hoztak létre (playlist, kurzus, lecke-azonosítók) | nincs kész |
| M3 | Passport letöltés, "Copy for IdeaToVideo", "Open a Course Passport" | nincs kész |

Az M4 ("Add my videos") és az M5 (a beágyazás éles próbája Whopon és MCG-n) mehet párhuzamosan az IdeaToVideo munkával.

A prompt első lépése ellenőrzi az M1 meglétét, és megáll, ha a séma fájl még nincs meg.

## 2. A prompt

Illeszd be az egész kódblokkot egy új Claude beszélgetésbe, amit az IdeaToVideo mappában nyitsz.

```
You are a senior desktop app engineer working in the IdeaToVideo repo (Tauri, Svelte, Node runner, HyperFrames).

Task: add "Course import", so a course outlined in my Minicourse web app arrives in IdeaToVideo as one ready-to-produce video project per lesson.

PRECONDITION (check before anything else)
The input format is owned by the Minicourse repo. Check that this file exists:
  C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-passport.md
If it does not exist, STOP and tell me: the Minicourse side is not ready yet. Do not design your own format.

PHASE 0: READ FIRST, THEN PLAN (no code before my "go")
1. Read STATUS.md and DECISIONS.md in this repo, then docs/import-export.md and docs/ui-simplify.md. Say back: end goal, where we are, next step.
2. Read the input format and an example:
   - C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-passport.md
   - the example passport next to it, and public/outline.js in that repo for how it is built
3. Send me ONE short plan: what you will add, which existing screens and files it touches, what you will NOT touch, and every open question with your recommendation. Then STOP and wait for my "go".

WHAT IT MUST DO
1. Two ways in, one parser:
   a. Settings, Import & Export: a new row "Course passport (.json)" with a file picker.
   b. The same place: "Paste course from clipboard", for the "Copy for IdeaToVideo" button on the Minicourse page.
   Validate type and the major schema_version. Refuse an unknown major version in plain words. Ignore fields you do not know.
2. Before anything is created, show a preview: course title, number of lessons, lesson titles in playlist order, and the playlist link if the passport has one. Create only after I confirm.
3. Create one video project per lesson, prefilled from the passport:
   - title, keyword, hook, CTA
   - a script seed built from teach.points, do.exercise and review.check, in that order, with the minutes as target lengths
   - packaging: youtube.title and youtube.description
   - series data kept with the project: course slug, lesson id (for example m1-l1), playlist position, playlist id and URL if present
4. Keep the existing rule: IdeaToVideo always works on one video. A course is only a grouping above the videos. Show the group in a way that fits the current UI (propose: a filter on Videos, or a small course view) with each lesson's status: not started, script, rendered, sent to publishing.
5. Re-import must be safe: match on course slug plus lesson id, update only the prefilled fields I have not edited by hand, never create duplicates. Tell me what was updated and what was left alone.
6. Never start anything that costs money or takes long by itself: no HeyGen, no AI B-roll, no render. Import only prepares.
7. Upload stays manual, because Google locks API uploads from unverified projects to private. Make the manual step easy on the Video tab: show "Playlist: <name>, position N of M" with the playlist link, next to the existing "Upload on YouTube" copy buttons. Tell the user to upload the lessons in order.
8. Video Publishing Card: add an optional "series" block (courseSlug, lessonId, playlistPosition, playlistId). Bump the card schema the way DECISIONS says versions are bumped. It must stay harmless to a receiver that does not know it.
9. Keep the passport with the course group, unchanged, and offer "Export course passport" so I can take it back to the Minicourse page. IdeaToVideo does not need to send video ids back: the Minicourse app reads the playlist itself.

CONSTRAINTS
- The two house rules stand: we write text, HyperFrames makes frames. The picture shows what the voice is talking about.
- No new render or video engine. No change to the pipeline phases.
- English UI. No emojis anywhere. No dashes as sentence punctuation.
- Everything stays local. No new network calls, no listening port, no custom URL scheme in this round.
- Follow the existing code style, test style and the DECISIONS numbering.

DELIVERABLES
- The feature on a branch with a PR, tests green (Node, Rust, e2e, UI check).
- A fixture passport under the tests, copied from the Minicourse example.
- DECISIONS.md entries for every choice you made, STATUS.md updated.
- A 5-line summary: where the import lives, how lessons map to projects, how re-import behaves, what changed in the publishing card, how to test it by hand.
- No installer build unless I ask.

OPEN QUESTIONS FOR ME (answer each in your plan with a recommendation)
- Course view: a new screen, or a filter on Videos?
- Script seed: only prepared, or written by the AI right at import (costs tokens)?
- A later round: a custom link type so the Minicourse page can open IdeaToVideo directly. Worth it?
```

## 3. Háttér az átnézéshez

- Az IdeaToVideo és a PDT ma nem tölt fel videót a YouTube-ra. Az IdeaToVideo megnyitja a YouTube Studiót és másolás gombokat ad, a PDT a publikálási csomagot készíti. Ezt a két repo STATUS és DECISIONS fájljából és a kódból néztem meg.
- A prompt szándékosan nem enged hálózati hívást, figyelő portot és saját linktípust. Ezek a második körbe tartoznak, ha kellenek.
- A beágyazás (a lánc 7. lépése) a Minicourse dolga, nem az IdeaToVideóé.
