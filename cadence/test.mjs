import assert from "node:assert/strict";
import { validate, renderSvg, renderBlock, spliceReadme, FRESH_BADGE } from "./cadence.mjs";
import { parseLongDate, readDates, verdict } from "./fresh.mjs";
import { due, DRAW, FRESH } from "./relay.mjs";

const good = { available: true, cadence: { schema: "unl-build-cadence/1", counts: "x", since: "2026-05-23", through: "2026-06-02", as_of: "2026-06-02T10:00:00Z", merged_changes: 7, active_days: 3, by_day: { "2026-05-23": 2, "2026-05-30": 1, "2026-06-02": 4 } } };
const c = validate(good);
assert.ok(c, "a good feed validates");

// Red arms: nothing that was not read is ever drawn.
const bad = (patch) => validate({ available: true, cadence: { ...good.cadence, ...patch } });
assert.equal(validate({ available: false }), null, "an unavailable feed draws nothing");
assert.equal(bad({ merged_changes: 8 }), null, "a total that is not the sum of the days is refused");
assert.equal(bad({ active_days: 4 }), null, "active days must match the days given");
assert.equal(bad({ by_day: { ...good.cadence.by_day, "2026-07-01": 1 }, merged_changes: 8, active_days: 4 }), null, "a day outside the window is refused");
assert.equal(bad({ schema: "other/1" }), null, "an unknown schema is refused");
assert.equal(bad({ by_day: { "2026-05-23": 0, "2026-05-30": 3, "2026-06-02": 4 } }), null, "a zero day is not a landing");

const svg = renderSvg(c);
assert.equal((svg.match(/<rect /g) ?? []).length, 11, "one square per day from since to through");
assert.ok(svg.includes("<title>2026-06-02: 4 merged</title>"), "each square says its own count");
assert.ok(svg.includes('aria-label="7 changes merged'), "the picture is labelled with what it counts");

const block = renderBlock(c);
assert.ok(block.includes("**7 changes merged** into Unl's main branch since 23 May 2026, on 3 of the 11 days since."), block);
assert.ok(block.includes("a merged pull request is one change, however many commits it held"), "the block says exactly what is counted");
assert.ok(!/[–—]/.test(block + svg), "no dashes in public words");

const readme = "# Top\n\n<!-- cadence:start -->\nold\n<!-- cadence:end -->\n\nrest\n";
const spliced = spliceReadme(readme, block);
assert.ok(spliced.startsWith("# Top\n\n<!-- cadence:start -->") && spliced.endsWith("<!-- cadence:end -->\n\nrest\n") && !spliced.includes("old"));
assert.throws(() => spliceReadme("no markers", block), /no cadence markers/);

// Month labels never print on top of each other.
const wide = validate({ available: true, cadence: { ...good.cadence, since: "2026-05-23", through: "2026-07-20", merged_changes: 2, active_days: 2, by_day: { "2026-05-23": 1, "2026-07-20": 1 } } });
const xs = [...renderSvg(wide).matchAll(/<text x="(\d+)"/g)].map((m) => Number(m[1]));
assert.ok(xs.every((x, i) => i === 0 || x - xs[i - 1] >= 3 * 14), `labels too close: ${xs}`);

// The page says it is redrawn daily, and carries the badge of the check that goes red when it is not.
assert.ok(block.includes("Redrawn every day at 06:17 UTC; last read 2 June 2026."), block);
assert.ok(block.includes(FRESH_BADGE), "the freshness badge sits beside the picture");

// The freshness check reads back exactly what the job writes.
assert.equal(parseLongDate("2 June 2026"), "2026-06-02");
assert.equal(parseLongDate("2 Juin 2026"), null);
const dates = readDates(block, svg);
assert.deepEqual(dates, { read: "2026-06-02", drawn: "2026-06-02" }, JSON.stringify(dates));
const ok = { status: "completed", conclusion: "success" };
assert.deepEqual(verdict({ ...dates, lastRun: ok }, "2026-06-02"), [], "same day is current");
assert.deepEqual(verdict({ ...dates, lastRun: ok }, "2026-06-03"), [], "a day old is current");
assert.deepEqual(verdict({ ...dates, lastRun: null }, "2026-06-03"), [], "no daily run yet is judged by the dates alone");
// Red arms: a stale page, a page that does not say, and a failed run each fail, whatever else is true.
assert.equal(verdict({ ...dates, lastRun: ok }, "2026-06-04").length, 2, "two days old is stale, page and picture both");
assert.equal(verdict({ read: null, drawn: null, lastRun: ok }, "2026-06-02").length, 2, "a page that does not say its date is not current");
assert.equal(verdict({ ...readDates("Read 10 October 2026.", svg), lastRun: ok }, "2026-06-02").length, 1, "the old wording without the daily label is not current");
const failed = verdict({ ...dates, lastRun: { status: "completed", conclusion: "failure", created_at: "t", html_url: "u" } }, "2026-06-02");
assert.equal(failed.length, 1, "a failed daily redraw is stale even when the dates are fresh");
assert.deepEqual(verdict({ ...dates, lastRun: { status: "in_progress", conclusion: null } }, "2026-06-02"), [], "a redraw still running is not a failure");
assert.ok(!/[–—]/.test(block), "no dashes in public words");

// The relay starts each job when it is due and has not run, whoever else started it, and never twice.
const at = (t) => Date.parse(`2026-10-11T${t}:00Z`);
const run = (t, event = "workflow_dispatch", status = "completed", conclusion = "success") => ({ created_at: `2026-10-11T${t}:00Z`, event, status, conclusion });
assert.deepEqual(due(at("05:00"), [], []), [], "before 06:17 nothing is due");
assert.deepEqual(due(at("06:20"), [], []), [DRAW.file], "after 06:17 with no run today, the redraw is due");
assert.deepEqual(due(at("06:20"), [run("06:17", "schedule")], []), [], "a run GitHub's scheduler did start counts");
assert.deepEqual(due(at("06:30"), [run("06:20", "workflow_dispatch", "in_progress", null)], []), [], "a redraw still running is not started again");
assert.deepEqual(due(at("06:30"), [run("06:20", "push")], []), [DRAW.file], "a test push is not the day's redraw");
assert.deepEqual(due(at("06:30"), [run("05:59")], []), [DRAW.file], "a run before 06:17 is not today's redraw");
assert.deepEqual(due(at("06:40"), [run("06:20", "workflow_dispatch", "completed", "failure")], []), [DRAW.file], "a failed redraw is tried again");
const thrice = [run("06:20", "workflow_dispatch", "completed", "failure"), run("06:30", "workflow_dispatch", "completed", "failure"), run("06:40", "workflow_dispatch", "completed", "failure")];
assert.deepEqual(due(at("07:00"), thrice, []), [], "three failures in a day stop the retries; the freshness check says it");
assert.deepEqual(due(at("07:50"), [run("06:20")], []), [FRESH.file], "after 07:47 the freshness check is due");
assert.deepEqual(due(at("07:50"), [run("06:20")], [run("07:48", "schedule")]), [], "the morning check runs once");
assert.deepEqual(due(at("19:50"), [run("06:20")], [run("07:48")]), [FRESH.file], "after 19:47 it is due again");
assert.deepEqual(due(at("23:59"), [run("06:20")], [run("07:48"), run("19:50")]), [], "and then not again that day");
assert.deepEqual(due(at("08:00"), [], []), [DRAW.file, FRESH.file], "a relay that starts late starts both");

console.log("cadence: all checks passed");
