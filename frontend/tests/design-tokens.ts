/**
 * Portal code colours through design tokens (success / warning / destructive / info / chart-*, muted,
 * border…), never raw Tailwind palette shades, and uses the type scale, never 9–11.5px arbitrary sizes.
 * Fails when either creeps back in outside the allowlist below. The public site (app/(web)) is out of scope.
 *
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs tests/design-tokens.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "../src");

/** Deliberate exceptions. Keep each reason honest — this list is the escape hatch. */
const ALLOW: Record<string, string> = {
  "app/business/portal/components/site-url-categories.ts": "14 categorical colours; tokens would merge categories",
  "app/business/profile/components/services/service-bulk-bar.tsx": "inverted bg-foreground bar needs explicit light/dark shades",
  "app/personal/earn/services/components/category-cover.tsx": "cover artwork gradients",
  "app/business/ai-widget/components/widget-preview.tsx": "miniature of the embedded widget keeps its real-scale type",
  "app/business/portal/components/embed-widget-preview.tsx": "miniature of the embedded widget keeps its real-scale type",
  "components/portal-shell/portal-sidebar.tsx": "rail labels stay text-[10px], as in GlobalyOS-V2",
  "components/portal-shell/portal-mobile-nav.tsx": "bottom-nav labels stay text-[10px], as in GlobalyOS-V2",
};

const PALETTE =
  /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border(?:-[ltrbxyse])?|ring(?:-offset)?|from|to|via|fill|stroke|divide|outline|shadow|accent|decoration|caret|placeholder)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
const TINY_TEXT = /text-\[(?:9|10|10\.5|11|11\.5)px\]/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}

const offenders: string[] = [];
for (const path of files(SRC)) {
  const rel = relative(SRC, path);
  if (rel.startsWith("app/(web)/") || rel in ALLOW) continue;
  readFileSync(path, "utf8").split("\n").forEach((line, i) => {
    const hit = line.match(PALETTE)?.[0] ?? line.match(TINY_TEXT)?.[0];
    if (hit) offenders.push(`${rel}:${i + 1}  ${hit}`);
  });
}

assert.deepEqual(offenders, [], `Raw palette shades or tiny text sizes in portal code:\n${offenders.join("\n")}`);
console.log("design tokens: ok");
