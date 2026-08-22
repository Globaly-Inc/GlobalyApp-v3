import type { AgentcisJob } from "../apis/types";

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  return rtf.format(-days, "day");
}

/** One-line phase/progress summary, e.g. "courses 12/30" or "42 courses extracted". */
export function progressText(job: AgentcisJob): string {
  const pp = job.pipeline_progress;
  if (!pp) return "—";
  const phase = String(pp.phase ?? "");
  const current = Number(pp.current ?? 0);
  const total = Number(pp.total ?? 0);
  if (phase === "done") return `${job.courses_extracted} courses extracted`;
  if (total > 0) return `${phase} ${current}/${total}`;
  return phase || "—";
}

/**
 * Per-phase counters the worker now tracks (branches/courses/intakes/fees extracted,
 * skipped branches/products) — V1 showed these in an expandable row; here they're a
 * compact second line under the main progress text. Null once nothing's been counted yet.
 */
export function progressCounters(job: AgentcisJob): string | null {
  const pp = job.pipeline_progress;
  if (!pp) return null;
  const parts: string[] = [];
  const push = (label: string, key: string) => {
    const n = Number(pp[key] ?? 0);
    if (n > 0) parts.push(`${n} ${label}`);
  };
  push("campuses", "branches_extracted");
  push("intakes", "intakes_extracted");
  push("fees", "fees_extracted");
  push("skipped campuses", "skipped_branches");
  push("skipped courses", "skipped_products");
  return parts.length ? parts.join(" · ") : null;
}

/** AgentCIS id stashed on the job at creation time (see backend agentcis-staging.ts) —
 * lets retry re-dispatch the exact same institution instead of deleting and asking the
 * admin to re-search manually. */
export function getAgentcisId(job: AgentcisJob): string | null {
  const id = job.pipeline_progress?.agentcis_id;
  return id != null ? String(id) : null;
}

/** First line of a failed job's error, for the compact table cell. */
export function firstErrorLine(job: AgentcisJob): string | null {
  const err = job.pipeline_progress?.error;
  return err != null ? (String(err).split("\n")[0] ?? null) : null;
}
