import { CalendarDays, MapPin, Users, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { EVENT_STATUS_BADGE_VARIANT, EVENT_STATUS_LABEL } from "../const";
import type { Event, EventStatus } from "../apis/types";

const STATUS_OPTIONS = (["draft", "published", "cancelled"] as EventStatus[]).map((s) => ({
  value: s,
  label: EVENT_STATUS_LABEL[s],
}));

export function EventCard({
  event,
  onStatusChange,
  onDelete,
  onViewRegistrants,
}: {
  event: Event;
  onStatusChange: (status: EventStatus) => void;
  onDelete: () => void;
  onViewRegistrants: () => void;
}) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{event.title}</h3>
        <Badge variant={EVENT_STATUS_BADGE_VARIANT[event.status]}>{EVENT_STATUS_LABEL[event.status]}</Badge>
      </div>

      {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {new Date(event.start_at).toLocaleString()}
        </span>
        <span className="flex items-center gap-2">
          {event.is_online ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
          {event.is_online ? "Online" : event.location ?? "In-person"}
        </span>
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          {event.registrant_count}
          {event.capacity ? ` / ${event.capacity}` : ""} registered
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <Combobox className="w-36" options={STATUS_OPTIONS} value={event.status} onChange={(v) => onStatusChange(v as EventStatus)} placeholder="Status" />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onViewRegistrants}>
            Registrants
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}
