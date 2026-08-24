"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { cancelEvent, clearActionError, deleteEvent, fetchEvents } from "../store/business-events-slice";
import { EVENT_STATUS_LABEL, EVENT_STATUSES } from "../const";
import { EventListTable } from "./event-list-table";
import { CancelEventDialog } from "./cancel-event-dialog";
import type { EventItem, EventStatus } from "../apis/types";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  ...EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] })),
] as const;

export function EventsListView() {
  const dispatch = useAppDispatch();
  const { items, status, error, actingId, actionError } = useAppSelector((s) => s.businessEvents);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEvents({}));
  }, [dispatch]);

  const [statusFilter, setStatusFilter] = useState<"all" | EventStatus>("all");
  const [search, setSearch] = useState("");
  const [cancelTarget, setCancelTarget] = useState<EventItem | null>(null);

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [items, statusFilter, search]);

  const handleConfirmCancel = async (reason: string) => {
    if (!cancelTarget) return;
    const result = await dispatch(cancelEvent({ id: cancelTarget.id, reason: reason || undefined }));
    if (cancelEvent.fulfilled.match(result)) setCancelTarget(null);
  };

  const handleDelete = (event: EventItem) => {
    if (!window.confirm(`Delete "${event.title}"? This cannot be undone.`)) return;
    dispatch(deleteEvent(event.id));
  };

  const loadingFirstPage = status === "loading" && items.length === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Create and manage your business events and RSVPs.</p>
        </div>
        <Button render={<Link href="/business/marketing/events/new" />}>New event</Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminSegmentedTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} className="mb-0" />
        <Input
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs"
        />
      </div>

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="text-destructive">{actionError}</p>
          <Button variant="link" size="sm" className="h-auto px-0" onClick={() => dispatch(clearActionError())}>
            Dismiss
          </Button>
        </div>
      )}

      {status === "failed" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="text-destructive">{error ?? "Failed to load events"}</p>
          <Button variant="link" size="sm" className="px-0" onClick={() => dispatch(fetchEvents({}))}>
            Try again
          </Button>
        </div>
      )}

      {loadingFirstPage && <p className="text-sm text-muted-foreground">Loading events…</p>}

      {!loadingFirstPage && status !== "failed" && filtered.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No events found.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <EventListTable events={filtered} onCancel={setCancelTarget} onDelete={handleDelete} busyId={actingId} />
      )}

      <CancelEventDialog
        open={cancelTarget != null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
        eventTitle={cancelTarget?.title ?? null}
        submitting={actingId != null && actingId === cancelTarget?.id}
      />
    </div>
  );
}
