import { CircleAlert, CircleCheck, CircleHelp, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EligibilityCriterion, EligibilityVerdict } from "@/app/personal/enquiries/apis/types";

/**
 * How a student's profile lines up with one course, criterion by criterion.
 *
 * Purely informational. Nothing here gates anything — a student who meets none of the
 * requirements can still enquire, and the copy has to read as "here is where you stand",
 * never as a refusal or a warning.
 *
 * Presentational only: both callers (the public course page and the new-enquiry dialog) fetch
 * the verdict themselves and hand it here, so the two can never render the same answer
 * differently. It lives in `src/components/` for that reason, per frontend/AGENTS.md.
 */

const STATUS = {
  pass: { Icon: CircleCheck, tone: "text-emerald-600 dark:text-emerald-400" },
  fail: { Icon: CircleAlert, tone: "text-amber-600 dark:text-amber-400" },
  unknown: { Icon: CircleHelp, tone: "text-muted-foreground" },
} as const;

const SUMMARY = {
  eligible: {
    title: "You meet the listed requirements",
    body: "Based on the profile you have on file. The institution makes the final decision.",
    ring: "bg-emerald-50/70 ring-emerald-500/25 dark:bg-emerald-500/10 dark:ring-emerald-500/20",
    bar: "bg-emerald-500",
  },
  not_eligible: {
    title: "You meet some of the listed requirements",
    body: "You can enquire either way — these are collected from the institution's website, and many courses have pathway options.",
    ring: "bg-amber-50/70 ring-amber-500/25 dark:bg-amber-500/10 dark:ring-amber-500/20",
    bar: "bg-amber-500",
  },
  unknown: {
    title: "Not enough on file to compare",
    body: "Either this course hasn't listed its requirements, or your profile is missing something to check them against.",
    ring: "bg-muted/50 ring-border",
    bar: "bg-muted-foreground",
  },
} as const;

function CriterionRow({ criterion }: Readonly<{ criterion: EligibilityCriterion }>) {
  const { Icon, tone } = STATUS[criterion.status];
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-foreground">{criterion.label}</span>
          {criterion.required && (
            <span className="text-xs text-muted-foreground">requires {criterion.required}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {criterion.actual ? `You have ${criterion.actual}` : (criterion.hint ?? "Nothing on file to compare")}
          {/* Converted comparisons are flagged because the conversion is a plain linear one and
              institutions use their own tables. */}
          {criterion.converted && " · converted between grading scales"}
        </p>
      </div>
      <span className="sr-only">{criterion.status}</span>
    </li>
  );
}

/**
 * The headline number, with the fraction it came from underneath.
 *
 * Showing "3 of 4 checked" beside the percentage is what stops it reading as a grade: criteria
 * that couldn't be compared are excluded from both halves, so a thin profile scores nothing
 * against the student — it just means less was checked.
 */
function Score({ verdict, barClass }: Readonly<{ verdict: EligibilityVerdict; barClass: string }>) {
  if (verdict.percentage === null) return null;
  const comparable = verdict.criteria.filter((c) => c.status !== "unknown");
  const met = comparable.filter((c) => c.status === "pass").length;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={cn("h-full rounded-full transition-[width]", barClass)}
            style={{ width: `${verdict.percentage}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {met} of {comparable.length} requirement{comparable.length === 1 ? "" : "s"} met
        </p>
      </div>
      <span className="text-lg font-semibold tabular-nums text-foreground">{verdict.percentage}%</span>
    </div>
  );
}

export function EligibilityVerdictSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground ring-1 ring-border">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Checking how you match this course...
    </div>
  );
}

export function EligibilityVerdictPanel({
  verdict,
  className,
}: Readonly<{ verdict: EligibilityVerdict; className?: string }>) {
  const summary = SUMMARY[verdict.status];
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg px-3 py-3 ring-1", summary.ring, className)}>
      <div>
        <p className="text-sm font-semibold text-foreground">{summary.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{summary.body}</p>
      </div>

      <Score verdict={verdict} barClass={summary.bar} />

      {verdict.criteria.length > 0 && (
        <ul className="divide-y divide-border/60">
          {verdict.criteria.map((criterion, i) => (
            <CriterionRow key={`${criterion.key}-${criterion.label}-${i}`} criterion={criterion} />
          ))}
        </ul>
      )}

      {/* Requirements often differ by audience, and the domestic/international split is derived
          rather than stored — saying which one was used keeps that honest. */}
      <p className="text-[11px] text-muted-foreground">
        Checked against the {verdict.student_type} entry requirements.
      </p>
    </div>
  );
}
