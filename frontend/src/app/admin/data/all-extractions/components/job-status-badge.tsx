import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "../const";
import type { ExtractionStatus } from "../apis/types";

type BadgeVariant = "secondary" | "info" | "warning" | "success" | "destructive";

// Badge variant per job status — the label and icon still come from STATUS_CONFIG.
const STATUS_VARIANT: Record<ExtractionStatus, BadgeVariant> = {
  pending: "secondary",
  mapping: "info",
  scraping: "info",
  extracting: "info",
  processing: "info",
  verifying: "info",
  review: "warning",
  verified: "success",
  approved: "success",
  done: "success",
  completed: "success",
  exported: "success",
  pushed: "success",
  declined: "destructive",
  failed: "destructive",
  stalled: "destructive",
  paused: "secondary",
};

/** The job's status on the detail page, on the shared badge variants instead of STATUS_CONFIG's palette classes. */
export function JobStatusBadge({ status }: Readonly<{ status: ExtractionStatus }>) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "secondary"}>
      <cfg.icon className={cn(cfg.spin && "animate-spin")} />
      {cfg.label}
    </Badge>
  );
}
