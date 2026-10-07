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

/** Hidden key on a generated row: the workbook line it came from (rows of its own tab use their index). */
export const SOURCE_LINE = "__line";

/** A column mapped to another section's field is stored as "section:field". */
export const foreignField = (value: string) => {
  const i = value.indexOf(":");
  return i < 0 ? null : { section: value.slice(0, i), key: value.slice(i + 1) };
};

/** Mapped tabs → sheets keyed by field and tagged with their section, ready for buildTemplateGroups.
 * Two tabs mapped to one section simply both contribute rows. Columns mapped to another section's
 * fields become extra rows of that section, one per source row with any of them filled. */
export function applyTabMapping(sheets: Sheet[], selected: string[], tabs: Record<string, TabMapping>): Sheet[] {
  const used = sheets.filter((s) => selected.includes(s.name) && tabs[s.name]?.section);
  const out: Sheet[] = [];
  const extra = new Map<string, Sheet>();
  // Institution rows choose the institution by name — rows from another tab borrow the file's one name.
  const institutionName = used.flatMap((s) => {
    const m = tabs[s.name]!;
    const h = Object.keys(m.columns).find((c) => (m.section === "institution" && m.columns[c] === "institution_name") || m.columns[c] === "institution:institution_name");
    return h ? s.rows.map((r) => r[h]?.trim() ?? "") : [];
  }).find(Boolean) ?? "";
  for (const s of used) {
    const { section, columns, defaults = {} } = tabs[s.name]!;
    const own = Object.entries(columns).filter(([, k]) => k && !foreignField(k));
    const fill = Object.entries(defaults).filter(([, v]) => v.trim());
    out.push({
      name: s.name,
      section: section || undefined,
      headers: [...own.map(([, k]) => k), ...fill.map(([k]) => k)],
      rows: s.rows.map((r) => ({ ...Object.fromEntries(fill), ...Object.fromEntries(own.map(([h, k]) => [k, r[h] ?? ""])) })),
    });
    const bySection = new Map<string, [string, string][]>();
    for (const [h, v] of Object.entries(columns)) {
      const f = v ? foreignField(v) : null;
      if (f) bySection.set(f.section, [...(bySection.get(f.section) ?? []), [h, f.key]]);
    }
    for (const [target, cols] of bySection) {
      const sheet = extra.get(target) ?? { name: `${s.name} (${SECTION_BY_KEY.get(target as never)?.tab ?? target})`, section: target as never, headers: [], rows: [] };
      extra.set(target, sheet);
      // The source row's own course link: its course name on a Courses tab, its Course Names cell on a
      // tab linked to courses (Fees, Intakes, …). Without it a blank `courses` means EVERY course.
      const courseCol = own.find(([, k]) => k === (section === "courses" ? "course_name" : "courses"))?.[0];
      for (const [idx, r] of s.rows.entries()) {
        const row = Object.fromEntries(cols.map(([h, k]) => [k, r[h] ?? ""]));
        if (!Object.values(row).some((v) => v.trim())) continue;
        // Linked sections name their course; from a Courses tab that's the row's own course.
        if (courseCol && !row.courses) row.courses = r[courseCol] ?? "";
        if (target === "institution" && !row.institution_name?.trim()) row.institution_name = institutionName;
        row[SOURCE_LINE] = String(idx + 2); // the source tab's line, for the import history
        sheet.rows.push(row);
      }
      sheet.headers = [...new Set([...sheet.headers, ...sheet.rows.flatMap((r) => Object.keys(r))])];
    }
  }
  return [...out, ...extra.values()];
}

/** Fields given a non-blank default — they count as mapped. */
export const filledDefaults = (m: TabMapping) => Object.entries(m.defaults ?? {}).filter(([, v]) => v.trim()).map(([k]) => k);

/** What stops the Map step: no tab holding courses, or a mapped tab missing a required field. */
export function tabMappingProblem(selected: string[], tabs: Record<string, TabMapping>): string | null {
  const used = selected.filter((n) => tabs[n]?.section);
  if (!used.some((n) => tabs[n]!.section === "courses")) return "Choose which tab holds the courses";
  for (const n of used) {
    const section = SECTION_BY_KEY.get(tabs[n]!.section as never)!;
    const mapped = new Set([...Object.values(tabs[n]!.columns), ...filledDefaults(tabs[n]!)]);
    const missing = section.fields.filter((f) => f.required && !mapped.has(f.key));
    if (missing.length) return `"${n}" (${section.tab}): map a column to ${missing.map((f) => f.label).join(", ")}`;
  }
  return null;
}
