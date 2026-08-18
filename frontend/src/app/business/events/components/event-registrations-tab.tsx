"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { DataTable } from "@/app/admin/monitoring/events/components/events-table";
import type { RegistrationStatus } from "../apis";
import {
  PAYMENT_STATUS_STYLES,
  REGISTRATION_COLUMNS,
  REGISTRATION_STATUS_FILTERS,
  REGISTRATION_STATUS_STYLES,
} from "../const";
import { attendeeName, formatDate, formatDateTime } from "../utils";
import { fetchEventRegistrations, setRegistrationStatus } from "../store/business-events-slice";

/** Who registered for this event, with host-side check-in and cancellation. */
export function EventRegistrationsTab({ eventId }: Readonly<{ eventId: number }>) {
  const dispatch = useAppDispatch();
  const { registrations, registrationsTotal, registrationsStatus } = useAppSelector(
    (state) => state.businessEvents,
  );
  const [filter, setFilter] = useState<RegistrationStatus | "">("");
  const [busyId, setBusyId] = useState<number | null>(null);

  // Keyed on the event it was fetched for, so Strict Mode's double-invoke is a no-op.
  const fetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (fetchedFor.current === eventId) return;
    fetchedFor.current = eventId;
    dispatch(fetchEventRegistrations({ eventId }));
  }, [dispatch, eventId]);

  const changeStatus = async (registrationId: number, status: RegistrationStatus) => {
    setBusyId(registrationId);
    try {
      await dispatch(setRegistrationStatus({ registrationId, status })).unwrap();
      toast.success(status === "checked_in" ? "Attendee checked in" : "Registration cancelled");
    } catch (e) {
      toast.error("Couldn't update registration", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex w-full max-w-xs flex-col gap-1">
        <Combobox
          options={REGISTRATION_STATUS_FILTERS}
          value={filter}
          onChange={(value) => {
            const next = value as RegistrationStatus | "";
            setFilter(next);
            dispatch(fetchEventRegistrations({ eventId, status: next || undefined }));
          }}
          placeholder="All attendees"
          searchPlaceholder="Filter by state"
        />
      </div>

      <DataTable
        status={registrationsStatus}
        head={REGISTRATION_COLUMNS}
        minWidth="960px"
        rows={registrations.map((r) => [
          attendeeName(r),
          r.email ?? "—",
          r.ticket_name ?? "RSVP",
          String(r.quantity),
          Number(r.total_paid) > 0 ? Number(r.total_paid).toFixed(2) : "—",
          <Badge key="p" variant="secondary" className={cn(PAYMENT_STATUS_STYLES[r.payment_status])}>
            {r.payment_status}
          </Badge>,
          <Badge key="s" variant="secondary" className={cn(REGISTRATION_STATUS_STYLES[r.status])}>
            {r.status === "checked_in" ? `checked in ${formatDate(r.check_in_at)}` : r.status}
          </Badge>,
          formatDateTime(r.created_at),
          <span key="x" className="flex gap-1">
            {r.status === "registered" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => changeStatus(r.id, "checked_in")}
                >
                  Check in
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === r.id}
                  onClick={() => changeStatus(r.id, "cancelled")}
                >
                  Cancel
                </Button>
              </>
            )}
          </span>,
        ])}
      />

      {registrationsTotal > registrations.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {registrations.length} of {registrationsTotal}.
        </p>
      )}
    </div>
  );
}
