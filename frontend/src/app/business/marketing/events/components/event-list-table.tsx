"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "./event-status-badge";
import type { EventItem } from "../apis/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function EventListTable({
  events,
  onCancel,
  onDelete,
  busyId,
}: Readonly<{
  events: EventItem[];
  onCancel: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
  busyId: number | null;
}>) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">RSVPs</th>
            <th className="px-4 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3 font-medium">{event.title}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(event.starts_at)}</td>
              <td className="px-4 py-3 capitalize text-muted-foreground">{event.event_type.replace("_", " ")}</td>
              <td className="px-4 py-3">
                <EventStatusBadge status={event.status} />
              </td>
              <td className="px-4 py-3">{event.rsvp_count}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/business/marketing/events/${event.id}/edit`} />}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/business/marketing/events/${event.id}/registrants`} />}
                  >
                    Registrants
                  </Button>
                  {event.status !== "cancelled" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === event.id}
                      onClick={() => onCancel(event)}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busyId === event.id}
                    onClick={() => onDelete(event)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
