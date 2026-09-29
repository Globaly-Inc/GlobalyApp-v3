// Tab-per-section workbooks: which of our sections each tab is, and which field each column is.
// The downloadable template maps itself (its tab names and headings ARE our labels); anyone else's
// workbook is auto-matched by name and aliases, then corrected by the admin in the Map step.

import { SECTION_BY_KEY, TEMPLATE_SECTIONS } from "../const/template-sections";
import type { Sheet, TabMapping } from "../types";

/** A heading's bracketed hint is guidance, not part of its name: "IELTS (Overall, L, R, W, S)" is IELTS. */
export const stripHint = (h: string) => h.replace(/\([^)]*\)/g, "");
export const normaliseHeader = (h: string) => stripHint(h).toLowerCase().replace(/[^a-z0-9]/g, "");

export const detectSection = (tabName: string) =>
  TEMPLATE_SECTIONS.find((s) => s.aliases.includes(normaliseHeader(tabName)))?.key ?? "";

/** Tab-per-section when one tab reads as Courses and at least one other as another section. */
export function isTabbedWorkbook(sheets: Sheet[]) {
  const found = sheets.map((s) => detectSection(s.name)).filter(Boolean);
  return found.includes("courses") && found.length >= 2;
}

/** Column → field for one section: exact label/key matches first, aliases second, each field once. */
export function autoMapSection(section: string, headers: string[]): Record<string, string> {
  const fields = SECTION_BY_KEY.get(section as never)?.fields ?? [];
  const out: Record<string, string> = Object.fromEntries(headers.map((h) => [h, ""]));
  const used = new Set<string>();
  for (const names of [(f: (typeof fields)[number]) => [f.label, f.key], (f: (typeof fields)[number]) => f.aliases ?? []]) {
    for (const h of headers) {
      if (out[h]) continue;
      const f = fields.find((f) => !used.has(f.key) && names(f).some((n) => normaliseHeader(n) === normaliseHeader(h)));
      if (f) { out[h] = f.key; used.add(f.key); }
    }
  }
  return out;
}

export function autoMapTabs(sheets: Sheet[]): Record<string, TabMapping> {
  return Object.fromEntries(sheets.map((s) => {
    const section = detectSection(s.name);
    return [s.name, { section, columns: section ? autoMapSection(section, s.headers) : {} }];
  }));
}

/** Mapped tabs → sheets keyed by field and tagged with their section, ready for buildTemplateGroups.
 * Two tabs mapped to one section simply both contribute rows. */
export function applyTabMapping(sheets: Sheet[], selected: string[], tabs: Record<string, TabMapping>): Sheet[] {
  return sheets.filter((s) => selected.includes(s.name) && tabs[s.name]?.section).map((s) => {
    const { section, columns } = tabs[s.name]!;
    const cols = Object.entries(columns).filter(([, k]) => k);
    return {
      name: s.name,
      section: section || undefined,
      headers: cols.map(([, k]) => k),
      rows: s.rows.map((r) => Object.fromEntries(cols.map(([h, k]) => [k, r[h] ?? ""]))),
    };
  });
}

/** What stops the Map step: no tab holding courses, or a mapped tab missing a required field. */
export function tabMappingProblem(selected: string[], tabs: Record<string, TabMapping>): string | null {
  const used = selected.filter((n) => tabs[n]?.section);
  if (!used.some((n) => tabs[n]!.section === "courses")) return "Choose which tab holds the courses";
  for (const n of used) {
    const section = SECTION_BY_KEY.get(tabs[n]!.section as never)!;
    const mapped = new Set(Object.values(tabs[n]!.columns));
    const missing = section.fields.filter((f) => f.required && !mapped.has(f.key));
    if (missing.length) return `"${n}" (${section.tab}): map a column to ${missing.map((f) => f.label).join(", ")}`;
  }
  return null;
}
