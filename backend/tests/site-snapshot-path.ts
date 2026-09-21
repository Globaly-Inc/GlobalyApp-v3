/**
 * snapshotPathFor — GCS object path for a site-snapshot page (one file per page, per site).
 * Pure. Run: npm run test:site-snapshot-path
 *
 * The readable half of the name is deliberately lossy, so the test asserts the readable PREFIX
 * plus the property that lossiness would otherwise destroy: two different pages never share an
 * object path, because an upload overwrites and one page's snapshot would be silently lost.
 */
import { fileLinksOf, snapshotPathFor, snapshotVerdict, tallySnapshotEvents } from "../src/modules/superadmin/data-extraction/lib/site-snapshot.js";
import type { SnapshotEventRow } from "../src/modules/superadmin/data-extraction/lib/site-snapshot.js";

let failed = 0;
function fail(msg: string) { failed++; console.error(`FAIL ${msg}`); }

function startsWith(url: string, expected: string) {
  const got = snapshotPathFor(url);
  if (!got.startsWith(expected)) fail(`${url}\n  expected prefix ${expected}\n  got             ${got}`);
  if (!got.endsWith(".md")) fail(`${url} — path does not end in .md: ${got}`);
}

startsWith("https://www.mit.edu/", "extraction/www/mit.edu/mit.edu/index-");
startsWith("https://catalog.mit.edu/about/overview/", "extraction/www/mit.edu/catalog.mit.edu/about_overview-");
startsWith("https://www.ox.ac.uk/Admissions/Fees.aspx?year=2027", "extraction/www/ox.ac.uk/ox.ac.uk/admissions_fees-");
startsWith("https://som.ku.edu.np/programs/MBA%20(Evening)", "extraction/www/ku.edu.np/som.ku.edu.np/programs_mba-evening-");
startsWith("https://example.edu/a//b/index.html#top", "extraction/www/example.edu/example.edu/a_b_index-");

// A rerun must overwrite the same page's own file rather than accumulate copies, so spellings
// that normalise to one page must land on one path — fragment and tracking params are
// presentation, not identity.
const canonical = snapshotPathFor("https://example.edu/x");
for (const samePage of ["https://example.edu/x#section", "https://example.edu/x?utm_source=news", "https://www.example.edu/x"]) {
  if (snapshotPathFor(samePage) !== canonical) fail(`${samePage} forked a second snapshot file: ${snapshotPathFor(samePage)} != ${canonical}`);
}

// Distinct pages that the readable slug alone collapses onto one name.
const distinct: [string, string, string][] = [
  ["punctuation", "https://example.edu/a-b", "https://example.edu/a_b"],
  ["pagination", "https://example.edu/courses?page=1", "https://example.edu/courses?page=2"],
  ["case", "https://example.edu/Physics", "https://example.edu/physics"],
  ["past the 180-char truncation", `https://example.edu/${"x".repeat(200)}1`, `https://example.edu/${"x".repeat(200)}2`],
];
for (const [label, a, b] of distinct) {
  if (snapshotPathFor(a) === snapshotPathFor(b)) fail(`${label}: distinct pages share one object path — ${snapshotPathFor(a)}`);
}

const files = fileLinksOf([
  "https://x.edu/brochure.pdf", "https://x.edu/logo.png?v=2", "https://x.edu/brochure.pdf",
  "https://x.edu/about/", "https://x.edu/app.js", "https://x.edu/fees.xlsx#sheet1",
]);
const wantFiles = ["https://x.edu/brochure.pdf", "https://x.edu/logo.png?v=2", "https://x.edu/fees.xlsx#sheet1"];
if (JSON.stringify(files) !== JSON.stringify(wantFiles)) fail(`fileLinksOf\n  got ${JSON.stringify(files)}`);

// Batch bookkeeping: batches run concurrently, so the step is only done once every batch of this
// run has reported, and one batch's failure is not erased by a later batch's success. The first
// argument is DISTINCT batches heard from — at-least-once delivery means one batch can write two
// events, and counting rows would let a duplicate stand in for a batch still outstanding.
const verdicts: [string, "done" | "failed" | "pending", "done" | "failed" | "pending"][] = [
  ["first of 8 batches home", snapshotVerdict(1, 0, 8), "pending"],
  ["7 of 8 home", snapshotVerdict(7, 0, 8), "pending"],
  ["all 8 clean", snapshotVerdict(8, 0, 8), "done"],
  ["all 8 home, one threw", snapshotVerdict(8, 1, 8), "failed"],
  // An errored batch is itself one of the batches heard from, so 7 reported means the 8th is
  // genuinely still running — summing uploads and errors instead would call this complete.
  ["7 heard from incl. one error, 8th outstanding", snapshotVerdict(7, 1, 8), "pending"],
  ["failure not erased by later successes", snapshotVerdict(9, 1, 8), "failed"],
  ["single unbatched run", snapshotVerdict(1, 0, 1), "done"],
];
for (const [label, got, want] of verdicts) {
  if (got !== want) fail(`snapshotVerdict ${label}: expected ${want}, got ${got}`);
}

// Delivery is at-least-once: a worker that dies between writing its event and acking gets the
// batch redelivered, writing a second event for the same index. Counting rows would let that
// duplicate stand in for a batch still outstanding and finish the step early.
const RUN = "run-a", OTHER = "run-b";
const ev = (id: string, kind: string, index?: number, phase = "site_snapshot", runId: string | undefined = RUN): SnapshotEventRow =>
  ({ id, kind, phase, data: index == null ? { runId } : { runId, index, total: 8 } });

const tallies: [string, { reported: number; errored: number }, { reported: number; errored: number }][] = [
  ["three distinct batches", tallySnapshotEvents([ev("a", "site_snapshot_uploaded", 1), ev("b", "site_snapshot_uploaded", 2), ev("c", "site_snapshot_uploaded", 3)], RUN), { reported: 3, errored: 0 }],
  ["redelivered batch 2 counts once", tallySnapshotEvents([ev("a", "site_snapshot_uploaded", 1), ev("b", "site_snapshot_uploaded", 2), ev("c", "site_snapshot_uploaded", 2)], RUN), { reported: 2, errored: 0 }],
  ["batch that errored then succeeded is one batch, still errored", tallySnapshotEvents([ev("a", "step_error", 1), ev("b", "site_snapshot_uploaded", 1)], RUN), { reported: 1, errored: 1 }],
  // A batch that saw the job paused/stopped exits early and still writes its event (so the admin
  // sees where it stopped) — but it did NOT finish its pages, so it must not read as a success.
  ["a halted batch counts as errored, not done", tallySnapshotEvents([
    ev("a", "site_snapshot_uploaded", 1), { id: "b", kind: "site_snapshot_uploaded", phase: "site_snapshot", data: { runId: RUN, index: 2, total: 8, halted: true } },
  ], RUN), { reported: 2, errored: 1 }],
  ["another step's error is not ours", tallySnapshotEvents([ev("a", "site_snapshot_uploaded", 1), ev("b", "step_error", 2, "courses")], RUN), { reported: 1, errored: 0 }],
  ["indexless events do not collapse onto one key", tallySnapshotEvents([ev("a", "site_snapshot_uploaded"), ev("b", "site_snapshot_uploaded")], RUN), { reported: 2, errored: 0 }],
  // Two dispatches for one job overlap (the job worker tolerates a second message for a job
  // already "processing"), and both number their batches 1..N. An overlapping run's events must
  // neither satisfy this run's count nor collapse onto this run's batch keys.
  ["an overlapping run's batches are not ours", tallySnapshotEvents([
    ev("a", "site_snapshot_uploaded", 1), ev("b", "site_snapshot_uploaded", 2, "site_snapshot", OTHER),
    ev("c", "site_snapshot_uploaded", 3, "site_snapshot", OTHER),
  ], RUN), { reported: 1, errored: 0 }],
  ["an overlapping run's failure is not ours", tallySnapshotEvents([
    ev("a", "site_snapshot_uploaded", 1), ev("b", "step_error", 1, "site_snapshot", OTHER),
  ], RUN), { reported: 1, errored: 0 }],
  // An event written before runId existed has no runId KEY at all, and an in-flight message from
  // that build has no runId either — both read as undefined, so they still pair with each other
  // and behave as they did. That is the deploy window, and it needs no special case.
  ["pre-runId events still tally for a pre-runId message", tallySnapshotEvents([
    { id: "a", kind: "site_snapshot_uploaded", phase: "site_snapshot", data: { index: 1, total: 8 } },
    { id: "b", kind: "site_snapshot_uploaded", phase: "site_snapshot", data: { index: 2, total: 8 } },
  ], undefined), { reported: 2, errored: 0 }],
  ["a pre-runId event does not count toward a current run", tallySnapshotEvents([
    { id: "a", kind: "site_snapshot_uploaded", phase: "site_snapshot", data: { index: 1, total: 8 } },
  ], RUN), { reported: 0, errored: 0 }],
];
for (const [label, got, want] of tallies) {
  if (got.reported !== want.reported || got.errored !== want.errored) {
    fail(`tallySnapshotEvents ${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

if (failed) process.exit(1);
console.log("site-snapshot-path: all passed");
