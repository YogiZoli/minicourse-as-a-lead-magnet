/*
 * Outline logic: pure functions, no DOM. Runs in the browser (window.Outline)
 * and in Node (require), so the push tests use exactly what the page uses.
 * The outline format is defined in /schema/outline.schema.json.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Outline = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var SCHEMA_VERSION = "1.0";

  function s(v) { return v == null ? "" : String(v).trim(); }
  function n(v, d) { var x = parseFloat(v); return isFinite(x) && x >= 0 ? Math.round(x) : d; }
  function list(v) {
    if (Array.isArray(v)) return v.map(s).filter(Boolean);
    var t = s(v);
    return t ? t.split(/\r?\n|;\s+/).map(function (x) { return x.replace(/^[-*\d.)\s]+/, "").trim(); }).filter(Boolean) : [];
  }

  /* Pull the JSON object out of whatever an AI app returned (code fences, chatter before or after). */
  function extractJson(text) {
    var t = s(text).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("No JSON found. Copy the whole answer from your AI app, from the first { to the last }.");
    var raw = t.slice(a, b + 1);
    try { return JSON.parse(raw); }
    catch (e) {
      try { return JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")); }
      catch (e2) { throw new Error("The pasted text is not complete JSON. It may have been cut off. Ask your AI app to send the full JSON again."); }
    }
  }

  /* Returns a clean outline with every field present and positions renumbered, or throws in plain words. */
  function normalize(input) {
    var o = input && typeof input === "object" ? input : {};
    /* Some AI apps wrap the outline in an extra layer or a one-item list. */
    if (Array.isArray(o)) o = o[0] && typeof o[0] === "object" ? o[0] : {};
    if (!o.course && o.outline && typeof o.outline === "object") o = o.outline;
    var c = o.course && typeof o.course === "object" ? o.course : {};
    var ua = c.unique_approach && typeof c.unique_approach === "object" ? c.unique_approach : {};
    var se = c.sessions && typeof c.sessions === "object" ? c.sessions : {};
    var isObj = function (x) { return x && typeof x === "object" && !Array.isArray(x); };
    /* Anything that is not a real module or lesson is skipped, and a module without lessons is dropped. */
    var mods = (Array.isArray(o.modules) ? o.modules : []).filter(function (m) {
      return isObj(m) && Array.isArray(m.lessons) && m.lessons.filter(isObj).length > 0;
    });
    if (!s(c.title)) throw new Error("The outline has no course title.");
    if (!mods.length) throw new Error("The outline has no modules with lessons. Ask your AI app to send the full JSON again.");

    var pos = 0;
    var modules = mods.map(function (m, i) {
      var lessons = m.lessons.filter(isObj);
      return {
        position: i + 1,
        title: s(m.title).slice(0, 200) || "Module " + (i + 1),
        outcome: s(m.outcome),
        lessons: lessons.map(function (l, j) {
          pos++;
          var te = l.teach && typeof l.teach === "object" ? l.teach : {};
          var d = l["do"] && typeof l["do"] === "object" ? l["do"] : {};
          var rv = l.review && typeof l.review === "object" ? l.review : {};
          var yt = l.youtube && typeof l.youtube === "object" ? l.youtube : {};
          var title = s(l.title).slice(0, 200) || "Lesson " + (j + 1);
          return {
            position: j + 1,
            playlist_position: pos,
            title: title,
            relevance: s(l.relevance),
            keyword: s(l.keyword),
            hook: s(l.hook),
            teach: { minutes: n(te.minutes, 0), points: list(te.points) },
            "do": { minutes: n(d.minutes, 0), exercise: s(d.exercise) },
            review: { minutes: n(rv.minutes, 0), check: s(rv.check) },
            rationale: s(l.rationale),
            resources: (Array.isArray(l.resources) ? l.resources : []).map(function (r) {
              if (typeof r === "string") return { title: s(r), type: "handout", description: "" };
              return { title: s(r && r.title), type: s(r && r.type) || "handout", description: s(r && r.description) };
            }).filter(function (r) { return r.title; }),
            cta: s(l.cta),
            youtube: { title: (s(yt.title) || title).slice(0, 100), description: s(yt.description) }
          };
        })
      };
    });
    if (!pos) throw new Error("The outline has modules but no lessons.");

    return {
      schema_version: SCHEMA_VERSION,
      course: {
        title: s(c.title).slice(0, 200),
        format: s(c.format),
        bold_promise: s(c.bold_promise),
        ideal_client: s(c.ideal_client),
        delivered_by: s(c.delivered_by),
        unique_approach: { name: s(ua.name), summary: s(ua.summary), visual: s(ua.visual), rationale: s(ua.rationale) },
        sessions: { count: pos, duration_minutes: n(se.duration_minutes, 0) },
        cta: s(c.cta)
      },
      modules: modules
    };
  }

  function lessons(o) {
    var out = [];
    o.modules.forEach(function (m) { m.lessons.forEach(function (l) { out.push({ module: m, lesson: l }); }); });
    return out;
  }
  function counts(o) { return { modules: o.modules.length, lessons: lessons(o).length }; }
  function lessonMinutes(l) { return l.teach.minutes + l["do"].minutes + l.review.minutes; }

  /* ---------- markdown ---------- */

  function tdr(l) {
    var a = [];
    a.push("### Teach (" + l.teach.minutes + " min)");
    l.teach.points.forEach(function (p) { a.push("- " + p); });
    a.push("", "### Do (" + l["do"].minutes + " min)", l["do"].exercise || "", "", "### Review (" + l.review.minutes + " min)", l.review.check || "");
    return a;
  }

  /* What a student sees inside the course platform for one lesson. */
  function lessonContentMd(l) {
    var a = [];
    if (l.relevance) a.push("**Why this matters:** " + l.relevance, "");
    a = a.concat(tdr(l));
    if (l.resources.length) {
      a.push("", "### Resources");
      l.resources.forEach(function (r) { a.push("- " + r.title + (r.description ? ": " + r.description : "")); });
    }
    return a.join("\n").trim();
  }

  function blueprintMd(o) {
    var c = o.course, k = counts(o), a = [];
    a.push("# " + c.title, "", "My Course Blueprint", "");
    a.push("## The program", "");
    a.push("- **Format:** " + c.format);
    a.push("- **Bold promise:** " + c.bold_promise);
    a.push("- **Ideal client:** " + c.ideal_client);
    a.push("- **Who delivers:** " + c.delivered_by);
    a.push("- **Sessions:** " + k.lessons + " lessons in " + k.modules + " modules" + (c.sessions.duration_minutes ? ", about " + c.sessions.duration_minutes + " minutes each" : ""));
    a.push("", "## Unique approach: " + c.unique_approach.name, "", c.unique_approach.summary, "");
    if (c.unique_approach.visual) a.push("**How to visualize it:** " + c.unique_approach.visual, "");
    if (c.unique_approach.rationale) a.push("**Why it works:** " + c.unique_approach.rationale, "");
    a.push("## Process steps", "");
    o.modules.forEach(function (m) { a.push(m.position + ". **" + m.title + "**" + (m.outcome ? ": " + m.outcome : "")); });
    o.modules.forEach(function (m) {
      a.push("", "## Module " + m.position + ": " + m.title, "");
      if (m.outcome) a.push(m.outcome, "");
      m.lessons.forEach(function (l) {
        a.push("### Lesson " + m.position + "." + l.position + ": " + l.title + " (" + lessonMinutes(l) + " min)", "");
        if (l.relevance) a.push("**Relevance:** " + l.relevance, "");
        a.push("**Teach (" + l.teach.minutes + " min)**");
        l.teach.points.forEach(function (p) { a.push("- " + p); });
        a.push("", "**Do (" + l["do"].minutes + " min):** " + l["do"].exercise, "");
        a.push("**Review (" + l.review.minutes + " min):** " + l.review.check, "");
        if (l.rationale) a.push("**Rationale:** " + l.rationale, "");
        if (l.resources.length) {
          a.push("**Resources and handouts**");
          l.resources.forEach(function (r) { a.push("- " + r.title + " (" + r.type + ")" + (r.description ? ": " + r.description : "")); });
          a.push("");
        }
      });
    });
    if (c.cta) a.push("## Next step for the student", "", c.cta, "");
    return a.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ---------- Video Course Content Brief (see /schema/video-course-content-brief.md) ---------- */

  function slug(t) { return s(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "course"; }

  function videoBrief(o) {
    return {
      schema_version: SCHEMA_VERSION,
      type: "video-course-content-brief",
      generated_at: new Date().toISOString(),
      source: "minicourse-as-a-lead-magnet",
      course: {
        title: o.course.title, slug: slug(o.course.title), bold_promise: o.course.bold_promise,
        ideal_client: o.course.ideal_client, lesson_count: counts(o).lessons
      },
      lessons: lessons(o).map(function (x) {
        var l = x.lesson, m = x.module;
        return {
          id: "m" + m.position + "-l" + l.position,
          playlist_position: l.playlist_position,
          module_position: m.position, module_title: m.title, lesson_position: l.position,
          title: l.title, keyword: l.keyword, hook: l.hook,
          teach: { minutes: l.teach.minutes, points: l.teach.points.slice() },
          "do": { minutes: l["do"].minutes, exercise: l["do"].exercise },
          review: { minutes: l.review.minutes, check: l.review.check },
          cta: l.cta,
          youtube: { title: l.youtube.title, description: l.youtube.description }
        };
      })
    };
  }

  function videoBriefLessonMd(o, x) {
    var l = x.lesson, m = x.module, a = [];
    a.push("# " + l.title, "");
    a.push("- **Course:** " + o.course.title);
    a.push("- **Module:** " + m.position + ". " + m.title);
    a.push("- **Playlist position:** " + l.playlist_position);
    a.push("- **Keyword:** " + l.keyword);
    a.push("- **YouTube title:** " + l.youtube.title);
    a.push("", "## Hook", "", l.hook, "");
    a = a.concat(tdr(l).map(function (line) { return line.replace(/^### /, "## "); }));
    a.push("", "## CTA", "", l.cta, "");
    return a.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function videoBriefMd(o) {
    return "# Video Course Content Brief: " + o.course.title + "\n\n" +
      lessons(o).map(function (x) { return videoBriefLessonMd(o, x).replace(/^# /, "## ").replace(/\n## /g, "\n### "); }).join("\n---\n\n");
  }

  /* ---------- CSV exports ---------- */

  function csv(rows) {
    return rows.map(function (r) {
      return r.map(function (v) { var t = String(v == null ? "" : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(",");
    }).join("\r\n") + "\r\n";
  }

  function youtubeCsv(o) {
    var rows = [["playlist_position", "module", "lesson", "youtube_title", "youtube_description", "keyword"]];
    lessons(o).forEach(function (x) {
      rows.push([x.lesson.playlist_position, x.module.title, x.lesson.title, x.lesson.youtube.title, x.lesson.youtube.description, x.lesson.keyword]);
    });
    return csv(rows);
  }

  function skoolCsv(o) {
    var rows = [["module_position", "module_title", "lesson_position", "lesson_title", "lesson_content"]];
    lessons(o).forEach(function (x) {
      rows.push([x.module.position, x.module.title, x.lesson.position, x.lesson.title, lessonContentMd(x.lesson)]);
    });
    return csv(rows);
  }

  function playlistDescription(o) {
    var c = o.course;
    return [c.bold_promise, "", "For: " + c.ideal_client, "", counts(o).lessons + " lessons, in order:"]
      .concat(lessons(o).map(function (x) { return x.lesson.playlist_position + ". " + x.lesson.youtube.title; }))
      .join("\n").slice(0, 4900);
  }

  /* ---------- the normalized course sent to the push proxy ---------- */

  function esc(t) { return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function inline(t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); }

  /* Covers only the markdown this file produces: headings, bullets, bold, paragraphs. */
  function mdToHtml(md) {
    var out = [], inList = false;
    function close() { if (inList) { out.push("</ul>"); inList = false; } }
    s(md).split("\n").forEach(function (line) {
      var h = /^(#{1,4})\s+(.*)$/.exec(line), li = /^-\s+(.*)$/.exec(line);
      if (li) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(li[1]) + "</li>"); return; }
      close();
      if (h) out.push("<h" + Math.min(4, h[1].length + 1) + ">" + inline(h[2]) + "</h" + Math.min(4, h[1].length + 1) + ">");
      else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
    });
    close();
    return out.join("");
  }

  function pushCourse(o) {
    var c = o.course;
    return {
      title: c.title,
      tagline: c.bold_promise.slice(0, 240),
      description: [c.bold_promise, c.ideal_client ? "For: " + c.ideal_client : ""].filter(Boolean).join("\n\n"),
      modules: o.modules.map(function (m) {
        return {
          title: m.title,
          lessons: m.lessons.map(function (l) {
            var md = lessonContentMd(l);
            return { title: l.title, content_md: md, content_html: mdToHtml(md) };
          })
        };
      })
    };
  }

  /* ---------- Mini Course Generator module spec (YAML, apiVersion mcg.io/v3) ---------- */

  /* Block-style YAML. Every string is written as a JSON string, which is a valid YAML double-quoted scalar. */
  function yaml(v, pad) {
    pad = pad || "";
    if (Array.isArray(v)) {
      if (!v.length) return " []";
      return v.map(function (item) {
        if (item && typeof item === "object") return "\n" + pad + "-" + yaml(item, pad + "  ").replace(/^\n\s*/, " ");
        return "\n" + pad + "- " + JSON.stringify(item);
      }).join("");
    }
    if (v && typeof v === "object") {
      return Object.keys(v).map(function (k) {
        var x = v[k];
        return "\n" + pad + k + ":" + (x && typeof x === "object" ? yaml(x, pad + "  ") : " " + (typeof x === "string" ? JSON.stringify(x) : String(x)));
      }).join("");
    }
    return " " + JSON.stringify(v);
  }

  function mcgLessonContent(l) {
    var boxes = [{
      header: "Teach, Do, Review",
      block: {
        type: "cards",
        items: [
          { title: "Teach, " + l.teach.minutes + " min", body: l.teach.points.map(function (p) { return "- " + p; }).join("\n") || "-" },
          { title: "Do, " + l["do"].minutes + " min", body: l["do"].exercise || "-" },
          { title: "Review, " + l.review.minutes + " min", body: l.review.check || "-" }
        ]
      }
    }];
    if (l.relevance) boxes[0].intro = "**Why this matters:** " + l.relevance;
    if (l.resources.length) {
      boxes.push({
        header: "Resources",
        block: { type: "cards", items: l.resources.map(function (r) { return { title: r.title, body: r.description || r.type || "-" }; }) }
      });
    }
    return boxes;
  }

  /* One MCG module for the whole minicourse: our modules become its sections. No image blocks, so no AI credits. */
  function mcgSpec(o) {
    return yaml({
      apiVersion: "mcg.io/v3",
      kind: "Module",
      metadata: { name: o.course.title },
      spec: {
        language: "en",
        sections: o.modules.map(function (m) {
          return {
            title: m.title,
            lessons: m.lessons.map(function (l) { return { title: l.title, type: "info", content: mcgLessonContent(l) }; })
          };
        })
      }
    }).replace(/^\n/, "") + "\n";
  }

  return {
    mcgSpec: mcgSpec,
    SCHEMA_VERSION: SCHEMA_VERSION,
    extractJson: extractJson, normalize: normalize, lessons: lessons, counts: counts, lessonMinutes: lessonMinutes,
    lessonContentMd: lessonContentMd, blueprintMd: blueprintMd,
    videoBrief: videoBrief, videoBriefMd: videoBriefMd, videoBriefLessonMd: videoBriefLessonMd,
    youtubeCsv: youtubeCsv, skoolCsv: skoolCsv, playlistDescription: playlistDescription,
    mdToHtml: mdToHtml, pushCourse: pushCourse, slug: slug
  };
});
