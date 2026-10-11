# Course Content Structure

One JSON file that holds a whole course as planned on the Minicourse page. It is the hand-off between three tools:

- **Minicourse as a Lead Magnet** writes it, and can open it again later.
- **IdeaToVideo** reads it and makes one prefilled video project per lesson.
- **PDT** can read it, so a Publishing Pack starts from each lesson's title, keyword and description.

No tool uploads video. Upload to YouTube stays manual.

- Current version: `schema_version: "1.1"`. This format is frozen: see Versioning.
- Built by: `Outline.contentStructure()` in `public/outline.js`
- Read back by: `Outline.fromContentStructure()` in the same file
- Example: `schema/example-course-content-structure.json` (written by the real code)
- On the page: result screen, "Course Content Structure": "Copy for IdeaToVideo" and "Download the file". The first screen has "Open a Course Content Structure".
- File name: `<course-slug>-course-content-structure.json`

## Versioning

`schema_version` is a string, `major.minor`.

- Minor bump: fields were added. A reader written for 1.1 keeps working and ignores what it does not know.
- Major bump: a field was renamed, removed or changed meaning. A reader must check the major number and refuse what it does not know, in plain words.

1.0 was the older "Video Course Content Brief" (`type: "video-course-content-brief"`), which is still offered as its own download. 1.1 has the same `course` and `lessons`, a new `type`, and adds `playlist` and `outline`.

## Top level

| Field | Type | Notes |
|---|---|---|
| `schema_version` | string | `"1.1"` |
| `type` | string | Always `course-content-structure`. Check it before reading anything else. |
| `generated_at` | string | ISO 8601, UTC. |
| `source` | string | Always `minicourse-as-a-lead-magnet`. |
| `course` | object | See below. |
| `playlist` | object or null | `{ "id", "url" }` of the YouTube playlist made for this course, or `null` if none was made yet. |
| `lessons` | array | Every lesson of the course, flat, in playlist order. This is what IdeaToVideo and PDT read. |
| `outline` | object | The full outline in the format of `schema/outline.schema.json`. Only the Minicourse page needs it, to open the course again. Other tools should ignore it. |

## course

| Field | Type | Notes |
|---|---|---|
| `title` | string | Course name. |
| `slug` | string | Lowercase, hyphens, max 60 characters. Safe for file and folder names. Use `slug` plus a lesson `id` as the stable key of a lesson. |
| `bold_promise` | string | One sentence. |
| `ideal_client` | string | Who the course is for. |
| `lesson_count` | integer | Equals `lessons.length`. |

## lessons[]

| Field | Type | Notes |
|---|---|---|
| `id` | string | `m{module}-l{lesson}`, for example `m1-l2`. Stable inside one course. |
| `playlist_position` | integer | 1-based, across the whole course. This is the video order. |
| `module_position` | integer | 1-based. |
| `module_title` | string | |
| `lesson_position` | integer | 1-based inside the module. |
| `title` | string | Lesson title as shown in the course. |
| `keyword` | string | Main search phrase for the video. |
| `hook` | string | First sentence of the video. |
| `teach.minutes` | integer | |
| `teach.points` | string[] | What the teacher explains, in order. |
| `do.minutes` | integer | |
| `do.exercise` | string | What the student does. |
| `review.minutes` | integer | |
| `review.check` | string | How the student checks the result. |
| `cta` | string | Closing line of the video. |
| `youtube.title` | string | Max 100 characters. |
| `youtube.description` | string | May contain line breaks. |

Every field is always present. A missing value is an empty string, an empty array or `0`, never `null`. The one exception is `playlist`, which is `null` until a playlist exists.

## Rules for readers

1. Check `type` and the major `schema_version` first. Refuse anything else in plain words.
2. Ignore fields you do not know.
3. Do not change the file. If you keep it, keep it as it came, so it can go back to the Minicourse page.
4. Treat `course.slug` plus `lessons[].id` as the key of a lesson. On a second import of the same course, update, do not duplicate.
5. The same content can arrive as a file or as pasted text (the "Copy for IdeaToVideo" button copies the exact file content).

## Not in this version

Ids of the course created on Whop, GoHighLevel or Mini Course Generator are not in the file. They would only be needed to put the finished videos into the course lessons automatically, and that will not be built. Putting a video into a lesson stays manual.
