// Draws the build's cadence on the organisation's front page from Unl's public cadence feed.
//
// What it reads: https://api.unlimitless.ai/public/build-cadence, which carries only dates and counts:
// how many changes landed on the main branch of Unl's private engine repository, each counted once (a merged
// pull request is one change, however many commits it held), by UTC day. No commit titles, branch names or file names exist in the feed.
//
// What it writes: profile/cadence.svg (one square per day) and the block between the cadence markers in
// profile/README.md. If the feed is unreachable or not the expected shape, it writes nothing and exits
// non-zero: the last good picture stays, and nothing is ever drawn that was not read.
import { readFileSync, writeFileSync } from "node:fs";

export const FEED = "https://api.unlimitless.ai/public/build-cadence";
const START = "<!-- cadence:start -->";
const END = "<!-- cadence:end -->";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The feed's body, checked. Anything else is null, and null draws nothing. */
export function validate(body) {
  const c = body?.available === true ? body.cadence : null;
  if (!c || c.schema !== "unl-build-cadence/1") return null;
  if (!DAY.test(c.since) || !DAY.test(c.through) || c.since > c.through) return null;
  if (!Number.isSafeInteger(c.merged_changes) || c.merged_changes < 1) return null;
  if (!c.by_day || typeof c.by_day !== "object") return null;
  let sum = 0;
  for (const [d, n] of Object.entries(c.by_day)) {
    if (!DAY.test(d) || !Number.isSafeInteger(n) || n < 1 || d < c.since || d > c.through) return null;
    sum += n;
  }
  if (sum !== c.merged_changes) return null;
  if (Object.keys(c.by_day).length !== c.active_days) return null;
  if (!Number.isFinite(Date.parse(c.as_of))) return null;
  return { since: c.since, through: c.through, as_of: c.as_of, merged_changes: c.merged_changes, active_days: c.active_days, by_day: c.by_day };
}

const utc = (d) => new Date(`${d}T00:00:00Z`);
const iso = (t) => t.toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5) + 1;
export const longDate = (d) => `${utc(d).getUTCDate()} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][utc(d).getUTCMonth()]} ${utc(d).getUTCFullYear()}`;
const fmt = (n) => n.toLocaleString("en-GB");

/** The quartile a day's count falls in, 1..4, against the busiest day. 0 is a day with nothing merged. */
function level(n, max) {
  if (!n) return 0;
  return Math.min(4, Math.max(1, Math.ceil((n / max) * 4)));
}

/** One square per day, weeks as columns from Monday, like a contribution graph. Works on light and dark pages. */
export function renderSvg(c) {
  const colours = ["#8b949e26", "#2ea04366", "#2ea04399", "#2ea043cc", "#2ea043"];
  const start = utc(c.since);
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  const gridStart = new Date(start.getTime() - mondayOffset * 864e5);
  const total = daysBetween(iso(gridStart), c.through);
  const weeks = Math.ceil(total / 7);
  const cell = 11, gap = 3, left = 4, top = 18;
  const width = left + weeks * (cell + gap) + 4;
  const height = top + 7 * (cell + gap) + 4;
  const max = Math.max(...Object.values(c.by_day));
  const out = [];
  let lastMonth = -1;
  const labels = [];
  for (let i = 0; i < total; i++) {
    const t = new Date(gridStart.getTime() + i * 864e5);
    const d = iso(t);
    const w = Math.floor(i / 7), dow = i % 7;
    const x = left + w * (cell + gap), y = top + dow * (cell + gap);
    if (dow === 0 && t.getUTCMonth() !== lastMonth && d >= c.since) {
      lastMonth = t.getUTCMonth();
      labels.push({ w, x, m: lastMonth });
    }
    if (d < c.since || d > c.through) continue;
    const n = c.by_day[d] ?? 0;
    out.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${colours[level(n, max)]}"><title>${d}: ${n} merged</title></rect>`);
  }
  // A month label within three columns of the next one would print on top of it, so the earlier one gives way.
  for (const [i, l] of labels.entries()) {
    if (i + 1 < labels.length && labels[i + 1].w - l.w < 3) continue;
    out.push(`<text x="${l.x}" y="11" font-size="9" fill="#8b949e" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">${MONTHS[l.m]}</text>`);
  }
  const label = `${fmt(c.merged_changes)} changes merged into Unl's main branch from ${longDate(c.since)} to ${longDate(c.through)}, by day`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><title>${label}</title>${out.join("")}</svg>\n`;
}

/** The words beside the picture. Each number says what it counts. */
export function renderBlock(c) {
  const span = daysBetween(c.since, c.through);
  return [
    START,
    `**${fmt(c.merged_changes)} changes merged** into Unl's main branch since ${longDate(c.since)}, on ${fmt(c.active_days)} of the ${fmt(span)} days since.`,
    "",
    `![${fmt(c.merged_changes)} changes merged into Unl's main branch, one square per day](https://raw.githubusercontent.com/Unlimitless-Inc/.github/main/profile/cadence.svg)`,
    "",
    `<sub>Each change that landed on the main branch of Unl's private engine repository counts once, by UTC day: a merged pull request is one change, however many commits it held. Only these counts and dates leave it; the code stays private. Read ${longDate(c.as_of.slice(0, 10))}. What each change did, in plain words: <a href="https://unlimitless.ai/changelog">the changelog</a>.</sub>`,
    END,
  ].join("\n");
}

export function spliceReadme(readme, block) {
  const a = readme.indexOf(START), b = readme.indexOf(END);
  if (a < 0 || b < a) throw new Error("profile/README.md has no cadence markers");
  return readme.slice(0, a) + block + readme.slice(b + END.length);
}

async function main() {
  const res = await fetch(FEED, { headers: { accept: "application/json" } });
  const body = res.ok ? await res.json().catch(() => null) : null;
  const c = validate(body);
  if (!c) { console.error(`cadence: the feed answered ${res.status} without a usable cadence; nothing was drawn`); process.exit(1); }
  writeFileSync("profile/cadence.svg", renderSvg(c));
  writeFileSync("profile/README.md", spliceReadme(readFileSync("profile/README.md", "utf8"), renderBlock(c)));
  console.log(`cadence: ${c.merged_changes} merged changes, ${c.since} to ${c.through}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
