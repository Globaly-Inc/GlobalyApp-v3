import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { DistributionListItem } from "../apis/types";

/**
 * Whether the student met the course's listed entry requirements when they sent this.
 *
 * Shown before unlocking on purpose — it is the one thing about lead quality worth knowing
 * before paying. Only the rollup is available here; the criteria behind it name the student's
 * own degree and scores, which the server does not send to a locked row.
 *
 * `unknown` and `null` render nothing rather than a shrug: requirements are scraped and often
 * absent, so a badge on every second card would say nothing and mean less.
 */
const LABELS = {
  eligible: { text: "Meets requirements", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  not_eligible: { text: "Below requirements", tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
} as const;

export function EligibilityBadge({ status }: Readonly<{ status: DistributionListItem["eligibility_status"] }>) {
  const label = status === "eligible" || status === "not_eligible" ? LABELS[status] : null;
  if (!label) return null;
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium", label.tone)}>
      {label.text}
    </Badge>
  );
}
