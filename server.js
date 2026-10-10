/*
 * minicourse-as-a-lead-magnet
 * One service: static frontend plus a thin stateless proxy.
 *
 * The proxy forwards the visitor's own credentials, per request, to Whop, GHL,
 * MCG and YouTube. Nothing is stored. No database. Request bodies, keys and
 * tokens are never logged: the only log line per request is method, path, status.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const SCHEMA_DIR = path.join(__dirname, "schema");
const MAX_BODY = 600 * 1024;

const WHOP = "https://api.whop.com/api/v1";
const GHL_IMPORT = "https://services.leadconnectorhq.com/courses/courses-exporter/public/import";
const MCG_MCP = "https://mcp.minicoursegenerator.com/mcp";
const MCG_AUTH = "https://gateway.minicoursegenerator.com";
const YT_PLAYLISTS = "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

/* ---------- small helpers ---------- */

function send(res, status, data, headers) {
  const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  res.writeHead(status, Object.assign({
    "Content-Type": typeof data === "string" || Buffer.isBuffer(data) ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  }, headers || {}));
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "That outline is too large to send.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch (e) { reject(new HttpError(400, "The request was not valid JSON.")); }
    });
    req.on("error", reject);
  });
}

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra || {}; }
}

function str(v, max) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return max ? s.slice(0, max) : s;
}

function need(v, label) {
  const s = str(v);
  if (!s) throw new HttpError(400, "Missing: " + label + ".");
  return s;
}

/* One outbound call. Returns status plus parsed body. Never throws on HTTP errors. */
async function call(url, opts) {
  let r;
  try {
    r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opts));
  } catch (e) {
    return { ok: false, status: 0, json: null, text: "" };
  }
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  return { ok: r.ok, status: r.status, json, text, headers: r.headers };
}

/* The platform's own words, trimmed, so the visitor sees what the platform said. */
function detail(r) {
  const j = r.json;
  let d = "";
  if (j) {
    const e = j.error;
    if (typeof j.message === "string") d = j.message;
    else if (Array.isArray(j.message)) d = j.message.join(" ");
    else if (e && typeof e === "object" && typeof e.message === "string") d = e.message;
    else if (typeof e === "string") d = e;
    else if (typeof j.error_description === "string") d = j.error_description;
  }
  return String(d || "").slice(0, 300);
}

/* Platform error in plain words. */
function plain(platform, r) {
  const d = detail(r);
  const tail = d ? " " + platform + " said: " + d : "";
  switch (r.status) {
    case 0: return "Could not reach " + platform + ". Check your connection and try again.";
    case 400: case 422: return platform + " did not accept the data." + tail;
    case 401: return platform + " did not accept that key or token. Check that you pasted all of it and that it has not been revoked." + tail;
    case 403: return "That key or token is valid but is not allowed to do this. Check its permissions." + tail;
    case 404: return platform + " could not find that account or item. Check the ID you entered." + tail;
    case 429: return platform + " is asking us to slow down. Wait a minute and try again.";
    default: return platform + " returned an error (" + r.status + ")." + tail;
  }
}

/* The normalized course every push route accepts. Built in the browser from the outline. */
function readCourse(body) {
  const c = body && body.course;
  if (!c || typeof c !== "object") throw new HttpError(400, "Missing: course.");
  const title = need(c.title, "course title").slice(0, 200);
  const modules = Array.isArray(c.modules) ? c.modules : [];
  if (!modules.length) throw new HttpError(400, "The course has no modules.");
  if (modules.length > 30) throw new HttpError(400, "Too many modules.");
  let lessonCount = 0;
  const clean = modules.map((m, i) => {
    const lessons = Array.isArray(m.lessons) ? m.lessons : [];
    lessonCount += lessons.length;
    return {
      title: str(m.title, 200) || "Module " + (i + 1),
      lessons: lessons.map((l, j) => ({
        title: str(l.title, 200) || "Lesson " + (j + 1),
        content_md: str(l.content_md, 20000),
        content_html: str(l.content_html, 30000)
      }))
    };
  });
  if (lessonCount > 120) throw new HttpError(400, "Too many lessons.");
  return { title, tagline: str(c.tagline, 240), description: str(c.description, 5000), modules: clean };
}

/* ---------- Whop ---------- */

function whopHeaders(key) {
  return { "Authorization": "Bearer " + key, "Content-Type": "application/json", "Accept": "application/json" };
}

/* Dry-run helper: proves the key works and finds where a course can live. */
async function whopCheck(body) {
  const key = need(body.apiKey, "Whop API key");
  const company = need(body.companyId, "Whop company ID");
  const r = await call(WHOP + "/experiences?first=100&account_id=" + encodeURIComponent(company), { headers: whopHeaders(key) });
  if (!r.ok) throw new HttpError(502, plain("Whop", r));
  const all = (r.json && r.json.data) || [];
  const experiences = all.map((e) => ({
    id: e.id, name: e.name, app: e.app && e.app.name ? e.app.name : "",
    isCourses: !!(e.app && /course/i.test(e.app.name || ""))
  }));
  return { ok: true, experiences };
}

async function whopPush(body) {
  const key = need(body.apiKey, "Whop API key");
  const experienceId = need(body.experienceId, "Whop experience");
  const course = readCourse(body);
  const headers = whopHeaders(key);
  const created = { courseId: "", chapters: 0, lessons: 0 };

  const c = await call(WHOP + "/courses", {
    method: "POST", headers,
    body: JSON.stringify({ experience_id: experienceId, title: course.title, tagline: course.tagline || null, visibility: "hidden" })
  });
  if (!c.ok) throw new HttpError(502, plain("Whop", c));
  created.courseId = c.json.id;

  /* Whop puts one placeholder chapter with one placeholder lesson into every new course.
     They are filled with the first module and lesson, so nothing empty is left behind. */
  const spare = Array.isArray(c.json.chapters) ? c.json.chapters.slice() : [];
  const send = (method, path, data) => call(WHOP + path, { method, headers, body: JSON.stringify(data) });

  for (const m of course.modules) {
    const reuse = spare.shift();
    const ch = reuse
      ? await send("PATCH", "/course_chapters/" + reuse.id, { title: m.title })
      : await send("POST", "/course_chapters", { course_id: created.courseId, title: m.title });
    if (!ch.ok) throw new HttpError(502, plain("Whop", ch) + " The course was created, but it stopped at a chapter.", { created });
    created.chapters++;
    const spareLessons = reuse && Array.isArray(reuse.lessons) ? reuse.lessons.slice() : [];
    for (const l of m.lessons) {
      const old = spareLessons.shift();
      const ls = old
        ? await send("PATCH", "/course_lessons/" + old.id, { lesson_type: "text", title: l.title, content: l.content_md })
        : await send("POST", "/course_lessons", { chapter_id: ch.json.id, lesson_type: "text", title: l.title, content: l.content_md });
      if (!ls.ok) throw new HttpError(502, plain("Whop", ls) + " The course was created, but it stopped at a lesson.", { created });
      created.lessons++;
    }
  }
  return { ok: true, created, link: "https://whop.com/experiences/" + encodeURIComponent(experienceId) + "/" };
}

/* ---------- GHL ---------- */

async function ghlPush(body) {
  const token = need(body.token, "Private Integration Token");
  const locationId = need(body.locationId, "locationId");
  const course = readCourse(body);
  const payload = {
    locationId,
    products: [{
      title: course.title,
      description: course.description || course.tagline,
      categories: course.modules.map((m) => ({
        title: m.title,
        visibility: "draft",
        posts: m.lessons.map((l) => ({
          title: l.title, visibility: "draft", contentType: "video", description: l.content_html
        }))
      }))
    }]
  };
  const r = await call(GHL_IMPORT, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Version": "2021-07-28", "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new HttpError(502, plain("GoHighLevel", r));
  const first = r.json && Array.isArray(r.json.processingCourses) ? r.json.processingCourses[0] : null;
  return {
    ok: true,
    message: (r.json && r.json.message) || "Import started.",
    note: (r.json && r.json.note) || "",
    courseId: first ? first.id : "",
    link: (first && first.url) || "https://app.gohighlevel.com/v2/location/" + encodeURIComponent(locationId) + "/memberships/courses/products"
  };
}

/* ---------- MCG (Mini Course Generator) ----------
 * MCG has no API key. Its only public surface is an MCP server behind OAuth,
 * with open client registration. The client is registered per visitor session,
 * its id and secret live in the visitor's browser tab, and are sent back here
 * only to swap the code for a token. Nothing is kept on this server.
 */

async function mcgRegister(body) {
  const redirect = need(body.redirectUri, "redirect URI");
  const r = await call(MCG_AUTH + "/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "minicourse-as-a-lead-magnet",
      redirect_uris: [redirect],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "mcp"
    })
  });
  if (!r.ok || !r.json || !r.json.client_id) throw new HttpError(502, plain("Mini Course Generator", r));
  return {
    ok: true, clientId: r.json.client_id, clientSecret: r.json.client_secret || "",
    authorizeUrl: MCG_AUTH + "/authorize"
  };
}

async function mcgToken(body) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: need(body.code, "authorization code"),
    redirect_uri: need(body.redirectUri, "redirect URI"),
    client_id: need(body.clientId, "client id"),
    code_verifier: need(body.codeVerifier, "code verifier"),
    resource: "https://mcp.minicoursegenerator.com/"
  });
  if (str(body.clientSecret)) form.set("client_secret", str(body.clientSecret));
  const r = await call(MCG_AUTH + "/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString()
  });
  if (!r.ok || !r.json || !r.json.access_token) throw new HttpError(502, plain("Mini Course Generator", r));
  return { ok: true, accessToken: r.json.access_token };
}

/* One MCP JSON-RPC call. The MCP server may answer as JSON or as an event stream. */
async function mcpCall(token, sessionId, method, params) {
  const headers = {
    "Authorization": "Bearer " + token, "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream", "Mcp-Protocol-Version": "2025-06-18"
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const isNote = method.indexOf("notifications/") === 0;
  const msg = { jsonrpc: "2.0", method };
  if (!isNote) msg.id = Date.now();
  if (params) msg.params = params;
  const r = await call(MCG_MCP, { method: "POST", headers, body: JSON.stringify(msg) });
  let json = r.json;
  if (!json && r.text) {
    const lines = r.text.split(/\r?\n/).filter((l) => l.indexOf("data:") === 0);
    for (const l of lines) {
      try { const j = JSON.parse(l.slice(5).trim()); if (j && (j.result || j.error)) json = j; } catch (e) { /* skip */ }
    }
  }
  return { ok: r.ok, status: r.status, json, text: r.text, session: r.headers ? r.headers.get("mcp-session-id") : null };
}

async function mcgSession(token) {
  const init = await mcpCall(token, null, "initialize", {
    protocolVersion: "2025-06-18", capabilities: {},
    clientInfo: { name: "minicourse-as-a-lead-magnet", version: "2.0.0" }
  });
  if (!init.ok) throw new HttpError(502, plain("Mini Course Generator", init));
  const session = init.session || "";
  await mcpCall(token, session, "notifications/initialized");
  return session;
}

/* Only tools/list and tools/call are forwarded. */
async function mcgRpc(body) {
  const token = need(body.accessToken, "MCG sign-in");
  const method = need(body.method, "method");
  if (method !== "tools/list" && method !== "tools/call") throw new HttpError(400, "That call is not allowed.");
  const session = await mcgSession(token);
  const r = await mcpCall(token, session, method, body.params && typeof body.params === "object" ? body.params : undefined);
  if (!r.ok) throw new HttpError(502, plain("Mini Course Generator", r));
  if (r.json && r.json.error) throw new HttpError(502, "Mini Course Generator said: " + String(r.json.error.message || "unknown error").slice(0, 300));
  return { ok: true, result: r.json ? r.json.result : null };
}

/* ---------- YouTube: one empty playlist, nothing else ---------- */

async function youtubePlaylist(body) {
  const token = need(body.accessToken, "Google sign-in");
  const title = need(body.title, "playlist title").slice(0, 150);
  const privacy = ["unlisted", "private", "public"].indexOf(body.privacy) >= 0 ? body.privacy : "unlisted";
  const r = await call(YT_PLAYLISTS, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ snippet: { title, description: str(body.description, 5000) }, status: { privacyStatus: privacy } })
  });
  if (!r.ok) {
    const reason = r.json && r.json.error && r.json.error.errors && r.json.error.errors[0] ? r.json.error.errors[0].reason : "";
    if (reason === "youtubeSignupRequired") throw new HttpError(502, "That Google account has no YouTube channel yet. Create a channel on YouTube first, then try again.");
    if (reason === "quotaExceeded") throw new HttpError(502, "The daily YouTube limit for this tool has been reached. Try again tomorrow.");
    throw new HttpError(502, plain("YouTube", r));
  }
  return { ok: true, playlistId: r.json.id, link: "https://www.youtube.com/playlist?list=" + r.json.id };
}

/* ---------- routing ---------- */

const API = {
  "/api/whop/check": whopCheck,
  "/api/whop/push": whopPush,
  "/api/ghl/push": ghlPush,
  "/api/mcg/register": mcgRegister,
  "/api/mcg/token": mcgToken,
  "/api/mcg/rpc": mcgRpc,
  "/api/youtube/playlist": youtubePlaylist
};

/* Light per-address limit on the proxy. Counts only, no content. */
const hits = new Map();
function limited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now();
  const h = hits.get(ip) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.n > 40;
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { send(res, 404, "Not found"); return; }
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300"
    });
  });
}

function safeJoin(root, rel) {
  const file = path.normalize(path.join(root, rel));
  return file.indexOf(root) === 0 ? file : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  res.on("finish", () => { console.log(req.method + " " + p + " " + res.statusCode); });

  if (p === "/healthz") { send(res, 200, { ok: true }); return; }

  if (p === "/env.js") {
    send(res, 200, "window.APP_ENV = " + JSON.stringify({ GOOGLE_CLIENT_ID }) + ";", { "Content-Type": MIME[".js"] });
    return;
  }

  if (p.indexOf("/api/") === 0) {
    const handler = API[p];
    if (!handler) { send(res, 404, { ok: false, error: "Unknown endpoint." }); return; }
    if (req.method !== "POST") { send(res, 405, { ok: false, error: "Use POST." }); return; }
    if (limited(req)) { send(res, 429, { ok: false, error: "Too many requests. Wait a minute and try again." }); return; }
    try {
      const body = await readJson(req);
      send(res, 200, await handler(body));
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, Object.assign({ ok: false, error: e.message }, e.extra));
      else send(res, 500, { ok: false, error: "Something went wrong on our side. Try again." });
    }
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { send(res, 405, "Method not allowed"); return; }

  if (p.indexOf("/schema/") === 0) {
    const f = safeJoin(SCHEMA_DIR, p.slice("/schema/".length));
    if (f) serveFile(res, f); else send(res, 404, "Not found");
    return;
  }

  let rel = p === "/" ? "index.html" : p.slice(1);
  if (rel === "mcg-callback") rel = "mcg-callback.html";
  const file = safeJoin(PUBLIC_DIR, rel);
  if (!file) { send(res, 404, "Not found"); return; }
  serveFile(res, file);
});

server.listen(PORT, () => { console.log("minicourse-as-a-lead-magnet listening on " + PORT); });
