/**
 * truncateMarkdown() junk-stripping test — the cleanup exists to cut billed input tokens,
 * but extraction quality depends on real URLs, link text, and table rows surviving
 * VERBATIM. Half of these assertions pin what must be removed; the other half pin what
 * must never be touched.
 * Run: node --import tsx tests/markdown-cleanup.ts
 */
let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

async function main() {
  const { truncateMarkdown } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");

  // ── Junk that must be stripped ──
  const base64 = "before ![logo](data:image/png;base64," + "A".repeat(500) + ") after";
  const b64Out = truncateMarkdown(base64);
  assert(!b64Out.includes("AAAA"), "base64 payload is stripped");
  assert(b64Out.includes("before") && b64Out.includes("after"), "text around a base64 image survives");

  assert(!truncateMarkdown("a\n<!-- tracking\ncomment -->\nb").includes("tracking"), "HTML comments are stripped");

  assert(truncateMarkdown("a\n\n\n\n\nb") === "a\n\nb", "blank-line runs collapse to one blank line");

  const nav = "Home | Courses | Contact";
  const repeated = `${nav}\n${nav}\n${nav}\nreal content`;
  const navOut = truncateMarkdown(repeated);
  assert(navOut.split(nav).length - 1 === 1, "consecutive identical lines are deduped to one");
  assert(navOut.includes("real content"), "content after deduped lines survives");

  // ── Information that must survive verbatim ──
  const link = "[BSc Computer Science](https://uni.edu/courses/bsc-cs?year=2026&fee=503)";
  assert(truncateMarkdown(`intro\n${link}\noutro`).includes(link), "course links (text + full URL, query params included) survive verbatim");

  const table = "| Fee | Amount |\n|---|---|\n| Domestic | $5,030 |\n| International | $25,000 |";
  assert(truncateMarkdown(table) === table, "tables survive verbatim");

  const spaced = "Fees: $25,000 per year\nDuration: 3 years\n\nFees: $25,000 per year";
  assert(truncateMarkdown(spaced).split("Fees: $25,000 per year").length - 1 === 2, "non-consecutive duplicate lines (legit recurring rows) are kept");

  // ── Truncation behavior unchanged ──
  const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");
  const cutAt = 100;
  const truncated = truncateMarkdown(long, cutAt);
  assert(truncated.length <= cutAt, "long markdown is cut to maxLength");
  assert(long.startsWith(truncated + "\n"), "cut lands on a line boundary");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
