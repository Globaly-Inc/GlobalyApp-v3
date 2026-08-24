import { Badge } from "@/components/ui/badge";
import { EVENT_STATUS_BADGE_VARIANT, EVENT_STATUS_LABEL } from "../const";
import type { EventStatus } from "../apis/types";

export function EventStatusBadge({ status }: Readonly<{ status: EventStatus }>) {
  return <Badge variant={EVENT_STATUS_BADGE_VARIANT[status]}>{EVENT_STATUS_LABEL[status]}</Badge>;
}
