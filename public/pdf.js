/*
 * "My Course Blueprint" PDF, built in the browser with jsPDF.
 * Same approach as the Freedom Calculator: green header band, soft cards, CTA on the last page.
 */
function buildBlueprintPdf(outline, name, programUrl) {
  var doc = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
  var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  var M = 48, CW = W - M * 2, BOTTOM = H - 56;
  var c = outline.course, k = Outline.counts(outline);
  var y = 0;

  /* The built-in PDF font covers Western European letters only. Anything else is reduced to its base letter. */
  function safe(t) {
    return String(t == null ? "" : t)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, ", ").replace(/…/g, "...").replace(/ /g, " ")
      .replace(/[^\x09\x0A\x20-\x7E¡-ÿ]/g, function (ch) {
        var base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        return /^[\x20-\x7E]+$/.test(base) ? base : "";
      });
  }
  function ink() { doc.setTextColor(18, 26, 22); }
  function muted() { doc.setTextColor(85, 99, 92); }
  function white() { doc.setTextColor(255, 255, 255); }
  function green() { doc.setTextColor(16, 163, 75); }
  function room(h) { if (y + h > BOTTOM) { doc.addPage(); y = 56; } }

  /* Wrapped text that flows over pages. Returns nothing, moves y. */
  function para(text, o) {
    o = o || {};
    var size = o.size || 10.5, lh = size * 1.42, x = M + (o.indent || 0), w = CW - (o.indent || 0);
    doc.setFont("helvetica", o.style || "normal"); doc.setFontSize(size);
    var lines = doc.splitTextToSize(safe(text), w);
    lines.forEach(function (line) {
      room(lh);
      (o.color || ink)();
      doc.setFont("helvetica", o.style || "normal"); doc.setFontSize(size);
      doc.text(line, x, y + size);
      y += lh;
    });
    y += o.gap == null ? 4 : o.gap;
  }
  function label(t) { para(t.toUpperCase(), { size:8.5, style:"bold", color:green, gap:1 }); }
  function pair(l, t) { if (!t) return; label(l); para(t, { gap:8 }); }
  function bullets(items, indent) {
    items.forEach(function (it) {
      var size = 10.5, lh = size * 1.42, x = M + (indent || 0);
      doc.setFont("helvetica", "normal"); doc.setFontSize(size);
      var lines = doc.splitTextToSize(safe(it), CW - (indent || 0) - 12);
      lines.forEach(function (line, i) {
        room(lh); ink();
        doc.setFont("helvetica", "normal"); doc.setFontSize(size);
        if (i === 0) { doc.setFillColor(23, 192, 91); doc.circle(x + 3, y + size - 3.5, 1.8, "F"); }
        doc.text(line, x + 12, y + size);
        y += lh;
      });
    });
    y += 4;
  }

  /* ---------- header band ---------- */
  doc.setFillColor(23, 192, 91); doc.rect(0, 0, W, 132, "F");
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
  doc.text("MY COURSE BLUEPRINT", M, 42, { charSpace:1 });
  doc.setFontSize(23);
  var titleLines = doc.splitTextToSize(safe(c.title), CW).slice(0, 2);
  doc.text(titleLines, M, 72);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11.5);
  var by = titleLines.length > 1 ? 118 : 104;
  doc.text(safe(name ? "Prepared for " + name : "Prepared for you"), M, by);
  doc.text(new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" }), W - M, by, { align:"right" });
  y = 154;

  /* ---------- bold promise card ---------- */
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  var pl = doc.splitTextToSize(safe(c.bold_promise), CW - 36);
  var ph = 38 + pl.length * 19;
  doc.setFillColor(232, 249, 239); doc.roundedRect(M, y, CW, ph, 10, 10, "F");
  green(); doc.setFontSize(8.5); doc.text("BOLD PROMISE", M + 18, y + 22, { charSpace:0.8 });
  ink(); doc.setFontSize(14); doc.text(pl, M + 18, y + 43);
  y += ph + 18;

  pair("Ideal client", c.ideal_client);
  pair("Program format", c.format);
  pair("Who delivers", c.delivered_by);
  pair("Number and duration of sessions",
    k.lessons + " lessons in " + k.modules + " modules" + (c.sessions.duration_minutes ? ", about " + c.sessions.duration_minutes + " minutes each" : ""));

  /* ---------- unique approach ---------- */
  y += 6; room(60);
  para("Unique approach: " + c.unique_approach.name, { size:14, style:"bold", gap:6 });
  para(c.unique_approach.summary, { gap:8 });
  pair("How to visualize it", c.unique_approach.visual);
  pair("Why it works", c.unique_approach.rationale);

  /* ---------- process steps ---------- */
  y += 6; room(60);
  para("Process steps", { size:14, style:"bold", gap:6 });
  outline.modules.forEach(function (m) {
    room(32);
    doc.setFillColor(23, 192, 91); doc.circle(M + 9, y + 9, 9, "F");
    white(); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(String(m.position), M + 9, y + 12.5, { align:"center" });
    var sy = y;
    y = sy - 1; para(m.title, { size:11.5, style:"bold", indent:28, gap:0 });
    if (m.outcome) para(m.outcome, { size:10, color:muted, indent:28, gap:0 });
    y = Math.max(y, sy + 22) + 6;
  });

  /* ---------- outline per session ---------- */
  outline.modules.forEach(function (m) {
    doc.addPage(); y = 56;
    green(); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text("MODULE " + m.position, M, y, { charSpace:0.8 });
    y += 8;
    para(m.title, { size:18, style:"bold", gap:4 });
    if (m.outcome) para(m.outcome, { color:muted, gap:10 });

    m.lessons.forEach(function (l) {
      room(96);
      doc.setDrawColor(220, 227, 223); doc.setLineWidth(0.75); doc.line(M, y, W - M, y);
      y += 12;
      para("Lesson " + m.position + "." + l.position + ": " + l.title, { size:12.5, style:"bold", gap:2 });
      para(Outline.lessonMinutes(l) + " minutes" + (l.keyword ? "   Keyword: " + l.keyword : ""), { size:9.5, color:muted, gap:7 });
      pair("Relevance", l.relevance);
      label("Teach, " + l.teach.minutes + " min"); bullets(l.teach.points);
      pair("Do, " + l["do"].minutes + " min", l["do"].exercise);
      pair("Review, " + l.review.minutes + " min", l.review.check);
      pair("Rationale", l.rationale);
      if (l.resources.length) {
        label("Resources and handouts");
        bullets(l.resources.map(function (r) { return r.title + " (" + r.type + ")" + (r.description ? ": " + r.description : ""); }));
      }
      y += 6;
    });
  });

  /* ---------- last page: CTA ---------- */
  doc.addPage(); y = 56;
  para("Your next step", { size:18, style:"bold", gap:8 });
  if (c.cta) { label("What your students do after the course"); para(c.cta, { gap:14 }); }
  para("You have the outline. The fastest way to get it recorded, launched and bringing in leads is to do it with a group.", { gap:16 });
  room(84);
  doc.setFillColor(23, 192, 91); doc.roundedRect(M, y, CW, 74, 10, 10, "F");
  white(); doc.setFont("helvetica", "bold"); doc.setFontSize(12.5);
  doc.text("Next step: build and launch this course in my 6-pillar cohort program.", M + 18, y + 30);
  doc.setFontSize(11);
  doc.textWithLink(safe(programUrl), M + 18, y + 52, { url:programUrl });
  doc.link(M, y, CW, 74, { url:programUrl });

  /* page numbers */
  var pages = doc.getNumberOfPages();
  for (var i = 1; i <= pages; i++) {
    doc.setPage(i); muted(); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(safe(c.title).slice(0, 70), M, H - 30);
    doc.text(i + " / " + pages, W - M, H - 30, { align:"right" });
  }
  return doc;
}
