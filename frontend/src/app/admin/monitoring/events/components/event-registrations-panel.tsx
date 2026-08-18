"use client";

import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { AdminEvent } from "../apis";
import { PAYMENT_STATUS_STYLES, REGISTRATION_COLUMNS } from "../const";
import { attendeeName, eventPlace, formatDate } from "../utils";
import { closeEvent, fetchEventRegistrations } from "../store/admin-events-slice";
import { DataTable } from "./events-table";

/** Who registered for one event. Read-only — check-in belongs to the host, not to admins. */
export function EventRegistrationsPanel({ event }: Readonly<{ event: AdminEvent }>) {
  const dispatch = useAppDispatch();
  const { registrations, registrationsTotal, registrationsStatus } = useAppSelector(
    (state) => state.monitoringEvents,
  );

  useEffect(() => {
    dispatch(fetchEventRegistrations({ eventId: event.id }));
  }, [dispatch, event.id]);

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => dispatch(closeEvent())}>
        <ArrowLeft className="mr-1 h-4 w-4" /> All events
      </Button>
      <h1 className="text-2xl font-bold text-foreground">{event.title}</h1>
      <p className="mt-1 text-muted-foreground">
        {event.host.name ?? "Unknown host"} · {formatDate(event.starts_at)} · {eventPlace(event)} ·{" "}
        {registrationsTotal} registration{registrationsTotal === 1 ? "" : "s"}
      </p>

      <div className="mt-4">
        <DataTable
          status={registrationsStatus}
          head={REGISTRATION_COLUMNS}
          rows={registrations.map((r) => [
            attendeeName(r),
            r.email ?? "—",
            r.ticket_name ?? "RSVP",
            String(r.quantity),
            Number(r.total_paid) > 0 ? Number(r.total_paid).toFixed(2) : "—",
            <Badge key="p" variant="secondary" className={cn(PAYMENT_STATUS_STYLES[r.payment_status])}>
              {r.payment_status}
            </Badge>,
            r.status === "checked_in" ? `Checked in ${formatDate(r.check_in_at)}` : r.status,
            formatDate(r.created_at),
          ])}
        />
      </div>
    </div>
  );
}
