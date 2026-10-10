import { read, utils } from "xlsx";
import { FIELD_BY_KEY, SYSTEM_FIELDS, TEMPLATE_TABS, type InstitutionSource } from "../const";
import { normaliseHeader, SOURCE_LINE, stripHint } from "./template-mapping";
import type { CourseRow, Defaults, ImportPlanItem, InstitutionGroup, Issue, Mapping, Sheet } from "../types";

/** Every tab, header row = row 1, every cell as trimmed text (SheetJS formats numbers/dates). */
export async function parseWorkbook(file: File): Promise<Sheet[]> {
  const wb = read(await file.arrayBuffer(), { cellDates: true });
  return wb.SheetNames.map((name) => {
    const aoa = utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: false, defval: "", blankrows: false, dateNF: "yyyy-mm-dd" });
    // Blank headings are skipped but each kept heading remembers its ORIGINAL column index —
    // filtering first would shift every later column onto the wrong heading.
    // A heading used twice (two "INSTALLMENT TYPE" columns — tuition's and the application fee's)
    // becomes "INSTALLMENT TYPE (2)": as one key the second silently overwrote the first. The
    // bracket is a hint to the matchers, so both still read as INSTALLMENT TYPE, in order.
    const seen = new Map<string, number>();
    const cols = (aoa[0] ?? []).map((h, i) => ({ h: String(h).trim(), i })).filter((c) => c.h).map((c) => {
      const n = (seen.get(c.h) ?? 0) + 1;
      seen.set(c.h, n);
      return n === 1 ? c : { ...c, h: `${c.h} (${n})` };
    });
    const headers = cols.map((c) => c.h);
    const rows = aoa.slice(1)
      .map((cells) => Object.fromEntries(cols.map(({ h, i }) => [h, String(cells[i] ?? "").trim()])))
      .filter((r) => Object.values(r).some(Boolean));
    return { name, headers, rows };
  }).filter((s) => s.headers.length > 0 && s.rows.length > 0);
}

export * from "./template-mapping";

/** Header → field by exact alias. Each field is taken once; the first matching header wins. */
export function autoMap(headers: string[]): Mapping {
  const used = new Set<string>();
  const mapping: Mapping = {};
  for (const h of headers) {
    const n = normaliseHeader(h);
    const field = SYSTEM_FIELDS.find((f) => !used.has(f.key) && (f.aliases.includes(n) || normaliseHeader(f.key) === n));
    mapping[h] = field?.key ?? "";
    if (field) used.add(field.key);
  }
  return mapping;
}

const blank = (v: string | null | undefined) => v == null || v.trim() === "";

/** Mapped rows grouped into institutions: one per tab, or one per value of the name column. */
export function buildGroups(sheets: Sheet[], selected: string[], mapping: Mapping, defaults: Defaults, source: InstitutionSource): InstitutionGroup[] {
  const groups = new Map<string, InstitutionGroup>();
  const seenRows = new Map<string, Set<string>>();
  for (const sheet of sheets.filter((s) => selected.includes(s.name))) {
    for (const raw of sheet.rows) {
      const mapped: CourseRow = {};
      for (const [header, key] of Object.entries(mapping)) if (key && header in raw) mapped[key] = raw[header] || null;
      for (const [key, value] of Object.entries(defaults)) if (blank(mapped[key]) && !blank(value)) mapped[key] = value;

      // A tab without the name column (or a blank cell) keeps its tab name rather than landing in a
      // nameless group — the source flips to "column" as soon as ANY tab has such a header.
      const name = (source === "sheet" || blank(mapped.institution_name) ? sheet.name : mapped.institution_name!).trim();
      const id = `${source === "sheet" ? sheet.name : "col"}::${name.toLowerCase()}`;
      let g = groups.get(id);
      if (!g) {
        g = { id, name, sheet: sheet.name, institution: {}, rows: [], include: true, skippedDuplicates: 0 };
        groups.set(id, g);
        seenRows.set(id, new Set());
      }
      const course: CourseRow = {};
      for (const [key, value] of Object.entries(mapped)) {
        if (FIELD_BY_KEY.get(key)?.institution) {
          if (key !== "institution_name" && blank(g.institution[key]) && !blank(value)) g.institution[key] = value;
        } else course[key] = value;
      }
      // A byte-for-byte repeat (sheets copy-paste rows) is safe to drop; a same-name row that
      // differs anywhere stays, and validateGroups flags it — only a human knows which is right.
      const fingerprint = JSON.stringify(Object.entries(course).sort(([a], [b]) => a.localeCompare(b)));
      if (seenRows.get(id)!.has(fingerprint)) { g.skippedDuplicates++; continue; }
      seenRows.get(id)!.add(fingerprint);
      g.rows.push(course);
    }
  }
  return [...groups.values()];
}

const snake = (h: string) => stripHint(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
/** A mapped tab carries its section; an unmapped one is looked up by the template's own tab name. */
const tabDef = (s: Sheet) =>
  s.section ? Object.values(TEMPLATE_TABS).find((t) => t.key === s.section) : TEMPLATE_TABS[s.name.trim().toLowerCase()];

/**
 * Template workbook → ONE institution, named by the Institution tab (one institution per file, so
 * no other tab repeats the name). Courses become its rows; Eligibility fills matching course rows;
 * every other tab rides along in `extras`. Course Names is ";"-separated, blank = every course.
 * An Institution tab naming several institutions yields one group each, which the wizard refuses.
 */
export function buildTemplateGroups(sheets: Sheet[], selected: string[]): InstitutionGroup[] {
  const groups = new Map<string, InstitutionGroup>();
  const group = (name: string, sheet: string) => {
    const id = `tpl::${name.trim().toLowerCase()}`;
    if (!groups.has(id)) groups.set(id, { id, name: name.trim(), sheet, institution: {}, rows: [], include: true, skippedDuplicates: 0, extras: {}, notes: [] });
    return groups.get(id)!;
  };
  const note = (g: InstitutionGroup, message: string) =>
    g.notes!.push({ groupId: g.id, row: 0, field: "template", message, blocking: false });
  // Courses before the tabs that link to them.
  const rank = (s: Sheet) => ({ institution: 0, courses: 1 } as Record<string, number>)[tabDef(s)!.key] ?? 2;
  const tabs = sheets.filter((s) => selected.includes(s.name) && tabDef(s)).sort((a, b) => rank(a) - rank(b));
  const institutionTab = tabs.find((s) => tabDef(s)!.key === "institution");
  const names = [...new Set((institutionTab?.rows ?? [])
    .map((r) => Object.entries(r).find(([h]) => snake(h) === "institution_name")?.[1]?.trim() ?? "")
    .filter(Boolean))];
  // A blank or missing name still yields a group — the Validate step flags it and lets the admin type one.
  for (const n of names.length ? names : [""]) group(n, institutionTab?.name ?? "Institution");
  const only = names.length <= 1 ? [...groups.values()][0] : null;
  // Built once, kept current as course rows arrive — rebuilding either per row made a 10k-course
  // file quadratic (tens of millions of stringify / Set operations) and froze the tab.
  const fingerprints = new Set<string>();
  const courseByName = new Map<string, CourseRow[]>();

  for (const sheet of tabs) {
    const def = tabDef(sheet)!;
    sheet.rows.forEach((raw, i) => {
      const line = Number(raw[SOURCE_LINE]) || i + 2;
      const r: Record<string, string | null> = {};
      for (const [h, v] of Object.entries(raw)) if (h !== SOURCE_LINE) r[def.rename?.[snake(h)] ?? snake(h)] = blank(v) ? null : v;
      // Institution-tab rows pick their own group; every other row belongs to the file's one institution
      // (with several, the wizard refuses the file, so those rows have nowhere to go and are dropped).
      const g = def.key === "institution" ? group(r.institution_name ?? "", sheet.name) : only;
      delete r.institution_name;
      if (!g) return;
      const at = `(line ${line})`;
      const drop = (error: string, kind?: "duplicate") => {
        if (def.key === "courses") (g.droppedCourses ??= []).push({ row: line, course: r.course_name ?? null, error, kind });
      };
      const missing = (def.required ?? []).filter((k) => k.split("|").every((f) => blank(r[f])));
      if (missing.length) {
        note(g, `${sheet.name}: ${def.requiredLabel ?? missing.join(", ").replaceAll("|", " or ").replaceAll("_", " ")} missing — skipped ${at}`);
        drop(`${def.requiredLabel ?? missing.join(", ").replaceAll("|", " or ").replaceAll("_", " ")} missing`);
        return;
      }
      const notNumber = (def.numeric ?? []).filter((k) => !blank(r[k]) && !Number.isFinite(toNumber(r[k]!)));
      // Skip the row only when a bad number leaves a required field with nothing valid — a Fees row
      // with a bad international amount but a good domestic one keeps the domestic fee.
      const valid = (f: string) => !blank(r[f]) && !notNumber.includes(f);
      if ((def.required ?? []).some((req) => !req.split("|").some(valid))) {
        note(g, `${sheet.name}: ${notNumber.join(", ").replaceAll("_", " ")} must be a number — skipped ${at}`);
        drop(`${notNumber.join(", ").replaceAll("_", " ")} must be a number`);
        return;
      }
      for (const k of notNumber) { note(g, `${sheet.name}: ${k.replaceAll("_", " ")} must be a number — ignored ${at}`); r[k] = null; }

      if (def.key === "institution") {
        for (const [k, v] of Object.entries(r)) if (v && blank(g.institution[k])) g.institution[k] = v;
        return;
      }
      if (def.key === "courses") {
        // Same rule as buildGroups: a byte-for-byte repeat is dropped, a differing same-name row is flagged.
        const fp = JSON.stringify(Object.entries(r).sort(([x], [y]) => x.localeCompare(y)));
        if (fingerprints.has(fp)) { g.skippedDuplicates++; drop("Exact duplicate of an earlier row — skipped", "duplicate"); }
        else {
          fingerprints.add(fp);
          g.rows.push(r);
          (g.rowLines ??= []).push(line);
          const k = r.course_name?.trim().toLowerCase() ?? "";
          courseByName.set(k, [...(courseByName.get(k) ?? []), r]);
        }
        return;
      }

      const names = blank(r.courses) ? null : r.courses!.split(";").map((n) => n.trim().toLowerCase()).filter(Boolean);
      const unknown = names?.filter((n) => !courseByName.has(n)) ?? [];
      if (unknown.length) note(g, `${sheet.name}: ${unknown.length} course name${unknown.length === 1 ? "" : "s"} not in the Courses tab — not linked ${at}`);

      if (def.key === "eligibility") {
        // First requirement per course wins, field by field — a second one only fills gaps.
        for (const c of names ? names.flatMap((n) => courseByName.get(n) ?? []) : g.rows) {
          for (const [k, v] of Object.entries(r)) if (k !== "courses" && v && blank(c[k])) c[k] = v;
        }
        return;
      }
      if (def.key === "intakes") {
        const intakes = expandIntakeRow(r);
        if (!intakes) { note(g, `${sheet.name}: intake lists have different lengths — skipped ${at}`); return; }
        (g.extras!.intakes ??= []).push(...intakes);
        return;
      }
      (g.extras![def.key] ??= []).push(...(def.key === "fees" ? expandFeeRow(r) : [r]));
    });
  }
  return [...groups.values()];
}

/** "a, b; c" → items. With `keepYear` (date columns only), a bare year after a comma stays with the
 * item before it, so "Jan 5, 2026, May 3, 2026" is two dates, not four pieces. A name or year column
 * splits at every comma — "Fall, 2027" there is not a date. */
function splitIntakeList(v: string, keepYear: boolean): string[] {
  return v.split(";").flatMap((part) => part.split(",").reduce<string[]>((out, piece) => {
    const t = piece.trim();
    if (keepYear && /^\d{4}$/.test(t) && out.length) out[out.length - 1] += `, ${t}`;
    else out.push(t);
    return out;
  }, []));
}

const INTAKE_DATE_FIELDS = new Set(["start_date", "end_date", "orientation_date", "admission_deadline"]);
const INTAKE_LIST_FIELDS = ["intake_name", "intake_month", "intake_year", "start_date", "end_date", "orientation_date", "admission_deadline"];

/** An Intakes row may list several intakes, position by position: "Fall 2026, Spring 2027" with
 * "2026-09-02, 2027-01-12" → two intakes. A single value applies to every intake. Null when two
 * lists disagree in length (or a date like "Jan 5, 2026" was split) — the row can't be paired up. */
export function expandIntakeRow(row: Record<string, string | null>): Record<string, string | null>[] | null {
  const lists = Object.fromEntries(INTAKE_LIST_FIELDS.map((k) => [k, splitIntakeList(row[k] ?? "", INTAKE_DATE_FIELDS.has(k))]));
  const count = Math.max(...Object.values(lists).map((l) => l.length));
  if (count === 1) return [row];
  if (Object.values(lists).some((l) => l.length !== 1 && l.length !== count)) return null;
  return Array.from({ length: count }, (_, i) => ({
    ...row,
    ...Object.fromEntries(Object.entries(lists).map(([k, l]) => [k, (l.length === 1 ? l[0] : l[i]) || null])),
  }));
}

/** A Fees row with a column per fee kind → one fee per filled amount, in the backend's shape. */
function expandFeeRow(row: Record<string, string | null>) {
  const v = (k: string) => row[k] ?? null; // unmapped columns are absent — the fee shape carries null
  const tuition = { courses: v("courses"), period: v("period"), installments: v("installments"), currency: v("currency"), name: v("name") };
  const out: Record<string, string | null>[] = [];
  // One fee per row (older templates / other layouts): Amount + Student Type, exactly as before.
  if (!blank(v("amount"))) out.push({ ...tuition, amount: v("amount"), student_type: v("student_type") });
  if (!blank(v("international_amount"))) out.push({ ...tuition, name: v("name") ?? "Tuition Fee", amount: v("international_amount"), student_type: "international" });
  if (!blank(v("domestic_amount"))) out.push({ ...tuition, name: v("name") ?? "Tuition Fee", amount: v("domestic_amount"), student_type: "domestic" });
  const application = { courses: v("courses"), currency: v("currency"), name: v("application_fee_name") ?? "Application Fee", period: v("application_fee_period") ?? "Total", installments: v("application_fee_installments") };
  if (!blank(v("international_application_fee_amount"))) out.push({ ...application, amount: v("international_application_fee_amount"), student_type: "international" });
  if (!blank(v("domestic_application_fee_amount"))) out.push({ ...application, amount: v("domestic_application_fee_amount"), student_type: "domestic" });
  if (!blank(v("application_fee_amount"))) out.push({ ...application, amount: v("application_fee_amount"), student_type: "both" });
  return out;
}

const RANGES: Record<string, [number, number]> = {
  ielts: [0, 9], toefl: [0, 120], pte: [10, 90], duolingo: [10, 160], gre: [260, 340], gmat: [200, 805], sat_1: [400, 1600],
};
/** English tests take a band list; GRE/GMAT/SAT store one total, so a list there is an error. */
const BANDED = new Set(["ielts", "toefl", "pte", "duolingo"]);
/** NaN when nothing numeric is left — `Number("")` is 0, which would pass "Per Semester" as a fee of 0. */
const toNumber = (v: string) => {
  const s = v.replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  return s ? Number(s) : Number.NaN;
};

/** Row checks. Blocking issues stop the import; the rest are shown and imported as-is. */
export function validateGroups(groups: InstitutionGroup[], existingNames: string[]): Issue[] {
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const issues: Issue[] = [];
  for (const g of groups.filter((x) => x.include)) {
    issues.push(...(g.notes ?? []));
    // The platform's institution type is the ownership sector; anything else is dropped on publish.
    const type = g.institution.ownership_type?.trim().toLowerCase();
    if (type && type !== "public" && type !== "private") {
      issues.push({ groupId: g.id, row: 0, field: "ownership_type", message: `Institution type "${g.institution.ownership_type}" isn't Public or Private — it will be left blank`, blocking: false });
    }
    if (!g.name.trim()) issues.push({ groupId: g.id, row: 0, field: "institution_name", message: "Institution has no name", blocking: true });
    else if (taken.has(g.name.trim().toLowerCase())) {
      issues.push({ groupId: g.id, row: 0, field: "institution_name", message: `"${g.name}" already exists — rename it or skip it`, blocking: true });
    }
    // Excel caps a tab name at 31 characters, so a long institution name arrives truncated.
    if (g.name === g.sheet && g.sheet.length === 31) {
      issues.push({ groupId: g.id, row: 0, field: "institution_name", message: "Tab names are cut at 31 characters — check the full institution name", blocking: false });
    }
    if (g.skippedDuplicates > 0) {
      issues.push({ groupId: g.id, row: 0, field: "course_name", message: `${g.skippedDuplicates} exact duplicate row${g.skippedDuplicates === 1 ? "" : "s"} skipped`, blocking: false });
    }
    const seen = new Map<string, { row: number; data: CourseRow }>();
    g.rows.forEach((r, i) => {
      const row = i + 1;
      const name = r.course_name?.trim();
      if (!name) issues.push({ groupId: g.id, row, field: "course_name", message: "Course name is required", blocking: true });
      else {
        const k = name.toLowerCase();
        // Per institution only: two institutions may each offer a course of the same name.
        const first = seen.get(k);
        if (first) {
          // Name the fields that differ — "different details" alone left the admin comparing two
          // wide rows cell by cell.
          const diff = [...new Set([...Object.keys(first.data), ...Object.keys(r)])]
            .filter((f) => f !== "course_name" && (first.data[f] ?? "") !== (r[f] ?? ""))
            .map((f) => `${FIELD_BY_KEY.get(f)?.label ?? f} ("${first.data[f] ?? ""}" vs "${r[f] ?? ""}")`);
          issues.push({ groupId: g.id, row, field: "course_name", message: `Same name as row ${first.row}, different ${diff.length ? diff.join(", ") : "capitalisation only"} — rename or remove one`, blocking: true });
        } else seen.set(k, { row, data: r });
      }
      // A shared rate AND a specific one would both be saved, and a student-type view would add
      // them (5,000 + 5,000 shown as 10,000) — the admin picks which the sheet means.
      if (!blank(r.both_fee_amount) && (!blank(r.fee_amount) || !blank(r.domestic_fee_amount))) {
        issues.push({ groupId: g.id, row, field: "both_fee_amount", message: "Tuition fee for domestic & international can't be mapped alongside a domestic or international tuition fee — map one or the other", blocking: true });
      }
      if (!blank(r.application_fee_amount) && (!blank(r.international_application_fee_amount) || !blank(r.domestic_application_fee_amount))) {
        issues.push({ groupId: g.id, row, field: "application_fee_amount", message: "Application fee for domestic & international can't be mapped alongside a domestic or international application fee — map one or the other", blocking: true });
      }
      for (const [key, value] of Object.entries(r)) {
        if (blank(value)) continue;
        const field = FIELD_BY_KEY.get(key);
        if (field?.type !== "number") continue;
        // English scores may list bands: "Overall, Listening, Reading, Writing, Speaking" — each checked
        // on its own (stripping the commas would read "6.5, 6, 6" as 6.566).
        // Positions count, not just filled ones: bands are read by position (englishBands), so
        // "6.5,6,6,6,,5.5" is six positions and its 5.5 would be silently dropped.
        const positions = BANDED.has(key) ? value!.split(",").map((p) => p.trim()) : [value!];
        while (positions.length > 1 && !positions.at(-1)) positions.pop(); // a trailing comma loses nothing
        const parts = positions.filter(Boolean);
        if (positions.length > 5) { issues.push({ groupId: g.id, row, field: key, message: `${field.label}: at most 5 positions (blanks count) — Overall, Listening, Reading, Writing, Speaking`, blocking: true }); continue; }
        if (!BANDED.has(key) && RANGES[key] && value!.includes(",")) { issues.push({ groupId: g.id, row, field: key, message: `${field.label} takes one total score, not a list`, blocking: true }); continue; }
        const nums = parts.map(toNumber);
        if (nums.some((n) => !Number.isFinite(n))) { issues.push({ groupId: g.id, row, field: key, message: `${field.label} must be a number${parts.length > 1 ? " for every band" : ""}`, blocking: true }); continue; }
        const range = RANGES[key];
        if (range && nums.some((n) => n < range[0] || n > range[1])) issues.push({ groupId: g.id, row, field: key, message: `${field.label} should be ${range[0]}–${range[1]}`, blocking: false });
      }
      if (!blank(r.duration) && !/\d/.test(r.duration!)) issues.push({ groupId: g.id, row, field: "duration", message: "Duration needs a number, e.g. 4 Years", blocking: false });
    });
  }
  return issues;
}

/** Errors skip their own row (or, at institution level, their institution) — never the whole import. */
export function importPlan(groups: InstitutionGroup[], issues: Issue[]): ImportPlanItem[] {
  return groups.filter((g) => g.include).map((group) => {
    const own = issues.filter((i) => i.groupId === group.id && i.blocking);
    const blockedReason = own.find((i) => i.row === 0)?.message ?? null;
    const badRows = new Set(own.filter((i) => i.row > 0).map((i) => i.row));
    const rows = blockedReason ? [] : group.rows.filter((_, i) => !badRows.has(i + 1));
    return { group, rows, skippedRows: blockedReason ? group.rows.length : badRows.size, blockedReason };
  });
}

