/*
 * Push tests against your own test accounts, through the local proxy.
 * Reads .env.test (gitignored). Start the server first: npm start
 *
 *   node scripts/test-push.mjs ghl
 *   node scripts/test-push.mjs whop-check
 *   node scripts/test-push.mjs whop
 */
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Outline = require("../public/outline.js");

const env = {};
for (const line of fs.readFileSync(new URL("../.env.test", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].trim();
}
const BASE = process.env.BASE_URL || "http://localhost:3000";
const outline = Outline.normalize(JSON.parse(fs.readFileSync(new URL("../schema/example-outline.json", import.meta.url), "utf8")));
const course = Outline.pushCourse(outline);

async function post(path, body) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  console.log(path, r.status, JSON.stringify(j, null, 2));
  return j;
}

const what = process.argv[2];
if (what === "ghl") {
  await post("/api/ghl/push", { token: env.GHL_TOKEN, locationId: env.GHL_LOCATION_ID, course });
} else if (what === "whop-check") {
  await post("/api/whop/check", { apiKey: env.WHOP_API_KEY, companyId: env.WHOP_COMPANY_ID });
} else if (what === "whop") {
  const c = await post("/api/whop/check", { apiKey: env.WHOP_API_KEY, companyId: env.WHOP_COMPANY_ID });
  const list = (c.experiences || []).filter((e) => e.isCourses);
  const exp = list.find((e) => e.id === env.WHOP_EXPERIENCE_ID) || list.find((e) => e.name === "Courses") || list[0];
  if (!exp) { console.log("No Courses experience found on that company."); process.exit(1); }
  await post("/api/whop/push", { apiKey: env.WHOP_API_KEY, experienceId: exp.id, course });
} else {
  console.log("Usage: node scripts/test-push.mjs ghl | whop-check | whop");
}
