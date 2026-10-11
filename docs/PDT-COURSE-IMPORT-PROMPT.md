# Minicourse to PDT: leírás és prompt

Készült: 2026-10-11. Állapot: átnézésre vár, a PDT oldalon ebből még semmi nincs megépítve.

A teljes terv a Drive doksiban van: https://docs.google.com/document/d/1KsI3-BgoPnOi-EAarbQePz8I_WBAAAQ-J0bwGA2QItw/edit

## 1. Leírás

### Mi a cél

A PDT olvassa be ugyanazt a Course Content Structure fájlt, amit a Minicourse kiad és az IdeaToVideo is beolvas. Így amikor egy kurzus leckevideójához Publishing Pack készül, az nem nulláról indul, hanem a lecke címéből, kulcsszavából, hookjából és YouTube leírásából. A PDT tudja, hogy a videó melyik kurzus hányadik leckéje, és melyik playlistbe tartozik.

### Hol a helye a láncban

1. Offer.
2. Minicourse: Course Content Structure.
3. IdeaToVideo: leckénként egy videó.
4. Kézi feltöltés a YouTube Studióban.
5. **PDT: Publishing Pack, a leckéből indulva.**

### Hogyan találja meg a PDT a leckét

Két úton:

- **Kártyából:** az IdeaToVideo Publishing kártyája visz majd egy `series` blokkot (kurzus, lecke azonosító, sorszám, playlist). Ha ez megvan, a párosítás magától megy. Ez az IdeaToVideo oldalon még nincs megépítve, az ottani prompt része.
- **Kézzel:** amikor YouTube linkből készül csomag, a user kiválasztja, melyik kurzus melyik leckéje.

### Amit a prompt nem enged

- Videófeltöltést. A PDT nem tölt fel videót, és ez így marad.
- A meglévő napi és havi csomagkeret megváltoztatását.
- Bármit, ami a C2C infrastruktúrához nyúl.

### Előfeltétel

A formátum le van fagyasztva és él: `schema/course-content-structure.md` (séma 1.1). A prompt első lépése ellenőrzi, hogy megvan-e.

## 2. A prompt

Illeszd be az egész kódblokkot egy új Claude beszélgetésbe, amit a publishing-dreamteam mappában nyitsz.

```
You are a senior full-stack engineer working in the Publishing Dream Team (PDT) repo (FastAPI, Postgres, server-rendered templates).

Task: let PDT read a "Course Content Structure" file, so the Publishing Pack for a course lesson video starts from that lesson's title, keyword, hook and description instead of from nothing.

PRECONDITION (check before anything else)
The input format is owned by the Minicourse repo and is frozen. Check that this file exists:
  C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-content-structure.md
If it does not exist, STOP and tell me. Do not design your own format, and do not change that one.

PHASE 0: READ FIRST, THEN PLAN (no code before my "go")
1. Read STATUS.md and DECISIONS.md in this repo, including the Hard rules, then docs/CARD-PLAN.md, app/contracts, app/apicards.py, app/cards.py and app/cardpack.py. Say back: end goal, where we are, next step.
2. Read the input format and the example:
   - C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/course-content-structure.md
   - C:/Users/gdp/projects/minicourse-as-a-lead-magnet/schema/example-course-content-structure.json
   Also online: https://minicourse-as-a-lead-magnet-production.up.railway.app/schema/course-content-structure.md
3. Send me ONE short plan: what you will add, which tables, routes, templates and flags it touches, what you will NOT touch, and every open question with your recommendation. Then STOP and wait for my "go".

WHAT IT MUST DO
1. Import, behind a new feature flag (off by default):
   a. In the web app: a "Courses" place where a signed-in user uploads the .json file or pastes its content. The pasted text is the exact file content.
   b. Follow the "Rules for readers" in the spec: check type and the major schema_version, refuse anything else in one plain sentence, ignore fields you do not know (including the "outline" block).
2. Before anything is saved, show a preview: course title, number of lessons, lesson titles in playlist order, and the playlist link if the file has one. Save only after the user confirms.
3. Store the course and its lessons per user. The key of a lesson is the user, course.slug and the lesson id (for example m1-l1). Importing the same course again updates it, never duplicates it, and never overwrites a pack the user already made or edited. Say what was updated and what was left alone.
4. Use the lesson as the starting point of a Publishing Pack:
   - From a card: the Video Publishing Card will carry an optional "series" block (courseSlug, lessonId, playlistPosition, playlistId), added by IdeaToVideo. When it is present and matches a stored lesson, start the pack from that lesson. When it names a course PDT does not have, make the pack the normal way and say so in one plain sentence. A card without "series" must work exactly as today.
   - From a YouTube URL: let the user pick "this video is a lesson of a course" and choose the course and the lesson.
   - What the lesson gives: youtube.title as the first title candidate, keyword as the main keyword, youtube.description and hook as input for the description, cta for the pinned comment and the end of the description, and the course title and playlist for context. These are starting points. The engine still does its job, and anything the user edits wins.
5. A course view: the lessons in playlist order, each with its state (no pack yet, pack made, published or paired), and a link to its pack. Show the playlist link, and "lesson N of M" on each pack that belongs to a course.
6. No video upload. Do not add an upload feature, an upload scope or a new Google permission. Upload stays manual in YouTube Studio.
7. Keep the pack limits (per day and per month) exactly as they are.

CONSTRAINTS
- Follow the Hard rules in STATUS.md. Never touch C2C infrastructure.
- Schema changes go through migrations/, the way the repo already does it. The card contract change (the optional "series" block) follows the versioning rule in app/contracts and DECISIONS, and must stay harmless to senders that do not use it.
- English UI. No emojis anywhere. No dashes as sentence punctuation.
- Errors shown to a user are one human sentence, as the card API already does.
- Follow the existing code style, test style, flag pattern and the DECISIONS numbering.

DELIVERABLES
- The feature on a branch with a PR, tests green, behind the flag.
- A fixture under the tests: a copy of example-course-content-structure.json.
- DECISIONS.md entries for every choice you made, STATUS.md updated.
- A 5-line summary: where the import lives, how a lesson is matched to a video, what the pack takes from the lesson, how re-import behaves, how to test it by hand.
- No deploy and no flag switch unless I say so.

OPEN QUESTIONS FOR ME (answer each in your plan with a recommendation)
- Should there also be an API way in (for example POST /api/v1/courses with the same Bearer token as cards), or is upload and paste enough for now?
- Does importing a course count against any limit?
- If a lesson changed in a re-import after its pack was made: leave the pack alone and show a note, or offer to rebuild it?
```

## 3. Megjegyzés

- A `series` blokkot az IdeaToVideo adja a kártyához, az ottani prompt 8. pontja szerint. A két munka független: a PDT import a kézi lecke-választással a `series` blokk nélkül is használható.
- A PDT belsejét a STATUS fájlból és a kártya API kódjából ismerem, a csomagkészítő motort nem olvastam végig. Ezért a prompt itt is azzal kezd, hogy az ottani Claude olvasson, tervezzen, és várjon a jóváhagyásodra.
