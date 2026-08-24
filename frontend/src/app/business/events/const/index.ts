import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { EventStatus } from "../apis/types";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
};

export const EVENT_STATUS_BADGE_VARIANT: Record<EventStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  draft: "outline",
  published: "default",
  cancelled: "destructive",
};
