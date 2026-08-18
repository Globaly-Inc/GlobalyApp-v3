"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
// Reused rather than re-declared: the admin events surface already owns this table shell.
import { DataTable } from "@/app/admin/monitoring/events/components/events-table";
import type { BusinessEvent, EventStatus } from "../apis";
import { EVENT_COLUMNS, EVENT_STATUS_FILTERS, EVENT_STATUS_STYLES } from "../const";
import { capacityLabel, eventPlace, formatDateTime } from "../utils";
import { fetchBusinessEvents, selectEvent } from "../store/business-events-slice";
import { EventDetailView } from "./event-detail-view";
import { EventFormDialog } from "./event-form-dialog";

/** The hosting business's own events: list, create, edit, and drill into one. */
export function BusinessEventsView() {
  const dispatch = useAppDispatch();
  const { events, eventsTotal, eventsStatus, selectedEvent } = useAppSelector(
    (state) => state.businessEvents,
  );
  const [status, setStatus] = useState<EventStatus | "">("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessEvent | null>(null);

  // Strict Mode double-invokes effects in dev; without this the list is fetched twice on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchBusinessEvents({}));
  }, [dispatch]);

  if (selectedEvent) return <EventDetailView event={selectedEvent} />;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (event: BusinessEvent) => {
    setEditing(event);
    setFormOpen(true);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Events</h1>
          <p className="mt-1 text-muted-foreground">
            Events your business hosts — tickets, capacity and who has registered.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> New event
        </Button>
      </div>

      <div className="mb-3 flex w-full max-w-xs flex-col gap-1">
        <Combobox
          options={EVENT_STATUS_FILTERS}
          value={status}
          onChange={(value) => {
            const next = value as EventStatus | "";
            setStatus(next);
            dispatch(fetchBusinessEvents({ status: next || undefined }));
          }}
          placeholder="All states"
          searchPlaceholder="Filter by state"
        />
      </div>

      <DataTable
        status={eventsStatus}
        head={EVENT_COLUMNS}
        rows={events.map((e) => [
          <button
            key="t"
            type="button"
            className="text-left font-medium text-primary hover:underline"
            onClick={() => dispatch(selectEvent(e))}
          >
            {e.title}
          </button>,
          formatDateTime(e.starts_at),
          eventPlace(e),
          e.event_type.replace("_", " "),
          <Badge key="s" variant="secondary" className={cn(EVENT_STATUS_STYLES[e.status] ?? "bg-muted")}>
            {e.status}
          </Badge>,
          capacityLabel(e),
          String(e.views_count),
          <Button key="e" variant="ghost" size="sm" onClick={() => openEdit(e)} aria-label={`Edit ${e.title}`}>
            <Pencil className="h-4 w-4" />
          </Button>,
        ])}
      />

      {eventsTotal > events.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {events.length} of {eventsTotal}.
        </p>
      )}

      <EventFormDialog open={formOpen} onOpenChange={setFormOpen} event={editing} />
    </div>
  );
}
