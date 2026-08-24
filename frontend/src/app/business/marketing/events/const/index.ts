import type { VariantProps } from "class-variance-authority";
import type { badgeVariants } from "@/components/ui/badge";
import type { EventStatus, EventType, EventVisibility } from "../apis/types";

export const EVENT_STATUSES: readonly EventStatus[] = ["draft", "published", "cancelled", "completed"];

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const EVENT_STATUS_BADGE_VARIANT: Record<EventStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  draft: "outline",
  published: "default",
  cancelled: "destructive",
  completed: "secondary",
};

export const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
  { value: "in_person", label: "In Person" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
];

export const EVENT_VISIBILITY_OPTIONS: { value: EventVisibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "members", label: "Members Only" },
  { value: "invite_only", label: "Invite Only" },
];
