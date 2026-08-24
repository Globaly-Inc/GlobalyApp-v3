"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { businessEventsApi } from "../apis";
import type { RegistrationItem } from "../apis/types";
import { EventRegistrantsTable } from "./event-registrants-table";

function toCsv(rows: RegistrationItem[]): string {
  const header = ["Name", "Email", "Phone", "Ticket", "Quantity", "Status", "Checked in at", "Registered at"];
  const lines = rows.map((r) =>
    [r.registrant_name, r.registrant_email, r.registrant_phone ?? "", r.ticket_name ?? "", r.quantity, r.status, r.checked_in_at ?? "", r.created_at]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_DRAFT = { registrant_name: "", registrant_email: "" };

export function EventRegistrantsView({ eventId }: Readonly<{ eventId: number }>) {
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    businessEventsApi.listRegistrations(eventId).then(setRegistrations);
  }, [eventId]);

  const handleToggleCheckIn = async (r: RegistrationItem) => {
    setBusyId(r.id);
    try {
      const updated = await businessEventsApi.checkIn(eventId, r.id, r.status !== "checked_in");
      setRegistrations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (r: RegistrationItem) => {
    setBusyId(r.id);
    try {
      const updated = await businessEventsApi.cancelRegistration(eventId, r.id);
      setRegistrations((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async () => {
    setError(null);
    if (!draft.registrant_name.trim() || !draft.registrant_email.trim()) return;
    setAdding(true);
    try {
      const created = await businessEventsApi.register(eventId, draft);
      setRegistrations((prev) => [created, ...prev]);
      setDraft(EMPTY_DRAFT);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add registrant");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Registrants</h1>
          <p className="text-sm text-muted-foreground">Manage RSVPs and check-ins for this event.</p>
        </div>
        <Button variant="outline" onClick={() => downloadCsv(`event-${eventId}-registrants.csv`, toCsv(registrations))}>
          Export CSV
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        <Input
          placeholder="Name"
          value={draft.registrant_name}
          onChange={(e) => setDraft((d) => ({ ...d, registrant_name: e.target.value }))}
          className="max-w-52"
        />
        <Input
          placeholder="Email"
          type="email"
          value={draft.registrant_email}
          onChange={(e) => setDraft((d) => ({ ...d, registrant_email: e.target.value }))}
          className="max-w-64"
        />
        <Button type="button" disabled={adding} onClick={handleAdd}>
          Add registrant
        </Button>
      </div>

      {registrations.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No registrants yet.</p>
        </div>
      ) : (
        <EventRegistrantsTable
          registrations={registrations}
          onToggleCheckIn={handleToggleCheckIn}
          onCancel={handleCancel}
          busyId={busyId}
        />
      )}
    </div>
  );
}
