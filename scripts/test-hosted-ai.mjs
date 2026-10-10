/*
 * Tests the one-click generation route (/api/ai/generate) on a running server.
 * The server needs GEMINI_API_KEY in its environment.
 *
 *   node scripts/test-hosted-ai.mjs                      local server
 *   BASE_URL=https://... node scripts/test-hosted-ai.mjs live
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Outline = require("../public/outline.js");
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function post(body) {
  const r = await fetch(BASE + "/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}

const empty = await post({ answers: {} });
console.log("empty answers ->", empty.status, empty.json.error);

const t0 = Date.now();
const r = await post({ answers: {
  expertise: "Sourdough baking for beginners", ideal_client: "Home cooks who got a flat loaf once",
  problem: "Flat loaves, no idea why", bold_promise: "Bake a real loaf in one weekend",
  format: "Self-paced video minicourse", delivered_by: "Me, on camera",
  steps: "Wake up the starter\nMix\nShape\nBake", unique_approach: "Only three touches",
  session_count: "4", session_minutes: "10", resources: "Feeding chart", next_step: "Join my Bread Club"
} });
if (!r.json.ok) { console.log("FAIL", r.status, r.json); process.exit(1); }
const o = Outline.normalize(r.json.outline);
const k = Outline.counts(o);
console.log("ok in " + Math.round((Date.now() - t0) / 1000) + "s:", o.course.title, "|", k.modules, "modules,", k.lessons, "lessons");
