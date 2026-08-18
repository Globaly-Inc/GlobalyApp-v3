// Spec for the markdown chunker — ported from V2's apps/ai-service/src/rag/chunk.ts
// behaviour (paragraph-pack, ~1000 chars, 120-char overlap), not from the V3 code.

import { describe, expect, it } from "vitest";
import {
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  chunkMarkdown,
} from "../../src/modules/superadmin/ai-knowledge/lib/chunk.js";

const para = (n: number, char = "a") => char.repeat(n);

describe("chunkMarkdown", () => {
  it("returns nothing for empty or whitespace-only input", () => {
    expect(chunkMarkdown("", null)).toEqual([]);
    expect(chunkMarkdown("   \n\n  \t ", null)).toEqual([]);
  });

  it("keeps a short document as one chunk and carries the title", () => {
    const chunks = chunkMarkdown("Student visas allow 48 hours of work per fortnight.", "Work rights");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      title: "Work rights",
      content: "Student visas allow 48 hours of work per fortnight.",
      charCount: 51,
    });
  });

  it("strips images and collapses runaway whitespace", () => {
    const chunks = chunkMarkdown("Fees   are\n\n\n\n![logo](http://x/y.png) high.", null);
    expect(chunks[0].content).toBe("Fees are\n\n high.");
  });

  it("splits on paragraph boundaries once the budget is exceeded", () => {
    const markdown = [para(600, "a"), para(600, "b"), para(600, "c")].join("\n\n");
    const chunks = chunkMarkdown(markdown, "T");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    for (const c of chunks) expect(c.title).toBe("T");
  });

  it("never emits a chunk longer than the budget", () => {
    // A single paragraph far over the budget must be hard-split, not passed through.
    const chunks = chunkMarkdown(para(5000, "z"), null);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it("overlaps consecutive chunks so cross-boundary answers stay retrievable", () => {
    const chunks = chunkMarkdown(para(5000, "z"), null);
    // The tail of chunk N reappears at the head of chunk N+1.
    const tail = chunks[0].content.slice(-CHUNK_OVERLAP_CHARS);
    expect(chunks[1].content.startsWith(tail)).toBe(true);
  });

  it("is deterministic — the same input yields byte-identical chunks", () => {
    const markdown = [para(700, "a"), para(700, "b"), para(700, "c")].join("\n\n");
    expect(chunkMarkdown(markdown, "T")).toEqual(chunkMarkdown(markdown, "T"));
  });

  it("honours explicit size options", () => {
    const markdown = [para(200, "a"), para(200, "b"), para(200, "c")].join("\n\n");
    const chunks = chunkMarkdown(markdown, null, { maxChars: 250, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(250);
  });

  it("reports each chunk's character count", () => {
    const chunks = chunkMarkdown(para(3000, "q"), null);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.charCount).toBe(c.content.length);
  });
});
