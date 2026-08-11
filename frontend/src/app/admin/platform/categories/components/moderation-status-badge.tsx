import { Badge } from "@/components/ui/badge";
import type { ModerationStatus } from "../apis/types";

const VARIANT: Record<ModerationStatus, { label: string; className: string }> = {
  approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export function ModerationStatusBadge({ status }: Readonly<{ status: ModerationStatus }>) {
  const { label, className } = VARIANT[status] ?? VARIANT.pending;
  return <Badge className={className}>{label}</Badge>;
}
