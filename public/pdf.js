/*
 * "My Course Blueprint" PDF, built in the browser with jsPDF, in the brand design.
 * Colours come from the brand tokens on :root, so the PDF follows the same palette as the page.
 * Open Sans is embedded from /fonts. If it cannot be loaded, the PDF falls back to the built-in Helvetica.
 */
var PDF_FONT_FILES = { normal:"/fonts/OpenSans-400.ttf", bold:"/fonts/OpenSans-700.ttf", black:"/fonts/OpenSans-800.ttf" };
var pdfFontsPromise = null;

function loadPdfFonts() {
  if (pdfFontsPromise) return pdfFontsPromise;
  function one(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("font");
      return res.arrayBuffer();
    }).then(function (buf) {
      var bytes = new Uint8Array(buf), bin = "", CH = 0x8000;
      for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
      return btoa(bin);
    });
  }
  var all = Promise.all([one(PDF_FONT_FILES.normal), one(PDF_FONT_FILES.bold), one(PDF_FONT_FILES.black)])
    .then(function (a) { return { normal:a[0], bold:a[1], black:a[2] }; })
    .catch(function () { return null; });
  var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 6000); });
  pdfFontsPromise = Promise.race([all, timeout]);
  return pdfFontsPromise;
}

function buildBlueprintPdf(outline, name, programUrl, fonts) {
  var doc = new window.jspdf.jsPDF({ unit:"pt", format:"a4" });
  var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  var M = 48, CW = W - M * 2, BOTTOM = H - 56;
  var c = outline.course, k = Outline.counts(outline);
  var y = 0;

  var FAM = "helvetica", W_BLACK = "bold";
  if (fonts) {
    doc.addFileToVFS("OpenSans-400.ttf", fonts.normal); doc.addFont("OpenSans-400.ttf", "OpenSans", "normal");
    doc.addFileToVFS("OpenSans-700.ttf", fonts.bold);   doc.addFont("OpenSans-700.ttf", "OpenSans", "bold");
    doc.addFileToVFS("OpenSans-800.ttf", fonts.black);  doc.addFont("OpenSans-800.ttf", "OpenSans", "black");
    FAM = "OpenSans"; W_BLACK = "black";
  }

  function tok(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace("#", "") || fallback;
    if (v.length === 3) v = v.replace(/(.)/g, "$1$1");
    var n = parseInt(v, 16);
    if (isNaN(n)) n = parseInt(fallback, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  var C = {
    ink:tok("--ink", "0F172A"), label:tok("--label", "475569"), muted:tok("--muted-text", "475569"), border:tok("--border-c", "E2E8F0"),
    alt:tok("--surface-alt-c", "EEF2F6"), primary:tok("--primary-600", "0E7490"), tint:tok("--primary-50", "E6F4F7"),
    tintText:tok("--primary-800", "0B5F76"), live:tok("--live-500", "0E7490"), white:[255, 255, 255]
  };
  function color(x) { doc.setTextColor(x[0], x[1], x[2]); }
  function fill(x) { doc.setFillColor(x[0], x[1], x[2]); }
  function font(w, size) { doc.setFont(FAM, w === "black" ? W_BLACK : w); doc.setFontSize(size); }

  /* Typographic characters are made plain everywhere. With the Helvetica fallback, letters outside
     Western Europe are also reduced to their base letter, because that font does not have them. */
  function safe(t) {
    var s = String(t == null ? "" : t)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, ", ").replace(/…/g, "...").replace(/ /g, " ");
    if (fonts) return s;
    return s.replace(/[^\x09\x0A\x20-\x7E¡-ÿ]/g, function (ch) {
      var base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7E]+$/.test(base) ? base : "";
    });
  }

  /* 2pt hairline across the top of a page: fuchsia to blue-green */
  function hairline() {
    var STEPS = 80;
    for (var i = 0; i < STEPS; i++) {
      var t = i / (STEPS - 1);
      doc.setFillColor(
        Math.round(C.primary[0] + (C.live[0] - C.primary[0]) * t),
        Math.round(C.primary[1] + (C.live[1] - C.primary[1]) * t),
        Math.round(C.primary[2] + (C.live[2] - C.primary[2]) * t));
      doc.rect(W / STEPS * i, 0, W / STEPS + 0.5, 3, "F");
    }
  }
  function newPage() { doc.addPage(); hairline(); y = 60; }
  function room(h) { if (y + h > BOTTOM) newPage(); }

  /* Wrapped text that flows over pages. Moves y. */
  function para(text, o) {
    o = o || {};
    var size = o.size || 10.5, lh = size * 1.45, x = M + (o.indent || 0), w = CW - (o.indent || 0);
    font(o.style || "normal", size);
    var lines = doc.splitTextToSize(safe(text), w);
    lines.forEach(function (line) {
      room(lh);
      color(o.color || C.ink);
      font(o.style || "normal", size);
      doc.text(line, x, y + size);
      y += lh;
    });
    y += o.gap == null ? 4 : o.gap;
  }
  function label(t) {
    room(16);
    color(C.label); font("bold", 8);
    doc.text(safe(t).toUpperCase(), M, y + 8, { charSpace:0.9 });
    y += 15;
  }
  function pair(l, t) { if (!t) return; label(l); para(t, { gap:9 }); }
  function bullets(items, indent) {
    items.forEach(function (it) {
      var size = 10.5, lh = size * 1.45, x = M + (indent || 0);
      font("normal", size);
      var lines = doc.splitTextToSize(safe(it), CW - (indent || 0) - 12);
      lines.forEach(function (line, i) {
        room(lh);
        if (i === 0) { fill(C.live); doc.circle(x + 3, y + size - 3.5, 1.9, "F"); }
        color(C.ink); font("normal", size);
        doc.text(line, x + 12, y + size);
        y += lh;
      });
    });
    y += 5;
  }

  /* ---------- page 1 header ---------- */
  hairline();
  color(C.label); font("bold", 9);
  doc.text("MY COURSE BLUEPRINT", M, 46, { charSpace:1.1 });
  color(C.muted); font("normal", 9.5);
  doc.text(new Date().toLocaleDateString("en-US", { year:"numeric", month:"long", day:"numeric" }), W - M, 46, { align:"right" });
  color(C.ink); font("black", 25);
  var titleLines = doc.splitTextToSize(safe(c.title), CW).slice(0, 3);
  doc.text(titleLines, M, 82, { lineHeightFactor:1.15 });
  y = 82 + (titleLines.length - 1) * 29 + 14;
  color(C.muted); font("normal", 11);
  doc.text(safe(name ? "Prepared for " + name : "Prepared for you"), M, y + 6);
  y += 26;

  /* ---------- bold promise card ---------- */
  font("bold", 14);
  var pl = doc.splitTextToSize(safe(c.bold_promise), CW - 36);
  var ph = 40 + pl.length * 19;
  fill(C.tint); doc.roundedRect(M, y, CW, ph, 12, 12, "F");
  color(C.tintText); font("bold", 8);
  doc.text("BOLD PROMISE", M + 18, y + 23, { charSpace:0.9 });
  color(C.ink); font("bold", 14);
  doc.text(pl, M + 18, y + 45, { lineHeightFactor:1.3 });
  y += ph + 20;

  pair("Ideal client", c.ideal_client);
  pair("Program format", c.format);
  pair("Who delivers", c.delivered_by);
  pair("Number and duration of sessions",
    k.lessons + " lessons in " + k.modules + " modules" + (c.sessions.duration_minutes ? ", about " + c.sessions.duration_minutes + " minutes each" : ""));

  /* ---------- unique approach ---------- */
  y += 6; room(60);
  para("Unique approach: " + c.unique_approach.name, { size:14, style:"bold", gap:6 });
  para(c.unique_approach.summary, { gap:9 });
  pair("How to visualize it", c.unique_approach.visual);
  pair("Why it works", c.unique_approach.rationale);

  /* ---------- process steps ---------- */
  y += 6; room(60);
  para("Process steps", { size:14, style:"bold", gap:8 });
  outline.modules.forEach(function (m) {
    room(34);
    fill(C.tint); doc.circle(M + 10, y + 10, 10, "F");
    color(C.tintText); font("bold", 10);
    doc.text(String(m.position), M + 10, y + 13.5, { align:"center" });
    var sy = y;
    y = sy - 1; para(m.title, { size:11.5, style:"bold", indent:30, gap:0 });
    if (m.outcome) para(m.outcome, { size:10, color:C.muted, indent:30, gap:0 });
    y = Math.max(y, sy + 22) + 7;
  });

  /* ---------- outline per session ---------- */
  outline.modules.forEach(function (m) {
    newPage();
    color(C.label); font("bold", 8.5);
    doc.text("MODULE " + m.position, M, y, { charSpace:1 });
    y += 9;
    para(m.title, { size:19, style:"black", gap:4 });
    if (m.outcome) para(m.outcome, { color:C.muted, gap:12 });

    m.lessons.forEach(function (l) {
      room(100);
      doc.setDrawColor(C.border[0], C.border[1], C.border[2]); doc.setLineWidth(0.75); doc.line(M, y, W - M, y);
      y += 13;
      para("Lesson " + m.position + "." + l.position + ": " + l.title, { size:12.5, style:"bold", gap:2 });
      para(Outline.lessonMinutes(l) + " minutes" + (l.keyword ? "   Keyword: " + l.keyword : ""), { size:9.5, color:C.muted, gap:8 });
      pair("Relevance", l.relevance);
      label("Teach, " + l.teach.minutes + " min"); bullets(l.teach.points);
      pair("Do, " + l["do"].minutes + " min", l["do"].exercise);
      pair("Review, " + l.review.minutes + " min", l.review.check);
      pair("Rationale", l.rationale);
      if (l.resources.length) {
        label("Resources and handouts");
        bullets(l.resources.map(function (r) { return r.title + " (" + r.type + ")" + (r.description ? ": " + r.description : ""); }));
      }
      y += 7;
    });
  });

  /* ---------- last page: CTA ---------- */
  newPage();
  para("Your next step", { size:19, style:"black", gap:10 });
  if (c.cta) { label("What your students do after the course"); para(c.cta, { gap:14 }); }
  para("You have the outline. The fastest way to get it recorded, launched and bringing in leads is to do it with a group.", { gap:18 });
  room(88);
  fill(C.primary); doc.roundedRect(M, y, CW, 78, 12, 12, "F");
  color(C.white); font("bold", 12.5);
  doc.text("Next step: build and launch this course in my 6-pillar cohort program.", M + 18, y + 32);
  font("normal", 10.5);
  doc.textWithLink(safe(programUrl), M + 18, y + 54, { url:programUrl });
  doc.link(M, y, CW, 78, { url:programUrl });

  /* page footers */
  var pages = doc.getNumberOfPages();
  for (var i = 1; i <= pages; i++) {
    doc.setPage(i); color(C.muted); font("normal", 9);
    doc.text(safe(c.title).slice(0, 70), M, H - 30);
    doc.text(i + " / " + pages, W - M, H - 30, { align:"right" });
  }
  return doc;
}
