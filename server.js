/*
 * minicourse-as-a-lead-magnet
 * One service: static frontend plus a thin stateless proxy.
 *
 * The proxy forwards the visitor's own credentials, per request, to Whop, GHL,
 * MCG and YouTube. Nothing is stored. No database. Request bodies, keys and
 * tokens are never logged.
 *
 * Logging: every line is one JSON object (level, message, event, time and details),
 * so the Railway log explorer can filter on any field. See README, "Logging".
 * What is logged: page views, every API request (start and end), every call to an
 * outside service with its status, duration and the service's own error text, every
 * step inside a push, every limit that was hit, every crash, and the events the
 * visitor's page reports (screen changes, clicks that start work, failures, page errors).
 * What is never logged: keys, tokens, passwords, answers, outlines, names, emails.
 * Anything that looks like a key is masked before a line is written.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const Outline = require("./public/outline.js");

/* Per-request trace: the ref, the outside calls and the steps taken. No content. */
const trace = new AsyncLocalStorage();

/* ---------- logging ---------- */

const BUILD = (process.env.RAILWAY_DEPLOYMENT_ID || "local").slice(0, 8);
const KEYLIKE = /\b(apik_|pit-|sk-ant-|sk-|AIza|AQ\.|ya29\.|GOCSPX-|eyJ)[A-Za-z0-9._\-]{6,}/g;
const BEARER = /Bearer\s+\S+/gi;
const LONGTOKEN = /[A-Za-z0-9_\-]{44,}/g;

/* Masks anything that looks like a key or token, in any text, at any depth. */
function mask(v, depth) {
  if (typeof v === "string") return v.replace(BEARER, "Bearer [hidden]").replace(KEYLIKE, "$1[hidden]").replace(LONGTOKEN, "[hidden]").slice(0, 700);
  if (v === null || typeof v !== "object") return v;
  if ((depth || 0) > 5) return "[deep]";
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => mask(x, (depth || 0) + 1));
  const out = {};
  Object.keys(v).slice(0, 60).forEach((k) => { out[k] = mask(v[k], (depth || 0) + 1); });
  return out;
}

/* One JSON line. level: info, warn or error. event: a fixed name to filter on. message: the line in plain words. */
function log(level, event, message, data) {
  let line;
  try { line = JSON.stringify(Object.assign({ level, message: mask(String(message)), event, time: new Date().toISOString(), build: BUILD }, mask(data || {}))); }
  catch (e) { line = JSON.stringify({ level: "error", message: "a log line could not be written", event: "log_failed", time: new Date().toISOString() }); }
  console.log(line);
}

/* A step inside the current request. It ends up in that request's api_end line, with the time since the request began. */
function step(name, data) {
  const t = trace.getStore();
  if (t) t.steps.push(Object.assign({ step: name, at_ms: Date.now() - t.t0 }, data || {}));
}

function stackOf(e) { return e && e.stack ? e.stack.split("\n").slice(0, 6).map((x) => x.trim()) : [String(e)]; }

/* A bug in one request must never take the whole service down, and it must leave a trace. */
process.on("uncaughtException", (e) => { log("error", "crash", "uncaught exception: " + (e && e.message), { stack: stackOf(e) }); });
process.on("unhandledRejection", (e) => { log("error", "crash", "unhandled rejection: " + (e && e.message), { stack: stackOf(e) }); });

const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
/* "Connect" buttons. The ids are public. Only the GHL secret is private, and it never leaves this server. */
const WHOP_CLIENT_ID = process.env.WHOP_CLIENT_ID || "";
/* Only needed if the Whop app is set to "Confidential". A "Public" Whop app needs no secret. */
const WHOP_CLIENT_SECRET = process.env.WHOP_CLIENT_SECRET || "";
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || "";
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const SCHEMA_DIR = path.join(__dirname, "schema");
const MAX_BODY = 600 * 1024;

const WHOP = "https://api.whop.com/api/v1";
const GHL_IMPORT = "https://services.leadconnectorhq.com/courses/courses-exporter/public/import";
const MCG_MCP = "https://mcp.minicoursegenerator.com/mcp";
const MCG_AUTH = "https://gateway.minicoursegenerator.com";
const YT_PLAYLISTS = "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status";

/* Hosted generation: the site owner's own Gemini key, kept only in the Railway environment. */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-3-flash-preview,gemini-flash-lite-latest").split(",").map((m) => m.trim()).filter(Boolean);
const AI_DAILY_LIMIT = parseInt(process.env.AI_DAILY_LIMIT || "200", 10);
const AI_PER_VISITOR = 4;          // outlines per visitor address per 10 minutes

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".ttf": "font/ttf", ".txt": "text/plain; charset=utf-8"
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
    req.on("error", () => reject(new HttpError(499, "The request was cut off before it arrived.")));
    /* The visitor's connection dropped before the whole request arrived. */
    req.on("close", () => { if (!req.complete) reject(new HttpError(499, "The request was cut off before it arrived.")); });
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

/* One outbound call. Returns status plus parsed body. Never throws. Status 0 means no answer (network or timeout). */
async function callOnce(url, opts) {
  const t = trace.getStore();
  const rec = { host: "?", path: "", method: (opts && opts.method) || "GET", status: 0, ms: 0 };
  try { const u = new URL(url); rec.host = u.host; rec.path = u.pathname; } catch (e) { /* keep "?" */ }
  const t1 = Date.now();
  let r;
  try {
    r = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opts));
  } catch (e) {
    rec.ms = Date.now() - t1;
    rec.result = e && e.name === "TimeoutError" ? "timeout" : "noanswer";
    rec.error = String((e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || e).slice(0, 160);
    if (t) t.upstream.push(rec);
    return { ok: false, status: 0, json: null, text: "", headers: null };
  }
  let text = "";
  try { text = await r.text(); } catch (e) { rec.bodyCut = true; }
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not json */ }
  rec.status = r.status; rec.ms = Date.now() - t1; rec.bytes = text.length;
  /* On a refusal, keep the service's own words: they are the fastest way to see what went wrong. */
  if (!r.ok) rec.said = detail({ json }) || text.replace(/\s+/g, " ").slice(0, 240);
  if (t) t.upstream.push(rec);
  return { ok: r.ok, status: r.status, json, text, headers: r.headers };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* A 429 means the platform refused the request without doing it, so it is safe to wait and send it again. */
async function call(url, opts, noRetry) {
  for (let attempt = 0; ; attempt++) {
    const r = await callOnce(url, opts);
    if (r.status !== 429 || noRetry || attempt >= 2) return r;
    const asked = r.headers ? parseFloat(r.headers.get("retry-after")) : NaN;
    const wait = Math.min(8000, (asked > 0 ? asked : (attempt + 1) * 2) * 1000);
    step("waiting_after_429", { wait_ms: wait, attempt: attempt + 1 });
    await sleep(wait);
  }
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
    case 0: return platform + " did not answer in time. It may be slow right now. Wait a minute and try again.";
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
  step("course_read", { modules: clean.length, lessons: lessonCount });
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
  step("whop_experiences", { total: experiences.length, courses: experiences.filter((e) => e.isCourses).length });
  return { ok: true, experiences };
}

/* Connect Whop: swaps the sign-in code for a token. Whop uses PKCE, so there is no secret. The token goes back to the visitor's tab and is not kept here. */
async function whopOauthToken(body) {
  if (!WHOP_CLIENT_ID) throw new HttpError(503, "Connect Whop is not switched on. Use an API key instead.");
  const r = await call("https://api.whop.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(Object.assign({
      grant_type: "authorization_code", code: need(body.code, "sign-in code"),
      redirect_uri: need(body.redirectUri, "redirect URI"), client_id: WHOP_CLIENT_ID,
      code_verifier: need(body.codeVerifier, "code verifier")
    }, WHOP_CLIENT_SECRET ? { client_secret: WHOP_CLIENT_SECRET } : {}))
  });
  if (!r.ok || !r.json || !r.json.access_token) throw new HttpError(502, "Whop did not finish the sign-in. Try Connect Whop again." + (detail(r) ? " Whop said: " + detail(r) : ""));
  step("whop_connected", { scope: String(r.json.scope || "").slice(0, 200) });
  return { ok: true, accessToken: r.json.access_token };
}

/* Which whops can this sign-in work on. */
async function whopCompanies(body) {
  const key = need(body.apiKey, "Whop sign-in");
  const r = await call(WHOP + "/companies?first=50", { headers: whopHeaders(key) });
  let list = r.ok && r.json && Array.isArray(r.json.data) ? r.json.data : [];
  if (!list.length) {
    /* Fallback: a sign-in tied to one whop names it in the profile. */
    const u = await call("https://api.whop.com/oauth/userinfo", { headers: whopHeaders(key) });
    const c = u.ok && u.json ? u.json.company : null;
    if (c && typeof c === "object" && c.id) list = [c];
    else if (typeof c === "string") list = [{ id: c, title: c }];
  }
  if (!list.length && !r.ok) throw new HttpError(502, plain("Whop", r));
  step("whop_companies", { found: list.length, list_status: r.status });
  return { ok: true, companies: list.map((c) => ({ id: c.id, title: c.title || c.name || c.id })) };
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
  if (!c.json || !c.json.id) throw new HttpError(502, "Whop answered, but not in the way we expected, so we stopped. Check in Whop whether an empty course was created.");
  created.courseId = c.json.id;
  step("whop_course_created", { courseId: created.courseId, placeholders: Array.isArray(c.json.chapters) ? c.json.chapters.length : 0 });

  /* Whop puts one placeholder chapter with one placeholder lesson into every new course.
     They are filled with the first module and lesson, so nothing empty is left behind. */
  const spare = Array.isArray(c.json.chapters) ? c.json.chapters.slice() : [];
  const send = (method, path, data) => call(WHOP + path, { method, headers, body: JSON.stringify(data) });

  for (const m of course.modules) {
    const reuse = spare.shift();
    const ch = reuse
      ? await send("PATCH", "/course_chapters/" + reuse.id, { title: m.title })
      : await send("POST", "/course_chapters", { course_id: created.courseId, title: m.title });
    if (!ch.ok || !ch.json || !ch.json.id) {
      step("whop_stopped", { at: "chapter", chapter: created.chapters + 1, created });
      throw new HttpError(502, plain("Whop", ch) + " The course was created, but it stopped at a chapter.", { created });
    }
    created.chapters++;
    const spareLessons = reuse && Array.isArray(reuse.lessons) ? reuse.lessons.slice() : [];
    for (const l of m.lessons) {
      const old = spareLessons.shift();
      const ls = old
        ? await send("PATCH", "/course_lessons/" + old.id, { lesson_type: "text", title: l.title, content: l.content_md })
        : await send("POST", "/course_lessons", { chapter_id: ch.json.id, lesson_type: "text", title: l.title, content: l.content_md });
      if (!ls.ok) {
        step("whop_stopped", { at: "lesson", chapter: created.chapters, lesson: created.lessons + 1, created });
        throw new HttpError(502, plain("Whop", ls) + " The course was created, but it stopped at a lesson.", { created });
      }
      created.lessons++;
    }
  }
  step("whop_done", created);
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
  step("ghl_accepted", { locationId, courseId: first ? first.id : "", said: (r.json && r.json.message) || "" });
  return {
    ok: true,
    message: (r.json && r.json.message) || "Import started.",
    note: (r.json && r.json.note) || "",
    courseId: first ? first.id : "",
    link: (first && first.url) || "https://app.gohighlevel.com/v2/location/" + encodeURIComponent(locationId) + "/memberships/courses/products"
  };
}

/* Connect GoHighLevel: swaps the sign-in code for a sub-account token. The app secret is added here and never sent to the browser. */
async function ghlOauthToken(body) {
  if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) throw new HttpError(503, "Connect GoHighLevel is not switched on. Use a Private Integration Token instead.");
  const form = new URLSearchParams({
    client_id: GHL_CLIENT_ID, client_secret: GHL_CLIENT_SECRET, grant_type: "authorization_code",
    code: need(body.code, "sign-in code"), user_type: "Location", redirect_uri: need(body.redirectUri, "redirect URI")
  });
  const r = await call("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" }, body: form.toString()
  });
  if (!r.ok || !r.json || !r.json.access_token) throw new HttpError(502, "GoHighLevel did not finish the sign-in. Try Connect GoHighLevel again." + (detail(r) ? " GoHighLevel said: " + detail(r) : ""));
  if (!r.json.locationId) throw new HttpError(502, "GoHighLevel connected the agency, not a sub-account. Connect again and pick the sub-account the course should go into.");
  step("ghl_connected", { locationId: r.json.locationId, userType: r.json.userType || "", scope: String(r.json.scope || "").slice(0, 200) });
  return { ok: true, accessToken: r.json.access_token, locationId: r.json.locationId };
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
  if (init.status === 401) throw new HttpError(401, "Your Mini Course Generator sign-in has expired. Click Connect Mini Course Generator and sign in again.");
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
  const params = body.params && typeof body.params === "object" ? body.params : undefined;
  step("mcg_call", { method, tool: params && params.name ? String(params.name) : "", dryRun: !!(params && params.arguments && params.arguments.dryRun) });
  const session = await mcgSession(token);
  const r = await mcpCall(token, session, method, params);
  if (r.status === 401) throw new HttpError(401, "Your Mini Course Generator sign-in has expired. Click Connect Mini Course Generator and sign in again.");
  if (!r.ok) throw new HttpError(502, plain("Mini Course Generator", r));
  if (r.json && r.json.error) throw new HttpError(502, "Mini Course Generator said: " + String(r.json.error.message || "unknown error").slice(0, 300));
  const result = r.json ? r.json.result : null;
  /* A tool can answer "ok" at the network level and still say the work failed. Keep its words. */
  if (result && result.isError) {
    const words = (Array.isArray(result.content) ? result.content : []).map((c) => (c && c.text) || "").join(" ").replace(/\s+/g, " ").slice(0, 400);
    step("mcg_tool_refused", { said: words });
  } else {
    step("mcg_tool_ok", {});
  }
  return { ok: true, result };
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
    if (r.status === 401) throw new HttpError(401, "Your Google sign-in has expired. Click Preview, then Confirm and create, and allow it again.");
    if (reason === "youtubeSignupRequired") throw new HttpError(502, "That Google account has no YouTube channel yet. Create a channel on YouTube first, then try again.");
    if (reason === "quotaExceeded") throw new HttpError(502, "The daily YouTube limit for this tool has been reached. Try again tomorrow.");
    throw new HttpError(502, plain("YouTube", r));
  }
  if (!r.json || !r.json.id) throw new HttpError(502, "YouTube answered, but not in the way we expected. Check your channel: the playlist may have been created.");
  step("youtube_playlist_created", { playlistId: r.json.id, privacy });
  return { ok: true, playlistId: r.json.id, link: "https://www.youtube.com/playlist?list=" + r.json.id };
}

/* ---------- hosted AI generation ----------
 * The prompt is built here from the answers, with the same builder the page uses,
 * so this route can only write course outlines. Answers pass through and are not kept.
 */

const buildPrompt = (() => {
  const ctx = {};
  require("node:vm").runInNewContext(fs.readFileSync(path.join(PUBLIC_DIR, "questions.js"), "utf8") + "\nthis.buildPrompt = buildPrompt;", ctx);
  return ctx.buildPrompt;
})();
const ANSWER_KEYS = ["expertise", "ideal_client", "problem", "bold_promise", "format", "delivered_by", "steps",
  "unique_approach", "session_count", "session_minutes", "proof", "resources", "next_step"];

const aiHits = new Map();
const aiDay = { date: "", n: 0 };
const aiWorking = { model: "", until: 0 };
const aiResting = new Map();   // model -> time until which it is skipped, after it hung or failed

async function aiGenerate(body, req) {
  if (!GEMINI_API_KEY) throw new HttpError(503, "One-click generation is not switched on. Use the Prompt Pack instead.");
  const raw = body && typeof body.answers === "object" && body.answers ? body.answers : {};
  const answers = {};
  ANSWER_KEYS.forEach((k) => { answers[k] = str(raw[k], 1500); });
  if (!answers.expertise || !answers.bold_promise) throw new HttpError(400, "Answer the questions first.");

  const today = new Date().toISOString().slice(0, 10);
  if (aiDay.date !== today) { aiDay.date = today; aiDay.n = 0; }
  if (aiDay.n >= AI_DAILY_LIMIT) step("ai_daily_limit_hit", { today: aiDay.n });
  if (aiDay.n >= AI_DAILY_LIMIT) throw new HttpError(429, "One-click generation has reached its limit for today. Use the Prompt Pack instead, it gives the same result.");
  const ip = clientIp(req), now = Date.now();
  const h = aiHits.get(ip) || { n: 0, t: now };
  if (now - h.t > 600000) { h.n = 0; h.t = now; }
  if (h.n >= AI_PER_VISITOR) step("ai_visitor_limit_hit", { this_visitor_10min: h.n });
  if (h.n >= AI_PER_VISITOR) throw new HttpError(429, "You have generated a few outlines in a row. Wait ten minutes, or use the Prompt Pack.");
  h.n++; aiHits.set(ip, h); aiDay.n++;
  step("ai_limits", { today: aiDay.n, daily_limit: AI_DAILY_LIMIT, this_visitor_10min: h.n });
  if (aiHits.size > 5000) aiHits.clear();

  /* Gemini models are sometimes overloaded or retired, so the next model in the list is tried before giving up.
     The answer is checked here: the visitor only ever gets a complete, valid outline. */
  const payload = JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(answers) }] }], generationConfig: { responseMimeType: "application/json" } });
  const all = [GEMINI_MODEL].concat(GEMINI_FALLBACK_MODELS).filter((m, i, a) => a.indexOf(m) === i);
  /* A model that just hung or failed rests for 10 minutes, so the next visitors do not wait on it again.
     If every model is resting, all of them are tried anyway. */
  const fresh = all.filter((m) => !(aiResting.get(m) > Date.now()));
  const order = fresh.length ? fresh.concat(all.filter((m) => fresh.indexOf(m) < 0)) : all.slice();
  if (aiWorking.model && Date.now() < aiWorking.until && order.indexOf(aiWorking.model) > 0) {
    order.splice(order.indexOf(aiWorking.model), 1);
    order.unshift(aiWorking.model);
  }
  step("ai_model_order", { order, resting: all.filter((m) => aiResting.get(m) > Date.now()), preferred: aiWorking.until > Date.now() ? aiWorking.model : "" });
  let outline = null, last = null;
  for (const model of order) {
    last = await call("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
      method: "POST", signal: AbortSignal.timeout(45000),
      headers: { "x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json" }, body: payload
    }, true);
    if (last.ok) {
      const cand = last.json && last.json.candidates && last.json.candidates[0];
      const text = cand && cand.content && cand.content.parts ? cand.content.parts.map((x) => x.text || "").join("") : "";
      try { outline = Outline.normalize(Outline.extractJson(text)); }
      catch (e) { outline = null; step("ai_outline_rejected", { model, reason: String(e.message).slice(0, 160), answer_chars: text.length, finish: (cand && cand.finishReason) || "" }); }
      if (outline) {
        /* Remember a model that works, so the next visitors do not wait on one that is hanging. */
        aiWorking.model = model; aiWorking.until = Date.now() + 15 * 60000;
        aiResting.delete(model);
        step("ai_outline_ok", Object.assign({ model }, Outline.counts(outline)));
        break;
      }
      if (aiWorking.model === model) aiWorking.until = 0;
    } else if ([0, 404, 429, 500, 502, 503].indexOf(last.status) < 0) {
      break;
    } else {
      aiResting.set(model, Date.now() + 10 * 60000);
      step("ai_model_rested", { model, status: last.status, minutes: 10 });
      if (aiWorking.model === model) aiWorking.until = 0;
    }
  }
  if (!outline) {
    if (last && (last.status === 401 || last.status === 403)) throw new HttpError(503, "One-click generation is switched off right now. Use the Prompt Pack below, it gives the same result.");
    throw new HttpError(503, "The AI is busy right now and could not finish your outline. Your answers are safe. Try again in a minute, or use the Prompt Pack below.");
  }
  return { ok: true, outline };
}

/* ---------- events reported by the visitor's page ----------
 * The page tells us what it did and what went wrong on its side: things this server would never see
 * otherwise (a blocked pop-up, a sign-in window closed, a page error, a request that never arrived).
 */
function clientLog(body, req, who) {
  const events = Array.isArray(body && body.events) ? body.events.slice(0, 40) : [];
  events.forEach((ev) => {
    const text = str(ev && ev.text, 500);
    if (!text) return;
    const level = /page error|start failed|crash/i.test(text) ? "error" : (/failed|not accepted|blocked|stopped|closed before|could not|did not|too long|offline/i.test(text) ? "warn" : "info");
    log(level, "page", text, { sid: who.sid, visitor: who.visitor, at: str(ev.at, 30), screen: str(ev.screen, 20) });
  });
  return { ok: true, taken: events.length };
}

/* ---------- routing ---------- */

const API = {
  "/api/ai/generate": aiGenerate,
  "/api/whop/oauth/token": whopOauthToken,
  "/api/whop/companies": whopCompanies,
  "/api/ghl/oauth/token": ghlOauthToken,
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
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}
function limited(req, bucket, max) {
  const key = (bucket || "api") + "|" + clientIp(req);
  const now = Date.now();
  const h = hits.get(key) || { n: 0, t: now };
  if (now - h.t > 60000) { h.n = 0; h.t = now; }
  h.n++;
  hits.set(key, h);
  if (hits.size > 8000) hits.clear();
  return h.n > (max || 40);
}

/* Who is asking, without keeping who they are: a short code that changes every day, and the page's own session code. */
function whoIs(req) {
  const day = new Date().toISOString().slice(0, 10);
  let fromAddress = "";
  try { fromAddress = new URL(req.url, "http://localhost").searchParams.get("s") || ""; } catch (e) { /* none */ }
  const sid = String(req.headers["x-session"] || fromAddress).replace(/[^a-z0-9]/gi, "").slice(0, 16);
  return {
    visitor: crypto.createHash("sha256").update(day + "|" + clientIp(req)).digest("hex").slice(0, 8),
    sid,
    ua: String(req.headers["user-agent"] || "").slice(0, 140)
  };
}

/* How serious was it. A wrong key is the visitor's to fix (warn). A service that did not answer, or our own bug, is an error. */
function levelFor(status, upstream, bug) {
  if (bug) return "error";
  if (status < 400) return "info";
  if (status >= 500 && (!upstream.length || upstream.some((u) => !u.status || u.status >= 500 || u.status === 429))) return "error";
  return "warn";
}

function serveFile(res, file, p, who) {
  fs.readFile(file, (err, data) => {
    if (err) { log("info", "not_found", "no such file: " + p, { visitor: who ? who.visitor : "" }); send(res, 404, "Not found"); return; }
    const ext = path.extname(file).toLowerCase();
    send(res, 200, data, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
  });
}

function safeJoin(root, rel) {
  const file = path.normalize(path.join(root, rel));
  return file.indexOf(root) === 0 ? file : null;
}

async function handle(req, res) {
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch (e) { log("warn", "bad_request", "an address that could not be read was requested", {}); send(res, 400, "Bad request"); return; }

  if (p === "/healthz") { send(res, 200, { ok: true }); return; }

  if (p === "/env.js") {
    send(res, 200, "window.APP_ENV = " + JSON.stringify({ GOOGLE_CLIENT_ID, AI_HOSTED: !!GEMINI_API_KEY, WHOP_CLIENT_ID, GHL_CLIENT_ID: GHL_CLIENT_SECRET ? GHL_CLIENT_ID : "" }) + ";", { "Content-Type": MIME[".js"] });
    return;
  }

  const who = whoIs(req);

  /* Events from the page. No start and end lines for these, each event is its own line. */
  if (p === "/api/log") {
    if (req.method !== "POST") { send(res, 405, { ok: false }); return; }
    if (limited(req, "log", 90)) { send(res, 429, { ok: false }); return; }
    try { send(res, 200, clientLog(await readJson(req), req, who)); }
    catch (e) { send(res, 400, { ok: false }); }
    return;
  }

  if (p.indexOf("/api/") === 0) {
    const store = { ref: crypto.randomBytes(3).toString("hex"), upstream: [], steps: [], t0: Date.now() };
    const base = { ref: store.ref, path: p, sid: who.sid, visitor: who.visitor };
    let status = 200, out, bug = null, gone = false;
    res.on("close", () => { if (!res.writableEnded) gone = true; });
    const handler = API[p];
    log("info", "api_start", "start " + p + " ref " + store.ref, Object.assign({ method: req.method, bytes: parseInt(req.headers["content-length"], 10) || 0, ua: who.ua }, base));
    if (!handler) { status = 404; out = { ok: false, error: "Unknown endpoint." }; }
    else if (req.method !== "POST") { status = 405; out = { ok: false, error: "Use POST." }; }
    else if (limited(req)) { status = 429; out = { ok: false, error: "Too many requests in a short time. Wait a minute and try again." }; step("rate_limited", {}); }
    else {
      try {
        const body = await readJson(req);
        out = await trace.run(store, () => handler(body, req));
      } catch (e) {
        if (e instanceof HttpError) { status = e.status; out = Object.assign({ ok: false, error: e.message }, e.extra); }
        else {
          status = 500; bug = e;
          out = { ok: false, error: "Something went wrong on our side. Nothing was lost on your page. Try again in a minute." };
        }
      }
    }
    if (!out || typeof out !== "object") {
      status = 500; bug = bug || new Error("a handler gave no answer");
      out = { ok: false, error: "Something went wrong on our side. Nothing was lost on your page. Try again in a minute." };
    }
    out.ref = store.ref;
    const ms = Date.now() - store.t0;
    const level = levelFor(status, store.upstream, bug);
    /* The whole story of one request in one line: what was asked, every outside call, every step, what the visitor was told. */
    log(level, "api_end",
      (status < 400 ? "ok " : "failed ") + p + " " + status + " in " + ms + "ms ref " + store.ref + (out.error ? ": " + out.error : ""),
      Object.assign({ status, ms, upstream: store.upstream, steps: store.steps, shown: out.error || "", bug: bug ? stackOf(bug) : undefined,
        /* The work was finished, but the visitor's page was no longer there to hear about it. */
        visitor_gone: gone || undefined }, base));
    send(res, status, out);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") { log("warn", "bad_method", req.method + " " + p, { visitor: who.visitor }); send(res, 405, "Method not allowed"); return; }

  if (p.indexOf("/schema/") === 0) {
    const f = safeJoin(SCHEMA_DIR, p.slice("/schema/".length));
    if (f) serveFile(res, f, p, who); else send(res, 404, "Not found");
    return;
  }

  let rel = p === "/" ? "index.html" : p.slice(1);
  if (rel === "mcg-callback") rel = "mcg-callback.html";
  /* Sign-in return addresses. GoHighLevel does not allow its own name in a return address, hence "crm". */
  if (rel === "connect/whop/callback" || rel === "connect/crm/callback") rel = "oauth-callback.html";
  if (rel === "index.html") log("info", "page_view", "page opened", { visitor: who.visitor, ua: who.ua, from: String(req.headers.referer || "").slice(0, 120) });
  if (rel.indexOf("callback") >= 0) {
    /* A sign-in came back. Only whether it carried a code or an error is noted, never the code itself. */
    const q = new URL(req.url, "http://localhost").searchParams;
    log(q.get("error") ? "warn" : "info", "signin_return", "sign-in returned to " + p, { visitor: who.visitor, has_code: !!q.get("code"), error: str(q.get("error_description") || q.get("error") || "", 200) });
  }
  const file = safeJoin(PUBLIC_DIR, rel);
  if (!file) { log("warn", "not_found", "outside the public folder: " + p, { visitor: who.visitor }); send(res, 404, "Not found"); return; }
  serveFile(res, file, p, who);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log("error", "crash", "a request failed outside the normal path: " + (e && e.message), { url_path: String(req.url || "").split("?")[0].slice(0, 120), stack: stackOf(e) });
    try { if (!res.headersSent) send(res, 500, { ok: false, error: "Something went wrong on our side. Try again in a minute." }); else res.end(); } catch (x) { /* socket gone */ }
  });
});
server.on("clientError", (err, socket) => { try { socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"); } catch (e) { /* socket gone */ } });
/* Long pushes and generation need more than the default time. */
server.requestTimeout = 240000;

server.listen(PORT, () => {
  log("info", "server_start", "server started on port " + PORT, {
    node: process.version,
    features: {
      one_click_ai: !!GEMINI_API_KEY, youtube: !!GOOGLE_CLIENT_ID,
      connect_whop: !!WHOP_CLIENT_ID, whop_app_type: WHOP_CLIENT_SECRET ? "confidential" : "public", connect_ghl: !!(GHL_CLIENT_ID && GHL_CLIENT_SECRET)
    },
    ai: { model: GEMINI_MODEL, fallbacks: GEMINI_FALLBACK_MODELS, daily_limit: AI_DAILY_LIMIT, per_visitor_10min: AI_PER_VISITOR }
  });
});

/* A redeploy stops the old server. Say so, so a gap in the log has an explanation, and let running requests finish. */
let open = 0;
server.on("request", (req, res) => { open++; res.on("close", () => { open--; }); });
["SIGTERM", "SIGINT"].forEach((sig) => {
  process.on(sig, () => {
    log("info", "server_stop", "server stopping (" + sig + "), usually a redeploy. Requests still running: " + open, { uptime_s: Math.round(process.uptime()), running: open });
    /* No new requests. The ones already running get up to 25 seconds to finish. */
    server.close(() => { log("info", "server_stop", "server stopped cleanly", {}); process.exit(0); });
    setTimeout(() => { log("warn", "server_stop", "server stopped with " + open + " request(s) still running", { running: open }); process.exit(0); }, 25000).unref();
  });
});
