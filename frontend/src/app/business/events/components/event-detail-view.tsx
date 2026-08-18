"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import type { BusinessEvent } from "../apis";
import { EVENT_STATUS_STYLES } from "../const";
import { eventPlace, formatDateTime } from "../utils";
import { clearSelectedEvent, deleteBusinessEvent } from "../store/business-events-slice";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { EventFormDialog } from "./event-form-dialog";
import { EventRegistrationsTab } from "./event-registrations-tab";
import { EventTicketsTab } from "./event-tickets-tab";

const TABS = [
  { value: "tickets", label: "Tickets" },
  { value: "registrations", label: "Registrations" },
] as const;

type Tab = (typeof TABS)[number]["value"];

/** One of the host's own events: its header, its ticket types and its attendees. */
export function EventDetailView({ event }: Readonly<{ event: BusinessEvent }>) {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<Tab>("tickets");
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await dispatch(deleteBusinessEvent(event.id)).unwrap();
      toast.success("Event deleted");
      setConfirmOpen(false);
    } catch (e) {
      toast.error("Couldn't delete event", { description: (e as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => dispatch(clearSelectedEvent())}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All events
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
            <Badge variant="secondary" className={cn(EVENT_STATUS_STYLES[event.status] ?? "bg-muted")}>
              {event.status}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {/* Host is a polymorphic (org_type, org_id) pair — unclaimed institutions have no name. */}
            {event.host.name ?? `${event.host.org_type} #${event.host.org_id}`} ·{" "}
            {formatDateTime(event.starts_at)} · {eventPlace(event)}
          </p>
          {event.status === "cancelled" && event.cancellation_reason && (
            <p className="mt-1 text-sm text-destructive">Cancelled: {event.cancellation_reason}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit
          </Button>
          <Button variant="outline" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <AdminSegmentedTabs options={TABS} value={tab} onChange={setTab} />
        {tab === "tickets" && <EventTicketsTab eventId={event.id} />}
        {tab === "registrations" && <EventRegistrationsTab eventId={event.id} />}
      </div>

      <EventFormDialog open={editOpen} onOpenChange={setEditOpen} event={event} />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title="Delete event"
        body={
          <>
            Delete <strong className="text-foreground">{event.title}</strong>? Registered attendees will lose
            access to it. This cannot be undone.
          </>
        }
        deleting={deleting}
        onOpenChange={setConfirmOpen}
        onConfirm={handleDelete}
      />
    </div>
  );
}
