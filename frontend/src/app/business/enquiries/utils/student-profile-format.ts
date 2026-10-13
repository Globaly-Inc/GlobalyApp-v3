// ── Formatting for the student profile page, mirroring record-sections.tsx so dates read the same in both places ──

export function formatMonthYear(value?: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(value);
  if (!iso) return value;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function formatRange(start: string | null, end: string | null, isCurrent: boolean): string | null {
  if (!start && !end) return null;
  return `${formatMonthYear(start) ?? "—"} – ${isCurrent ? "Present" : (formatMonthYear(end) ?? "—")}`;
}

export function formatDate(value?: string | null): string | null {
  return value ? (value.split("T")[0] ?? null) : null;
}

export function gradeLabel(grade: string | null, system: string | null): string | null {
  if (!grade) return null;
  return system ? `${grade} (${system.replace(/_/g, " ")})` : grade;
}

/** "L 7.5 · R 7.0 · W 6.5 · S 7.0" — the bands an agent checks against a course's sub-minimums. */
export function subScoreLabel(subScores: Record<string, string> | null): string | null {
  if (!subScores) return null;
  const parts = (["listening", "reading", "writing", "speaking"] as const)
    .map((k) => (subScores[k] ? `${k.charAt(0).toUpperCase()} ${subScores[k]}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function titleise(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
