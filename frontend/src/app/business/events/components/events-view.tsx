"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearCreateError, createEvent, deleteEvent, fetchEvents, setEventStatus } from "../store/business-events-slice";
import type { Event } from "../apis/types";
import { CreateEventDialog } from "./create-event-dialog";
import { EventCard } from "./event-card";
import { RegistrantsDialog } from "./registrants-dialog";

export function EventsView() {
  const dispatch = useAppDispatch();
  const { items, status, error, creating, createError } = useAppSelector((s) => s.businessEvents);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEvents());
  }, [dispatch]);

  const [createOpen, setCreateOpen] = useState(false);
  const [registrantsFor, setRegistrantsFor] = useState<Event | null>(null);

  const loading = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Host info sessions and manage registrations.</p>
        </div>
        <Button
          onClick={() => {
            dispatch(clearCreateError());
            setCreateOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          New event
        </Button>
      </div>

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load events"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchEvents())}>
            Try again
          </Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}

      {!loading && items.length === 0 && status !== "failed" && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No events yet — create one to start taking registrations.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onStatusChange={(newStatus) => dispatch(setEventStatus({ eventId: event.id, status: newStatus }))}
              onDelete={() => dispatch(deleteEvent(event.id))}
              onViewRegistrants={() => setRegistrantsFor(event)}
            />
          ))}
        </div>
      )}

      <CreateEventDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={creating}
        error={createError}
        onConfirm={async (input) => {
          const result = await dispatch(createEvent(input));
          if (createEvent.fulfilled.match(result)) setCreateOpen(false);
        }}
      />

      <RegistrantsDialog event={registrantsFor} onOpenChange={(open) => !open && setRegistrantsFor(null)} />
    </div>
  );
}
