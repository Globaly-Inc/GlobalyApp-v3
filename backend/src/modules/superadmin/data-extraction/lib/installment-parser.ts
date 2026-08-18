// Installment breakdown calculator for course fees.
// Ported from V2 process-extraction-queue parseInstallments + periodType logic.
// Pure function, no external deps.
// Covered by tests/unit/extraction-fee-matcher.test.ts, which replaced the inline
// self-check this file used to carry and adds the cent-exactness invariant.

export interface Installment {
  label: string;
  amount: number;
}

/**
 * Break a fee total into labeled installments based on period type,
 * duration, or free-text hints.
 *
 * Splitting rules (in priority order):
 *  1. Text patterns: "2 semesters", "3 trimesters", "quarterly", "half year"
 *  2. periodType: Per Semester → 2/yr, Per Trimester → 3/yr, Per Year → by duration years, Per Unit → 1, Total → duration÷26
 *  3. Fallback: if duration > 52 weeks → 2 semesters/year
 *  4. Otherwise: single installment
 */
export function parseInstallments(opts: {
  totalAmount: number;
  periodType?: string | null;
  durationWeeks?: number | null;
  text?: string | null;
}): Installment[] {
  const { totalAmount, periodType, durationWeeks, text } = opts;
  if (!totalAmount || totalAmount <= 0) return [];

  const count = resolveCount(text ?? null, periodType ?? null, durationWeeks ?? null);
  if (count <= 0) return [{ label: "Total", amount: totalAmount }];

  const labelFn = pickLabelFn(text, periodType, count);
  const base = Math.floor(totalAmount / count);
  // ponytail: rounding remainder goes to last installment, not first — matches V2.
  // Rounded to cents because 11% of the corpus's fee amounts are fractional and the
  // raw subtraction yields float residue (10000.10 over 3 gave a stored installment of
  // 3334.1000000000004). Money is exact to the cent or it is wrong on someone's screen.
  const remainder = Math.round((totalAmount - base * count) * 100) / 100;

  return Array.from({ length: count }, (_, i) => ({
    label: labelFn(i, count),
    amount: i === count - 1 ? base + remainder : base,
  }));
}

// ── internal ────────────────────────────────────────────────────────────

function resolveCount(
  text: string | null,
  periodType: string | null,
  durationWeeks: number | null,
): number {
  // 1. Text patterns (highest priority — explicit user/AI hint)
  if (text) {
    const numMatch = text.match(
      /(\d+)\s*(semester|term|instalment|installment|payment|trimester|quarter)/i,
    );
    if (numMatch) return clamp(parseInt(numMatch[1]));
    if (/quarterly/i.test(text)) return 4;
    if (/half.?year|bi.?annual|twice a year|2 times/i.test(text)) return 2;
  }

  // 2. periodType
  const pt = (periodType ?? "").trim().toLowerCase();
  const years = durationWeeks ? Math.max(1, Math.round(durationWeeks / 52)) : 1;

  switch (pt) {
    case "per semester":
      return 2 * years;
    case "per trimester":
      return 3 * years;
    case "per year":
      return years;
    case "per unit":
      return 0; // ponytail: "per unit" means the amount IS the per-unit price, no splitting
    case "total":
      // Split into semesters across the full program duration
      return durationWeeks ? Math.max(1, Math.round(durationWeeks / 26)) : 1;
  }

  // 3. Fallback: long courses default to 2 semesters/year (V2 behaviour)
  if (durationWeeks && durationWeeks > 52) {
    return years * 2;
  }

  return 0; // signals "don't split"
}

function clamp(n: number): number {
  return n < 1 ? 1 : n > 12 ? 12 : n;
}

type LabelFn = (i: number, total: number) => string;

function pickLabelFn(
  text: string | null | undefined,
  periodType: string | null | undefined,
  count: number,
): LabelFn {
  const pt = (periodType ?? "").trim().toLowerCase();
  const t = (text ?? "").toLowerCase();

  if (pt === "per trimester" || /trimester/i.test(t)) {
    return semesterStyleLabel("Trimester", 3);
  }
  if (pt === "per semester" || /semester/i.test(t)) {
    return semesterStyleLabel("Semester", 2);
  }
  if (/quarter/i.test(t)) {
    return (_i) => `Quarter ${_i + 1}`;
  }
  if (/term/i.test(t)) {
    return (_i) => `Term ${_i + 1}`;
  }
  if (pt === "per year") {
    return (_i) => `Year ${_i + 1}`;
  }

  // Default: "Year X Semester Y" for multi-year, "Semester N" for single year
  if (count > 2) return semesterStyleLabel("Semester", 2);
  if (count === 2) return (_i) => `Semester ${_i + 1}`;
  return (_i) => `Installment ${_i + 1}`;
}

/** Produces labels like "Year 1 Semester 2" when count > perYear, else "Semester 1" */
function semesterStyleLabel(unit: string, perYear: number): LabelFn {
  return (i, total) => {
    if (total <= perYear) return `${unit} ${i + 1}`;
    const year = Math.floor(i / perYear) + 1;
    const sub = (i % perYear) + 1;
    return `Year ${year} ${unit} ${sub}`;
  };
}
