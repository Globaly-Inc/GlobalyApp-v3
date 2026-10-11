import { Badge } from "@/components/ui/badge";
import type { ModerationStatus } from "../apis/types";

const VARIANT: Record<ModerationStatus, { label: string; variant: "success" | "destructive" | "warning" }> = {
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  pending: { label: "Pending", variant: "warning" },
};

export function ModerationStatusBadge({ status }: Readonly<{ status: ModerationStatus }>) {
  const { label, variant } = VARIANT[status] ?? VARIANT.pending;
  return <Badge variant={variant}>{label}</Badge>;
}
