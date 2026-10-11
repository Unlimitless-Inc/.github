// Checks that the cadence on the organisation's front page is current, by reading the page as a visitor does.
//
// The daily job (cadence.yml) cannot report its own silence: if it fails, or never runs, the last picture just
// stays. So this separate check reads the published README and picture, and fails when either is more than a
// day old or when the latest scheduled redraw did not succeed. Its badge sits beside the picture, so a stale
// page shows red to anyone who looks, and a failed run is the ordinary GitHub notice to the repository's owners.
// It reads only this public repository and GitHub's own record of its runs; no secret is used.

const RAW = "https://raw.githubusercontent.com/Unlimitless-Inc/.github/main/profile";
const RUNS = "https://api.github.com/repos/Unlimitless-Inc/.github/actions/workflows/cadence.yml/runs?event=schedule&per_page=1";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 864e5;

/** "11 October 2026" to "2026-10-11"; anything else is null. */
export function parseLongDate(s) {
  const m = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(s ?? "");
  const mo = m ? MONTHS.indexOf(m[2]) : -1;
  if (mo < 0) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** The day the README says it last read, and the last day the picture draws. Null where a page does not say. */
export function readDates(readme, svg) {
  const read = parseLongDate(/last read (\d{1,2} [A-Z][a-z]+ \d{4})\./.exec(readme ?? "")?.[1]);
  const drawn = parseLongDate(/<title>[^<]* to (\d{1,2} [A-Z][a-z]+ \d{4}), by day<\/title>/.exec(svg ?? "")?.[1]);
  return { read, drawn };
}

/** Every reason the page is not current, in one plain line each. Empty means current. */
export function verdict({ read, drawn, lastRun }, today) {
  const faults = [];
  const ageDays = (d) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / DAY_MS);
  if (!read) faults.push("the front page does not say when it was last read");
  else if (ageDays(read) > 1) faults.push(`the front page says it was last read on ${read}, ${ageDays(read)} days before ${today}`);
  if (!drawn) faults.push("the picture does not say which day it draws to");
  else if (ageDays(drawn) > 1) faults.push(`the picture draws to ${drawn}, ${ageDays(drawn)} days before ${today}`);
  if (lastRun && lastRun.status === "completed" && lastRun.conclusion !== "success") {
    faults.push(`the last scheduled redraw (${lastRun.created_at}) ended ${lastRun.conclusion}: ${lastRun.html_url}`);
  }
  return faults;
}

async function text(url) {
  const res = await fetch(url, { cache: "no-store" });
  return res.ok ? res.text() : null;
}

async function main() {
  const [readme, svg] = await Promise.all([text(`${RAW}/README.md`), text(`${RAW}/cadence.svg`)]);
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const runs = await fetch(RUNS, { headers });
  if (!runs.ok) { console.error(`cadence-fresh: GitHub answered ${runs.status} for the run record; the page is not proven current`); process.exit(1); }
  const lastRun = (await runs.json()).workflow_runs?.[0] ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const { read, drawn } = readDates(readme, svg);
  const faults = verdict({ read, drawn, lastRun }, today);
  console.log(`cadence-fresh: today ${today}; page last read ${read ?? "unknown"}; picture draws to ${drawn ?? "unknown"}; last scheduled redraw ${lastRun ? `${lastRun.created_at} ${lastRun.status} ${lastRun.conclusion ?? ""}`.trim() : "none on record"}`);
  if (faults.length) { for (const f of faults) console.error(`cadence-fresh: STALE: ${f}`); process.exit(1); }
  console.log("cadence-fresh: current");
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
