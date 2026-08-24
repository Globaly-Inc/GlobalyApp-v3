import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_DOT, STATUS_LABEL, STATUS_STYLES } from "../const";

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
    <Badge variant="secondary" className={cn("shrink-0 gap-1.5", STATUS_STYLES[status], className)}>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
