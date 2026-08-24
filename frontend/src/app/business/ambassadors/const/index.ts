import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { ApplicationStatus, ProgramStatus } from "../apis/types";

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  closed: "Closed",
};

export const PROGRAM_STATUS_BADGE_VARIANT: Record<ProgramStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  closed: "destructive",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const APPLICATION_STATUS_BADGE_VARIANT: Record<ApplicationStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
};
