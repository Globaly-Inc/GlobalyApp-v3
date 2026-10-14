import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_VARIANT } from "../const";

import type { EnquiryStatus } from "../apis/types";

/**
 * The one place a status turns into a pill. The card, the detail header and any future
 * screen read from the same maps, so a status can never look "unlocked" here and
 * "in conversation" there.
 *
 * A dot rather than an icon: eight lifecycle icons at 12px are noise, and the dot keeps
 * the badge the same width whatever the status.
 */
export function EnquiryStatusBadge({
  status,
  className,
}: Readonly<{ status: EnquiryStatus; className?: string }>) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className={cn("shrink-0 gap-1.5", className)}>
      {/* Same hue as the label, at full strength so it reads at 6px. */}
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
