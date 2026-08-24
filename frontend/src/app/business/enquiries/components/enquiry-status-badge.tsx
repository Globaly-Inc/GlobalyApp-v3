import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ENQUIRY_STATUS_DOT, ENQUIRY_STATUS_LABEL, ENQUIRY_STATUS_STYLES } from "../const";

/**
 * The one place a distribution's status turns into a pill, matching the student side's
 * `EnquiryStatusBadge` exactly so the same lifecycle reads the same on both screens.
 *
 * A dot rather than an icon: eight lifecycle icons at 12px are noise, and the dot keeps
 * the badge the same width whatever the status.
 */
export function EnquiryStatusBadge({ status, className }: Readonly<{ status: string; className?: string }>) {
  return (
    <Badge
      variant="secondary"
      className={cn("shrink-0 gap-1.5", ENQUIRY_STATUS_STYLES[status] ?? "bg-muted text-muted-foreground", className)}
    >
      <span className={cn("size-1.5 rounded-full", ENQUIRY_STATUS_DOT[status] ?? "bg-muted-foreground/40")} aria-hidden />
      {ENQUIRY_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
