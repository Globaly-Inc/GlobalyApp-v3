import { z } from "zod";
import type { CourseAssignment, CourseFee, CourseFeeParams, FeeInstallment, JunctionSlug, TimestampedRow } from "../apis/types";
import type { FeeFormInstallment, FeeLine } from "../types";

/**
 * The subset of `values` that differs from `original`.
 *
 * Forms submit every field on save, but save-and-learn counts each key in the patch as an
 * admin correction — a full-form patch would manufacture AI Memory lessons about fields
 * nobody touched. Compared as JSON so arrays and objects don't read as changed every time.
 */
export function changedFields(
  original: Record<string, unknown> | null | undefined,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(values)) {
    if (JSON.stringify(norm(original?.[key])) !== JSON.stringify(norm(next))) patch[key] = next;
  }
  return patch;
}

// Postgres hands back decimal columns as strings ("1500.00") while the forms submit numbers,
// so a raw compare would mark every fee's total_amount as corrected on every save.
function norm(v: unknown): unknown {
  if (v === undefined || v === "") return null;
  if (typeof v === "string" && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

// A fee the LLM couldn't confidently parse a number/currency for (a range, "Contact us", etc.)
// is stored with a null amount/currency rather than a fake $0 — fall back to the fee's own name
// instead of rendering "0", which would look like a real, confirmed zero-cost fee.
export function feeAmount(f: { currency: string | null; total_amount: number | null; name: string | null }): string {
  return f.total_amount != null ? `${f.currency ?? ""} ${f.total_amount}`.trim() : (f.name ?? "Fee");
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// Most-recent-first "updated" timestamp across a set of rows — falls back
// to created_at for tables that don't carry updated_at.
export function latestTimestamp(rows: TimestampedRow[] | null | undefined): string | null {
  let best: string | null = null;
  if (!rows || rows.length === 0) return null;
  for (const r of rows) {
    const t = r.updated_at || r.created_at || null;
    if (t && (!best || t > best)) best = t;
  }
  return best;
}

export type PendingCourseLink = { junction: JunctionSlug; course_id: string; entity_id: string };

export function pendingCourseLinks(
  selections: { junction: JunctionSlug; entityIds?: string[]; assignments?: CourseAssignment[]; entityCol: string }[],
  courseIds: string[],
): PendingCourseLink[] {
  return selections.flatMap(({ junction, entityIds, assignments, entityCol }) =>
    (entityIds ?? []).flatMap((entityId) => {
      const alreadyLinked = new Set((assignments ?? []).filter((a) => a[entityCol] === entityId).map((a) => a.course_id));
      return courseIds.filter((id) => !alreadyLinked.has(id)).map((course_id) => ({ junction, course_id, entity_id: entityId }));
    }),
  );
}

/**
 * Runs `tasks` with at most `limit` in flight at once, collecting per-task results instead
 * of failing the whole batch on the first rejection — used for bulk admin actions (e.g.
 * updating/linking up to 50 courses) that hit plain request/response endpoints with no
 * queue behind them, so a burst of 100+ simultaneous requests doesn't strain the DB pool.
 */
export async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      const task = tasks[i]!;
      try {
        results[i] = { status: "fulfilled", value: await task() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ── Fee form ──

const emptyFeeLine = (): FeeLine => ({ fee_type: "", amount: "" });

export const emptyFeeInstallment = (index: number): FeeFormInstallment => ({
  label: `Semester ${index + 1}`,
  lines: [emptyFeeLine()],
});

export const sumFeeLines = (lines: FeeLine[]) =>
  lines.reduce((total, l) => total + (Number(l.amount) || 0), 0);

export const sumFeeInstallments = (list: FeeFormInstallment[]) =>
  list.reduce((total, i) => total + sumFeeLines(i.lines), 0);

const PERIOD_INSTALLMENT_LABEL: Record<string, string> = {
  "Per Year": "Year 1",
  "Per Semester": "Semester 1",
  "Per Trimester": "Trimester 1",
  "Per Unit": "Per Credit",
  Total: "Full Payment",
};

/**
 * An extracted fee is stored as a total, sometimes with a {label, amount} split and no fee-type
 * lines. Seeding those from the fee itself is what keeps the form from opening on an empty
 * installment worth 0 — which, once saved, overwrites the real amount with zero.
 */
export function feeInstallmentsFromFee(fee?: CourseFee): FeeFormInstallment[] {
  if (fee?.installments?.length) {
    return fee.installments.map((i) => ({
      label: i.label,
      lines: i.lines?.length
        ? i.lines.map((l) => ({ fee_type: l.fee_type, amount: String(l.amount) }))
        : [{ fee_type: fee.name ?? "", amount: String(i.amount ?? "") }],
    }));
  }
  if (fee?.total_amount != null) {
    return [{
      label: PERIOD_INSTALLMENT_LABEL[fee.period_type ?? ""] ?? "Installment 1",
      lines: [{ fee_type: fee.name ?? "", amount: String(fee.total_amount) }],
    }];
  }
  return [emptyFeeInstallment(0)];
}

const feeSchema = z.object({
  studentType: z.string().min(1, "Please select who the fee applies to"),
  periodType: z.string().trim().min(1, "Period type is required"),
  currency: z.string().trim().min(1, "Currency is required"),
  name: z.string().trim().transform((v) => v || null),
  description: z.string().trim().transform((v) => v || null),
  installments: z.array(
    z.object({
      label: z.string(),
      lines: z.array(z.object({ fee_type: z.string(), amount: z.string() })),
    }),
  ).refine((insts) => {
    let totalLinesCount = 0;
    let missingType = false;
    let missingAmount = false;
    insts.forEach((inst) => {
      inst.lines.forEach((line) => {
        const hasType = Boolean(line.fee_type.trim());
        const amt = Number(line.amount);
        const hasAmount = Boolean(line.amount.trim()) && !isNaN(amt) && amt > 0;
        if (hasType || hasAmount) {
          totalLinesCount++;
          if (!hasType) missingType = true;
          if (!hasAmount) missingAmount = true;
        }
      });
    });
    return totalLinesCount > 0 && !missingType && !missingAmount;
  }, {
    message: "At least one valid fee line with a fee type and amount (> 0) is required",
  }),
});

/** One audience's amounts. `errorKey` is where this side's installment error is reported, so a
 *  split form can show the failure under the block that caused it. */
export type FeeFormSide = {
  studentType: string;
  installments: FeeFormInstallment[];
  errorKey: string;
};

/**
 * Validate the fee form and build one CourseFeeParams per side. Name, description, period and
 * currency are shared — a split entry is ONE fee quoted to two audiences, differing only in
 * amount. Returns errors keyed for the form's FieldErrors; `values` is only complete when
 * `errors` is empty.
 */
export function buildFeePayloads(
  shared: { periodType: string; currency: string; name: string; description: string; saveForReuse: boolean },
  sides: FeeFormSide[],
): { errors: Record<string, string>; values: CourseFeeParams[] } {
  const errors: Record<string, string> = {};
  const values: CourseFeeParams[] = [];

  for (const side of sides) {
    const result = feeSchema.safeParse({
      studentType: side.studentType,
      periodType: shared.periodType,
      currency: shared.currency,
      name: shared.name,
      description: shared.description,
      installments: side.installments,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        errors[key === "installments" ? side.errorKey : key] ??= issue.message;
      }
      continue;
    }

    const d = result.data;
    const installments: FeeInstallment[] = d.installments
      .map((i) => {
        const lines = i.lines
          .filter((l) => l.fee_type.trim() && Boolean(l.amount.trim()))
          .map((l) => ({ fee_type: l.fee_type.trim(), amount: Number(l.amount) || 0 }));
        return {
          label: i.label.trim() || "Installment",
          amount: lines.reduce((sum, l) => sum + l.amount, 0),
          lines,
        };
      })
      .filter((i) => i.lines.length > 0);

    values.push({
      name: d.name,
      description: d.description,
      student_type: d.studentType,
      period_type: d.periodType,
      currency: d.currency,
      total_amount: installments.reduce((sum, i) => sum + i.amount, 0),
      installments,
      save_for_reuse: shared.saveForReuse,
    });
  }

  return { errors, values };
}

// ── Partial dates ──
// An intake date is stored at the precision the institution published it at: "2026-09-21" when it
// gave a day, "2026-09" when it gave only a month. The backend never widens a month into
// "2026-09-01", because that is a deadline nobody published and a student can miss it by weeks.
// See backend lib/partial-date.ts — this is the display half of the same contract.

export type DatePrecision = "full_date" | "month";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Which precision a stored value carries. Null when there is no usable value. */
export function datePrecisionOf(value: string | null | undefined): DatePrecision | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "full_date";
  if (/^\d{4}-\d{2}$/.test(value)) return "month";
  return null;
}

/** What the value goes in: `<input type="month">` wants "YYYY-MM", `type="date"` wants a full one. */
export function toDateInputValue(value: string | null | undefined, precision: DatePrecision): string {
  if (!value) return "";
  return precision === "month" ? value.slice(0, 7) : value.slice(0, 10);
}

/** "September 2026" or "21 September 2026" — never a day the source didn't state. */
export function formatPartialDate(value: string | null | undefined): string | null {
  const precision = datePrecisionOf(value);
  if (!precision || !value) return null;
  const [y, m, d] = value.split("-");
  const month = MONTH_NAMES[Number(m) - 1] ?? m;
  return precision === "month" ? `${month} ${y}` : `${Number(d)} ${month} ${y}`;
}

/**
 * Weeks are how the column stores it, years are how a degree is advertised. The label must be
 * REVERSIBLE — a rounded one made 53 and 54 weeks both read "1.0 years", so a reviewer could not
 * tell two stored values apart. Only exact whole and half years take the year form; anything else
 * stays in weeks. No month form either: 4 weeks is not a month.
 */
export function courseDuration(weeks: number | null | undefined): string | null {
  if (!weeks || weeks <= 0) return null;
  if (weeks >= 52 && weeks % 26 === 0) {
    const years = weeks / 52;
    return `${years} ${years === 1 ? "year" : "years"}`;
  }
  return `${weeks} ${weeks === 1 ? "week" : "weeks"}`;
}
