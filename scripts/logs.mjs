/*
 * Reads the live server log from Railway and prints it in plain lines.
 * Needs the Railway CLI, signed in, run from this folder.
 *
 *   node scripts/logs.mjs                    the last 300 lines of each recent deployment
 *   node scripts/logs.mjs errors             only errors and warnings
 *   node scripts/logs.mjs ref 2aa496         everything about one request (the ref the visitor saw)
 *   node scripts/logs.mjs session io7mblyuk5 everything one visitor's page did (the session on their activity log)
 *   node scripts/logs.mjs find whop          any line that contains the word
 *   node scripts/logs.mjs full ref 2aa496    the same, with every detail as JSON
 *
 * Railway keeps a separate log for every deployment, and every code change is a new deployment.
 * So the recent deployments are read one after the other and put together in time order.
 *
 * Add a number at the end for more lines per deployment, for example: node scripts/logs.mjs errors 5000
 * Add deploys=40 to read more deployments back in time (the default is the last 12).
 */
import { execSync } from "node:child_process";

const DEPLOYS = /^deploys=[0-9]+$/;
const DIGITS = /^[0-9]+$/;

const all = process.argv.slice(2);
const deployArg = all.find((a) => DEPLOYS.test(a));
const deployCount = deployArg ? parseInt(deployArg.split("=")[1], 10) : 12;
const args = all.filter((a) => !DEPLOYS.test(a));
const full = args[0] === "full" ? (args.shift(), true) : false;
const mode = args[0] || "all";
const wanted = DIGITS.test(args[args.length - 1] || "") ? args.pop() : (mode === "all" ? "300" : "3000");
const value = (args[1] || "").toLowerCase();

function run(cmd) { return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }

let raw = "";
try {
  const list = JSON.parse(run("railway deployment list -s minicourse-as-a-lead-magnet --json"));
  const ids = list.slice(0, deployCount).map((d) => String(d.id)).filter((id) => /^[a-f0-9-]{36}$/.test(id));
  for (const id of ids) {
    /* "wanted" is digits only and the id is checked above, so this command line is fixed text plus those two. */
    try { raw += run("railway logs " + id + " -s minicourse-as-a-lead-magnet --json -n " + wanted) + "\n"; }
    catch (e) { /* a deployment that never started has no log */ }
  }
} catch (e) {
  console.log("Could not read the Railway log. Is the Railway CLI installed and signed in? " + (e.stderr || e.message));
  process.exit(1);
}

/* Railway hands each line back as JSON. Our own fields are either on it directly or inside its message. */
function read(line) {
  let o;
  try { o = JSON.parse(line); } catch (e) { return null; }
  let d = o;
  if (typeof o.message === "string" && o.message.trim().charAt(0) === "{") {
    try { d = Object.assign({}, o, JSON.parse(o.message)); } catch (e) { /* plain text */ }
  }
  if (o.attributes && typeof o.attributes === "object") d = Object.assign({}, o.attributes, d);
  d.time = d.time || o.timestamp || "";
  return d;
}

const seen = new Set();
const rows = raw.split(/\r?\n/).map(read).filter(Boolean)
  .sort((a, b) => String(a.time).localeCompare(String(b.time)))
  .filter((d) => {
    /* The same line can come back from two overlapping deployments. */
    const key = d.time + "|" + d.event + "|" + d.message;
    if (seen.has(key)) return false;
    seen.add(key);
    const text = JSON.stringify(d).toLowerCase();
    /* Railway's own start-up notice from npm, not ours and not a problem. */
    if (!d.event && /npm warn config production/i.test(String(d.message))) return false;
    if (mode === "errors") return d.level === "error" || d.level === "warn";
    if (mode === "ref") return String(d.ref || "").toLowerCase() === value || text.includes("ref " + value);
    if (mode === "session") return String(d.sid || "").toLowerCase() === value;
    if (mode === "find") return text.includes(value);
    return true;
  });

if (!rows.length) console.log("Nothing found in the last " + deployCount + " deployments. Add deploys=40 to look further back.");
for (const d of rows) {
  if (full) { console.log(JSON.stringify(d, null, 2)); continue; }
  const when = String(d.time).replace("T", " ").slice(0, 19);
  console.log([when, String(d.level || "").toUpperCase().padEnd(5), String(d.event || "").padEnd(11), d.sid ? "[" + d.sid + "]" : "", d.message || ""].filter(Boolean).join("  "));
  for (const u of d.upstream || []) {
    console.log("      called " + u.host + u.path + " -> " + (u.status || u.result) + " in " + u.ms + " ms" + (u.said ? ' , it said: "' + u.said + '"' : "") + (u.error ? " (" + u.error + ")" : ""));
  }
  for (const st of d.steps || []) {
    const { step, at_ms, ...rest } = st;
    console.log("      step " + step + " at " + at_ms + " ms " + (Object.keys(rest).length ? JSON.stringify(rest) : ""));
  }
  if (d.bug) console.log("      bug: " + d.bug.join(" | "));
  if (d.stack) console.log("      stack: " + d.stack.join(" | "));
}
