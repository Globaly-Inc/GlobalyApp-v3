/**
 * Chunker test — asserts chunkMarkdown() splits on headings, carries the heading
 * breadcrumb, merges thin sections, never splits a markdown table without repeating
 * its header, and tracks PDF page markers.
 * Run: node --import tsx tests/chunker.ts   (or: npm run test:chunker)
 *
 * Style matches tests/scraper-cascade.ts: plain tsx script, manual counters, no framework.
 */

import { chunkMarkdown, embedTextFor, normaliseMarkdown } from "../src/modules/superadmin/ai-knowledge/lib/chunker.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  assert(actual === expected, label, { actual, expected });
}

/** ~n tokens of filler prose (4 chars ≈ 1 token). */
const filler = (tokens: number) => "word ".repeat(Math.ceil((tokens * 4) / 5)).trim();

// 1. Heading breadcrumb — a nested section carries its full ancestry.
{
  const md = [
    "# Nepal — Domestic Education System",
    "",
    filler(300),
    "",
    "## 1. Overview",
    "",
    filler(300),
    "",
    "### 1.1 Governing authority",
    "",
    filler(700),
  ].join("\n");

  const chunks = chunkMarkdown(md);
  assert(chunks.length >= 2, "splits a multi-section document", chunks.length);

  const deepest = chunks.find((c) => c.content.includes("1.1 Governing authority"));
  assertEqual(
    deepest?.heading_path,
    "Nepal — Domestic Education System > 1. Overview > 1.1 Governing authority",
    "heading_path is the full breadcrumb of enclosing headings",
  );
  assert(
    chunks.every((c) => c.token_count > 0 && c.content.trim().length > 0),
    "no empty chunks",
  );
}

// 2. Size budget — nothing exceeds the hard ceiling.
{
  const md = ["# Big", "", filler(4000)].join("\n");
  const chunks = chunkMarkdown(md);
  assert(chunks.length > 1, "a long section becomes several chunks", chunks.length);
  assert(chunks.every((c) => c.token_count <= 800), "every chunk is within the token ceiling",
    chunks.map((c) => c.token_count));
}

// 3. Thin sections merge instead of becoming one-line chunks.
{
  const md = Array.from({ length: 12 }, (_, i) => `## Section ${i}\n\n${filler(30)}`).join("\n\n");
  const chunks = chunkMarkdown(md);
  assert(chunks.length < 12, "twelve thin sections do not become twelve chunks", chunks.length);
  assert(chunks.every((c) => c.token_count >= 100), "merged chunks clear the thin-fragment floor",
    chunks.map((c) => c.token_count));
}

// 4. Tables stay intact — and an oversized table repeats its header per piece.
{
  const header = "| Item | Detail | Verification |\n|------|--------|--------------|";
  const rows = Array.from({ length: 200 }, (_, i) => `| Ministry ${i} | Detail ${i} ${filler(8)} | confirmed |`);
  const md = ["# Authorities", "", header, ...rows].join("\n");

  const chunks = chunkMarkdown(md);
  const tableChunks = chunks.filter((c) => c.content.includes("|"));
  assert(tableChunks.length > 1, "an oversized table is split across chunks", tableChunks.length);
  assert(
    tableChunks.every((c) => c.content.includes("| Item | Detail | Verification |")),
    "every table chunk repeats the header row",
  );
  assert(
    tableChunks.every((c) => !/\n\|[^\n]*$/.test(c.content) || c.content.trimEnd().endsWith("|")),
    "no chunk ends mid-row",
  );
}

// 5. A table small enough to fit is never broken up.
{
  const md = [
    "# Small table",
    "",
    "| A | B |",
    "|---|---|",
    "| 1 | 2 |",
    "| 3 | 4 |",
  ].join("\n");
  const chunks = chunkMarkdown(md);
  assertEqual(chunks.length, 1, "a small table stays in one chunk");
  assert(chunks[0].content.includes("| 3 | 4 |"), "the last row survives");
}

// 6. Page markers from the PDF extractor become page_number.
{
  const md = [
    "<!-- page 1 -->",
    "# Fees",
    "",
    filler(700),
    "",
    "<!-- page 7 -->",
    "## Maintenance funds",
    "",
    filler(700),
  ].join("\n");

  const chunks = chunkMarkdown(md);
  assert(chunks.some((c) => c.page_number === 1), "first section is attributed to page 1",
    chunks.map((c) => c.page_number));
  assert(chunks.some((c) => c.page_number === 7), "later section is attributed to page 7",
    chunks.map((c) => c.page_number));
  assert(chunks.every((c) => !c.content.includes("<!-- page")), "page markers are stripped from content");
}

// 7. Overlap — consecutive chunks of one long section share a tail.
{
  const paragraphs = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}. ${filler(60)}`);
  const chunks = chunkMarkdown(["# Overlapping", "", ...paragraphs].join("\n\n"));
  assert(chunks.length > 2, "long prose splits", chunks.length);
  const shared = chunks.slice(1).some((c, i) => {
    const prevTail = chunks[i].content.slice(-120);
    return prevTail.length > 0 && c.content.includes(prevTail.split("\n").pop()!.slice(0, 40));
  });
  assert(shared, "at least one boundary carries overlap from the previous chunk");
}

// 8. Heading-less input still chunks (paragraph packing fallback).
{
  const chunks = chunkMarkdown(Array.from({ length: 10 }, () => filler(200)).join("\n\n"));
  assert(chunks.length > 1, "heading-less text is packed into multiple chunks", chunks.length);
  assert(chunks.every((c) => c.heading_path === null), "heading_path is null with no headings");
}

// 9. Degenerate inputs return nothing rather than an empty vector.
{
  assertEqual(chunkMarkdown("").length, 0, "empty input yields no chunks");
  assertEqual(chunkMarkdown("   \n\n  ").length, 0, "whitespace-only input yields no chunks");
  assertEqual(chunkMarkdown("# Heading with no body").length, 0, "heading-only input yields no chunks");
}

// 10. Normalisation keeps headings verbatim and drops non-page comments.
{
  const out = normaliseMarkdown("# Title\r\n\r\n<!-- editorial note -->\r\n\r\n<!-- page 3 -->\r\n\r\nBody");
  assert(out.includes("# Title"), "heading survives normalisation");
  assert(!out.includes("editorial note"), "HTML comments are stripped");
  assert(out.includes("<!-- page 3 -->"), "page markers survive normalisation");
  assert(!out.includes("\r"), "CRLF is normalised");
}

// 11. Embedded text locates a chunk by breadcrumb, not by document title.
{
  const title = "United States — Domestic Education System";
  const withPath = embedTextFor("AA, AS and AAS.", "9.2 Degree structure", title);
  assert(withPath.startsWith("9.2 Degree structure\n\n"), "breadcrumb leads the embedded text");
  assert(
    !withPath.includes(title),
    "document title is NOT repeated on a chunk that already has a breadcrumb",
    withPath,
  );

  // Unstructured docs have no breadcrumb — the title is the only locator left.
  assertEqual(
    embedTextFor("Body text.", null, title),
    `${title}\n\nBody text.`,
    "title is used when there is no breadcrumb",
  );
  assertEqual(embedTextFor("Body text.", "   ", title), `${title}\n\nBody text.`,
    "blank breadcrumb falls back to the title");
  assertEqual(embedTextFor("Body text."), "Body text.", "no prefix at all leaves the body untouched");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
