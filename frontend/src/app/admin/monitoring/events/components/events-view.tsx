"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { EVENT_COLUMNS, EVENT_STATUS_FILTERS, EVENT_STATUS_STYLES } from "../const";
import { eventPlace, formatDate } from "../utils";
import { fetchAdminEvents, fetchEventStats, openEvent } from "../store/admin-events-slice";
import { DataTable, StatTile } from "./events-table";
import { EventRegistrationsPanel } from "./event-registrations-panel";

/**
 * Read-only oversight of platform events.
 *
 * No moderation actions: cancelling someone's event or refunding a ticket are real powers that need
 * their own audit trail and permission story. This answers "what is running and who is attending".
 */
export function EventsView() {
  const dispatch = useAppDispatch();
  const { stats, events, eventsTotal, eventsStatus, statsStatus, openEvent: selected } = useAppSelector(
    (state) => state.monitoringEvents,
  );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  // Strict Mode double-invokes effects in dev; without this the list is fetched twice on mount.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchEventStats());
    dispatch(fetchAdminEvents({}));
  }, [dispatch]);

  if (selected) return <EventRegistrationsPanel event={selected} />;

  const reload = (next: { q?: string; status?: string }) =>
    dispatch(
      fetchAdminEvents({
        q: (next.q ?? search) || undefined,
        status: (next.status ?? status) || undefined,
      }),
    );

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Events</h1>
        <p className="mt-1 text-muted-foreground">
          Events hosted across the platform, their ticket sales and who has registered.
        </p>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Events"
          value={statsStatus === "loading" ? "—" : String(stats?.events.total ?? 0)}
          hint={`${stats?.events.published ?? 0} published · ${stats?.events.draft ?? 0} draft`}
        />
        <StatTile
          label="Upcoming"
          value={String(stats?.events.upcoming ?? 0)}
          hint="Published and not yet finished"
        />
        <StatTile
          label="Registrations"
          value={String(stats?.registrations.total ?? 0)}
          hint={`${stats?.registrations.checked_in ?? 0} checked in`}
        />
        <StatTile
          label="Seats claimed"
          value={String(stats?.tickets.seats_claimed ?? 0)}
          hint={`across ${stats?.tickets.total ?? 0} ticket types`}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Input
          className="max-w-sm"
          placeholder="Search by title or slug"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            reload({ q: e.target.value });
          }}
        />
        <select
          aria-label="Filter by state"
          className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            reload({ status: e.target.value });
          }}
        >
          {EVENT_STATUS_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        status={eventsStatus}
        head={EVENT_COLUMNS}
        rows={events.map((e) => [
          <button
            key="t"
            type="button"
            className="text-left font-medium text-primary hover:underline"
            onClick={() => dispatch(openEvent(e))}
          >
            {e.title}
          </button>,
          e.host.name ?? `${e.host.org_type} #${e.host.org_id}`,
          formatDate(e.starts_at),
          eventPlace(e),
          e.event_type.replace("_", " "),
          <Badge key="s" variant="secondary" className={cn(EVENT_STATUS_STYLES[e.status] ?? "bg-muted")}>
            {e.status}
          </Badge>,
          e.max_capacity ? `${e.registrations_count} / ${e.max_capacity}` : String(e.registrations_count),
          String(e.views_count),
        ])}
      />

      {eventsTotal > events.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {events.length} of {eventsTotal}.
        </p>
      )}
    </div>
  );
}
