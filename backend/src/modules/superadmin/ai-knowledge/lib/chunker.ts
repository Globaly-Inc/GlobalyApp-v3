// Heading-aware markdown chunker for the Knowledge Rack.
//
// One vector per section instead of per document: a 9,000-word visa page stops
// averaging its fees, work rights and maintenance funds into a single meaningless
// embedding, and the retrieved section reaches the model whole.
//
// Two structures are treated as atomic because splitting them destroys them:
// markdown tables (a row without its header row is unreadable — and the research
// docs are table-dense) and fenced code blocks. A table too large for one chunk is
// split by rows with the header repeated in every piece.

/** tokens ≈ chars / 4 — good enough for a size budget, and free. */
const tokensIn = (text: string): number => Math.ceil(text.length / 4);

const TARGET_TOKENS = 650; // aim
const MAX_TOKENS = 800; // hard ceiling per chunk
const MIN_FLUSH_TOKENS = 250; // below this, keep merging adjacent sections
const OVERLAP_RATIO = 0.1;

// Written without nested quantifiers on purpose — these run over every line of a
// 130KB document, so a backtracking pattern is a real cost, not a style note.
const PAGE_MARKER = /^<!-- *page +(\d+) *-->$/i;
const HEADING = /^(#{1,6}) +(\S.*)$/;
const TABLE_ROW = /^ {0,3}\|/;
const FENCE = /^\s*(?:```|~~~)/;

export interface Chunk {
  content: string;
  heading_path: string | null;
  page_number: number | null;
  token_count: number;
}

type Unit =
  | { kind: "heading"; level: number; text: string; raw: string; page: number | null }
  | { kind: "table"; raw: string; page: number | null }
  | { kind: "block"; raw: string; page: number | null };

/**
 * Collapse CRLF, drop HTML comments (page markers survive — they carry attribution),
 * cap blank runs. Headings are left byte-for-byte: they become heading_path.
 */
export function normaliseMarkdown(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/<!--(?!\s*page\s+\d+\s*-->)[\s\S]*?-->/g, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Group lines into headings, tables, fenced blocks and paragraphs. */
function parseUnits(markdown: string): Unit[] {
  const lines = markdown.split("\n");
  const units: Unit[] = [];
  let page: number | null = null;
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    const raw = buffer.join("\n").trim();
    if (raw) units.push({ kind: "block", raw, page });
  };

  let paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    const trimmed = line.trim();
    const marker = PAGE_MARKER.exec(trimmed);
    if (marker) {
      flushParagraph(paragraph);
      paragraph = [];
      page = Number(marker[1]);
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph(paragraph);
      paragraph = [];
      // Closing hashes ("## Title ##") are decoration, not part of the name.
      const text = heading[2].replace(/ *#+$/, "").trim();
      units.push({ kind: "heading", level: heading[1].length, text, raw: trimmed, page });
      i++;
      continue;
    }

    if (FENCE.test(line)) {
      flushParagraph(paragraph);
      paragraph = [];
      const fence: string[] = [line];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) fence.push(lines[i++]);
      if (i < lines.length) fence.push(lines[i++]); // closing fence
      units.push({ kind: "block", raw: fence.join("\n"), page });
      continue;
    }

    if (TABLE_ROW.test(line) && trimmed.endsWith("|")) {
      flushParagraph(paragraph);
      paragraph = [];
      const table: string[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]) && lines[i].trimEnd().endsWith("|")) table.push(lines[i++]);
      units.push({ kind: "table", raw: table.join("\n"), page });
      continue;
    }

    if (!trimmed) {
      flushParagraph(paragraph);
      paragraph = [];
      i++;
      continue;
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph(paragraph);
  return units;
}

/** Last resort for a single unsplittable line — cut on the character budget. */
function hardWrap(text: string, maxTokens: number): string[] {
  const size = maxTokens * 4;
  const pieces: string[] = [];
  for (let at = 0; at < text.length; at += size) pieces.push(text.slice(at, at + size));
  return pieces;
}

/** Split an oversized table into row groups, repeating the header in each piece. */
function splitTable(raw: string, maxTokens: number): string[] {
  const rows = raw.split("\n");
  // A markdown table is header + separator + body. Without a separator there is no
  // header to repeat, so fall back to plain line packing.
  const hasHeader = rows.length > 2 && /^\s*\|[\s:|-]+\|\s*$/.test(rows[1]);
  const header = hasHeader ? rows.slice(0, 2) : [];
  const body = hasHeader ? rows.slice(2) : rows;
  const headerTokens = tokensIn(header.join("\n"));

  const pieces: string[] = [];
  let current: string[] = [];
  for (const row of body) {
    const projected = headerTokens + tokensIn([...current, row].join("\n")) + 1;
    if (current.length && projected > maxTokens) {
      pieces.push([...header, ...current].join("\n"));
      current = [];
    }
    current.push(row);
  }
  if (current.length) pieces.push([...header, ...current].join("\n"));
  return pieces;
}

/** Split an oversized paragraph on sentence boundaries, then hard-wrap if needed. */
function splitBlock(raw: string, maxTokens: number): string[] {
  const sentences = raw.split(/(?<=[.!?])\s+/);
  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && tokensIn(`${current} ${sentence}`) > maxTokens) {
      pieces.push(current);
      current = "";
    }
    // A single sentence over budget (minified HTML, a long table-free list) —
    // cut it at the character limit rather than emitting an oversized chunk.
    if (tokensIn(sentence) > maxTokens) {
      pieces.push(...hardWrap(sentence, maxTokens));
      continue;
    }
    current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) pieces.push(current);
  return pieces;
}

/** Trailing ~10% of a chunk, cut at a line boundary, to prefix the next one. */
function overlapOf(content: string): string {
  const target = Math.floor(content.length * OVERLAP_RATIO);
  if (target < 80) return "";
  const tail = content.slice(-target);
  const cut = tail.indexOf("\n");
  return (cut === -1 ? tail : tail.slice(cut + 1)).trim();
}

export function chunkMarkdown(
  markdown: string,
  opts: { targetTokens?: number; maxTokens?: number } = {},
): Chunk[] {
  const target = opts.targetTokens ?? TARGET_TOKENS;
  const max = opts.maxTokens ?? MAX_TOKENS;
  const normalised = normaliseMarkdown(markdown);
  if (!normalised) return [];

  const units = parseUnits(normalised);
  const chunks: Chunk[] = [];

  // Breadcrumb of enclosing headings, one slot per level.
  const stack: string[] = [];
  let buffer: string[] = [];
  let bufferPath: string | null = null;
  let bufferPage: number | null = null;

  const bufferTokens = () => tokensIn(buffer.join("\n\n"));

  const flush = (carryOverlap: boolean) => {
    const content = buffer.join("\n\n").trim();
    const page = bufferPage;
    buffer = [];
    // Cleared so the next chunk takes the page of whatever unit opens it, rather
    // than inheriting the page this one started on.
    bufferPage = null;
    if (!content) return;
    chunks.push({
      content,
      heading_path: bufferPath,
      page_number: page,
      token_count: tokensIn(content),
    });
    const overlap = carryOverlap ? overlapOf(content) : "";
    bufferPath = stack.length ? stack.join(" > ") : null;
    if (overlap) buffer.push(overlap);
  };

  const append = (raw: string, page: number | null) => {
    if (!buffer.length) {
      bufferPath = stack.length ? stack.join(" > ") : null;
      bufferPage = page;
    } else {
      bufferPage ??= page;
    }
    buffer.push(raw);
  };

  for (const unit of units) {
    if (unit.kind === "heading") {
      // A heading closes the previous chunk once there is enough material behind
      // it, so the chunk that holds a section's body carries that section's
      // breadcrumb. Below the floor the sections merge instead, which is what
      // keeps a run of thin sub-headings from becoming 40-token fragments.
      if (bufferTokens() >= MIN_FLUSH_TOKENS) flush(false);
      stack.length = unit.level - 1;
      stack[unit.level - 1] = unit.text;
      append(unit.raw, unit.page);
      continue;
    }

    const unitTokens = tokensIn(unit.raw);

    // Oversized on its own: split it by rows (tables) or sentences (prose). Flush
    // first so a piece already at the ceiling can't inherit a partial buffer and
    // push the chunk over it.
    if (unitTokens > max) {
      flush(false);
      const split = unit.kind === "table" ? splitTable(unit.raw, max) : splitBlock(unit.raw, max);
      // A single table row or unbroken line can still exceed the ceiling on its own.
      const pieces = split.flatMap((p) => (tokensIn(p) > max ? hardWrap(p, max) : [p]));
      for (const piece of pieces) {
        append(piece, unit.page);
        flush(false);
      }
      continue;
    }

    // Measured on the joined text, not as a sum of two ceil()s — rounding each part
    // separately under-reports the total and lets a chunk creep over the ceiling.
    if (buffer.length && tokensIn([...buffer, unit.raw].join("\n\n")) > max) {
      flush(true);
      // The carried overlap must not itself push this unit over the ceiling.
      if (tokensIn([...buffer, unit.raw].join("\n\n")) > max) buffer = [];
    }
    append(unit.raw, unit.page);
    if (bufferTokens() >= target) flush(true);
  }

  flush(false);
  // A heading with no body under it produces a heading-only chunk — no content to
  // retrieve, so drop it rather than burning a vector.
  return chunks.filter((c) => c.content.replace(/^#{1,6} .*$/gm, "").trim().length > 0);
}

/**
 * The text that actually gets embedded for a chunk: a locating prefix, then the body.
 *
 * The prefix is the breadcrumb when there is one, and the document title only as a
 * fallback. Prepending BOTH put the title on all ~100 chunks of a single document, and a
 * question phrased like that title ("the education system of USA for domestic students"
 * against a doc titled "United States — Domestic Education System") then scored every
 * chunk high and nearly equally — ranking collapsed onto whichever body was most generic,
 * so unrelated questions kept retrieving the same overview sections. The breadcrumb is
 * what makes a specific section findable; the title is already stored for citation, and
 * narrowing by document is a filter concern, not an embedding one.
 */
export function embedTextFor(
  content: string,
  headingPath?: string | null,
  title?: string | null,
): string {
  const prefix = headingPath?.trim() || title?.trim();
  return prefix ? `${prefix}\n\n${content}` : content;
}
