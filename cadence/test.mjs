import assert from "node:assert/strict";
import { validate, renderSvg, renderBlock, spliceReadme } from "./cadence.mjs";

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

console.log("cadence: all checks passed");
