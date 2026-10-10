# Video Course Content Brief

The hand-off format from this tool to video production. IdeaToVideo imports the combined `.json`.

- Current version: `schema_version: "1.0"`
- Built by: `Outline.videoBrief()` in `public/outline.js`
- Downloads on the result screen: one combined `.json`, one combined `.md`, and one `.md` per lesson

## Versioning

`schema_version` is a string, `major.minor`.

- Minor bump: fields were added. An importer written for 1.0 keeps working.
- Major bump: a field was renamed, removed or changed meaning. An importer must check the major number and refuse what it does not know.

## Combined JSON

```json
{
  "schema_version": "1.0",
  "type": "video-course-content-brief",
  "generated_at": "2026-10-10T19:40:00.000Z",
  "source": "minicourse-as-a-lead-magnet",
  "course": {
    "title": "Sourdough in a Weekend",
    "slug": "sourdough-in-a-weekend",
    "bold_promise": "Bake your first real sourdough loaf in one weekend.",
    "ideal_client": "Home cooks who tried once and got a flat loaf.",
    "lesson_count": 4
  },
  "lessons": [
    {
      "id": "m1-l1",
      "playlist_position": 1,
      "module_position": 1,
      "module_title": "Wake up your starter",
      "lesson_position": 1,
      "title": "What a ready starter looks like",
      "keyword": "sourdough starter ready",
      "hook": "Your loaf was flat for one reason.",
      "teach": { "minutes": 4, "points": ["The float test", "The three signs"] },
      "do": { "minutes": 4, "exercise": "Feed your starter and mark the jar." },
      "review": { "minutes": 2, "check": "Did it double within 6 hours?" },
      "cta": "Watch the next lesson to mix your dough.",
      "youtube": { "title": "Is Your Sourdough Starter Ready? 3 Signs", "description": "..." }
    }
  ]
}
```

## Fields

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | See Versioning. |
| `type` | string | Always `video-course-content-brief`. Check it before importing. |
| `generated_at` | string | ISO 8601, UTC. |
| `source` | string | Always `minicourse-as-a-lead-magnet`. |
| `course.title` | string | Course name. |
| `course.slug` | string | Lowercase, hyphens, max 60 characters. Safe for file and folder names. |
| `course.bold_promise` | string | One sentence. |
| `course.ideal_client` | string | Who the course is for. |
| `course.lesson_count` | integer | Equals `lessons.length`. |
| `lessons[].id` | string | `m{module}-l{lesson}`. Unique and stable inside one brief. |
| `lessons[].playlist_position` | integer | 1-based, across the whole course. This is the video order. |
| `lessons[].module_position` | integer | 1-based. |
| `lessons[].module_title` | string | |
| `lessons[].lesson_position` | integer | 1-based inside the module. |
| `lessons[].title` | string | Lesson title as shown in the course. |
| `lessons[].keyword` | string | Main search phrase for the video. |
| `lessons[].hook` | string | First sentence of the video. |
| `lessons[].teach.minutes` | integer | |
| `lessons[].teach.points` | string[] | What the teacher explains, in order. |
| `lessons[].do.minutes` | integer | |
| `lessons[].do.exercise` | string | What the student does. |
| `lessons[].review.minutes` | integer | |
| `lessons[].review.check` | string | How the student checks the result. |
| `lessons[].cta` | string | Closing line of the video. |
| `lessons[].youtube.title` | string | Max 100 characters. |
| `lessons[].youtube.description` | string | May contain line breaks. |

Every field is always present. A missing value is an empty string, an empty array or `0`, never `null`.

## Markdown

The per-lesson `.md` holds the same content for a human: title, course, module, playlist position, keyword, YouTube title, then Hook, Teach, Do, Review and CTA sections. It is for reading, not for import.
