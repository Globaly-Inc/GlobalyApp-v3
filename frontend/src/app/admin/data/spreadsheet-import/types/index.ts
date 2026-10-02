// UI-only types for the spreadsheet import wizard (wire types live in apis/types.ts).

import type { TemplateTabKey } from "../const";

/** `section`: set once a tab-per-section tab has been mapped — its rows are then keyed by field. */
export type Sheet = { name: string; headers: string[]; rows: Record<string, string>[]; section?: TemplateTabKey };
/** A tab-per-section tab's mapping: which section it is ("" = not imported) and column → field. */
export type TabMapping = { section: TemplateTabKey | ""; columns: Record<string, string> };
/** header → system field key ("" = do not map). */
export type Mapping = Record<string, string>;
/** system field key → value applied to every row that has none. */
export type Defaults = Record<string, string>;
export type CourseRow = Record<string, string | null>;
export type InstitutionGroup = {
  id: string;
  /** Editable — a clash with an existing institution is fixed by renaming here. */
  name: string;
  sheet: string;
  institution: Record<string, string | null>;
  rows: CourseRow[];
  include: boolean;
  /** Rows identical in every mapped field to an earlier row of this institution — dropped. */
  skippedDuplicates: number;
  /** Template workbooks only: the other tabs' rows, sent as-is (backend SpreadsheetExtrasSchema). */
  extras?: Record<string, Record<string, string | null>[]>;
  /** Template workbooks only: warnings found while reading the other tabs (rows skipped, unknown courses). */
  notes?: Issue[];
};
export type Issue = { groupId: string; row: number; field: string; message: string; blocking: boolean };

/** What will actually be sent for one institution: rows with an error are left out, and an
 * institution-level error (name taken / missing) leaves the whole institution out. */
export type ImportPlanItem = { group: InstitutionGroup; rows: CourseRow[]; skippedRows: number; blockedReason: string | null };

export type ImportStatus = { state: "pending" | "importing" | "done" | "failed"; jobId?: string; error?: string };
