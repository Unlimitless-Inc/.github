// Starts the daily redraw and the freshness check when they are due, without leaning on GitHub's scheduler.
//
// Why: on a quiet repository GitHub runs a `schedule:` trigger a few times a day at best. On 11 October 2026 neither
// the 06:17 redraw nor the 07:47 check ran at all, so the page kept saying 10 October and the check that should have
// gone red never ran to say so. The relay (.github/workflows/relay.yml) calls this every ten minutes; it reads
// GitHub's own record of today's runs and starts whichever job is due and has not run. A workflow started with this
// repository's own token is the one start that token is allowed, so no secret is added.
//
// Due means: the redraw once a day from 06:17 UTC, tried again (at most three times a day) only when every attempt
// so far today failed; the freshness check once after each of 07:47 and 19:47 UTC. A run GitHub's scheduler did
// start counts, so the two never double up.

const REPO = "Unlimitless-Inc/.github";
const API = `https://api.github.com/repos/${REPO}/actions/workflows`;
export const DRAW = { file: "cadence.yml", at: "06:17", attempts: 3 };
export const FRESH = { file: "cadence-fresh.yml", slots: ["07:47", "19:47"] };

/** The instant `hh:mm` UTC falls on the day of `now`, in ms. */
const slotMs = (now, hhmm) => Date.parse(`${new Date(now).toISOString().slice(0, 10)}T${hhmm}:00Z`);

/** Runs that a person or a test push did not start: the ones that answer "did today's job run". */
const unattended = (runs) => runs.filter((r) => r.event !== "push");

/**
 * Which workflow files are due now, given each workflow's recent runs (GitHub's shape: event, status,
 * conclusion, created_at). Pure, so the test can hold every case.
 */
export function due(now, drawRuns, freshRuns) {
  const out = [];
  const drawFrom = slotMs(now, DRAW.at);
  if (now >= drawFrom) {
    const today = unattended(drawRuns).filter((r) => Date.parse(r.created_at) >= drawFrom);
    const settled = today.some((r) => r.status !== "completed" || r.conclusion === "success");
    if (!settled && today.length < DRAW.attempts) out.push(DRAW.file);
  }
  const slot = FRESH.slots.map((s) => slotMs(now, s)).filter((t) => now >= t).pop();
  if (slot !== undefined && !unattended(freshRuns).some((r) => Date.parse(r.created_at) >= slot)) out.push(FRESH.file);
  return out;
}

async function gh(path, init = {}) {
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${process.env.GITHUB_TOKEN}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const now = Date.now();
  const runs = async (file) => (await gh(`${file}/runs?per_page=30`)).workflow_runs ?? [];
  const [drawRuns, freshRuns] = await Promise.all([runs(DRAW.file), runs(FRESH.file)]);
  const start = due(now, drawRuns, freshRuns);
  for (const file of start) {
    await gh(`${file}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main" }) });
    console.log(`relay: started ${file} at ${new Date(now).toISOString()}`);
  }
  if (!start.length) console.log(`relay: nothing due at ${new Date(now).toISOString()}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
