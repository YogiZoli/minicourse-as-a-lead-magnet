/*
 * Tests the "own AI key" mode with the same request the browser sends.
 * Reads AI_KEY from .env.test. Gemini only for now.
 *
 *   node scripts/test-ai.mjs            lists models
 *   node scripts/test-ai.mjs <model>    generates an outline and validates it
 */
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Outline = require("../public/outline.js");

const env = {};
for (const line of fs.readFileSync(new URL("../.env.test", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}
const ctx = {};
vm.runInNewContext(fs.readFileSync(new URL("../public/questions.js", import.meta.url), "utf8") + "\nthis.buildPrompt = buildPrompt;", ctx);

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const headers = { "x-goog-api-key": env.AI_KEY, "Content-Type": "application/json" };
const model = process.argv[2];

if (!model) {
  const r = await fetch(BASE + "?pageSize=200", { headers });
  const j = await r.json();
  if (!r.ok) { console.log(r.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  console.log(j.models.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent")).map((m) => m.name.replace("models/", "")).join("\n"));
} else {
  const prompt = ctx.buildPrompt({
    expertise: "Sourdough baking for beginners", ideal_client: "Home cooks who got a flat loaf once",
    problem: "Flat loaves, no idea why", bold_promise: "Bake a real loaf in one weekend",
    format: "Self-paced video minicourse", delivered_by: "Me, on camera",
    steps: "Wake up the starter\nMix\nShape\nBake", unique_approach: "Only three touches",
    session_count: "4", session_minutes: "10", proof: "", resources: "Feeding chart", next_step: "Join my Bread Club"
  });
  const t0 = Date.now();
  const r = await fetch(BASE + "/" + encodeURIComponent(model) + ":generateContent", {
    method: "POST", headers,
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
  });
  const j = await r.json();
  if (!r.ok) { console.log(r.status, JSON.stringify(j).slice(0, 500)); process.exit(1); }
  const text = j.candidates[0].content.parts.map((p) => p.text || "").join("");
  const o = Outline.normalize(Outline.extractJson(text));
  const k = Outline.counts(o);
  console.log("ok in " + Math.round((Date.now() - t0) / 1000) + "s:", o.course.title, "|", k.modules, "modules,", k.lessons, "lessons");
  console.log("minutes per lesson:", Outline.lessons(o).map((x) => Outline.lessonMinutes(x.lesson)).join(", "));
  console.log("first youtube title:", o.modules[0].lessons[0].youtube.title);
}
