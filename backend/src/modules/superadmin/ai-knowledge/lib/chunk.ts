// Deterministic paragraph-pack chunker for crawled markdown.
//
// Ported from V2's apps/ai-service/src/rag/chunk.ts, numbers included: ~1000 chars
// per chunk (≈250 tokens for English prose) with a 120-char overlap so an answer
// that straddles a boundary is still retrievable from at least one chunk.
//
// ponytail: char-based, not tokenizer-based. A tokenizer is a dependency and a
// startup cost for a bound that only has to be approximately right; swap one in
// if the recall@5 gate ever says the boundaries are the problem.
//
// Pure and dependency-free on purpose — the embed worker is only testable offline
// because the expensive half (the provider call) is the only part that isn't.

export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 120;

export interface Chunk {
  chunkIndex: number;
  content: string;
  title: string | null;
  charCount: number;
}

export interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

/** Markdown images carry no retrievable text, only URLs that pollute the tsvector. */
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;

function normalise(markdown: string): string {
  return markdown
    .replace(IMAGE_RE, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkMarkdown(
  markdown: string,
  title: string | null,
  opts: ChunkOptions = {},
): Chunk[] {
  const maxChars = opts.maxChars ?? CHUNK_MAX_CHARS;
  const overlap = opts.overlap ?? CHUNK_OVERLAP_CHARS;

  const clean = normalise(markdown);
  if (!clean) return [];

  const chunks: Chunk[] = [];
  const push = (content: string) => {
    const trimmed = content.trim();
    if (trimmed) {
      chunks.push({ chunkIndex: chunks.length, content: trimmed, title, charCount: trimmed.length });
    }
  };

  if (clean.length <= maxChars) {
    push(clean);
    return chunks;
  }

  let buf = "";
  for (const paragraph of clean.split(/\n\n+/)) {
    if (buf && buf.length + paragraph.length + 2 > maxChars) {
      push(buf);
      buf = `${buf.slice(-overlap)}\n\n${paragraph}`; // carry the overlap tail forward
    } else {
      buf = buf ? `${buf}\n\n${paragraph}` : paragraph;
    }

    // A single paragraph longer than the budget: hard-split, still overlapping.
    while (buf.length > maxChars) {
      push(buf.slice(0, maxChars));
      buf = buf.slice(maxChars - overlap);
    }
  }
  push(buf);

  return chunks;
}
