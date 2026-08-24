import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { CampaignStatus } from "../apis/types";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export const CAMPAIGN_STATUS_BADGE_VARIANT: Record<CampaignStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "outline",
};

/** Ad amounts are minor units (cents). */
export function formatBudgetMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}
