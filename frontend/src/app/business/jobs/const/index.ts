import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { ApplicationStatus, JobType } from "../apis/types";

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  casual: "Casual",
  contract: "Contract",
  internship: "Internship",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "Applied",
  reviewed: "Reviewed",
  rejected: "Rejected",
  hired: "Hired",
};

export const APPLICATION_STATUS_BADGE_VARIANT: Record<ApplicationStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  applied: "outline",
  reviewed: "secondary",
  rejected: "destructive",
  hired: "default",
};
