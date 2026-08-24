"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { businessEventsApi } from "../apis";
import { EMPTY_EVENT_FORM, type EventFormState } from "../types";
import { formStateToInput } from "../utils";
import { EventDetailsFields } from "./event-details-fields";
import { EventLocationFields } from "./event-location-fields";
import { EventTicketManager } from "./event-ticket-manager";
import { EventCoHostManager } from "./event-cohost-manager";
import { EventUpdatesManager } from "./event-updates-manager";

type TabKey = "details" | "location" | "tickets" | "cohosts" | "updates";

const BASE_TABS: { value: TabKey; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "location", label: "Location" },
];

const EXISTING_ONLY_TABS: { value: TabKey; label: string }[] = [
  { value: "tickets", label: "Tickets" },
  { value: "cohosts", label: "Co-Hosts" },
  { value: "updates", label: "Updates" },
];

export function EventForm({
  eventId,
  initial,
}: Readonly<{ eventId?: number; initial?: EventFormState }>) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormState>(initial ?? EMPTY_EVENT_FORM);
  const [tab, setTab] = useState<TabKey>("details");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<EventFormState>) => setForm((f) => ({ ...f, ...p }));

  const tabs = eventId ? [...BASE_TABS, ...EXISTING_ONLY_TABS] : BASE_TABS;

  const handleSubmit = async () => {
    setError(null);
    if (!form.title.trim() || !form.starts_at || !form.ends_at) {
      setError("Title, start date and end date are required.");
      setTab("details");
      return;
    }
    setSaving(true);
    try {
      const input = formStateToInput(form);
      const event = eventId ? await businessEventsApi.update(eventId, input) : await businessEventsApi.create(input);
      router.push(`/business/marketing/events/${event.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{eventId ? "Edit event" : "New event"}</h1>
        <p className="text-sm text-muted-foreground">
          {eventId ? "Update your event details." : "Set up your event. Save it to manage tickets, co-hosts and updates."}
        </p>
      </div>

      <AdminSegmentedTabs options={tabs} value={tab} onChange={setTab} />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
      )}

      {tab === "details" && <EventDetailsFields form={form} onChange={patch} />}
      {tab === "location" && <EventLocationFields form={form} onChange={patch} />}
      {tab === "tickets" && eventId && <EventTicketManager eventId={eventId} />}
      {tab === "cohosts" && eventId && <EventCoHostManager eventId={eventId} />}
      {tab === "updates" && eventId && <EventUpdatesManager eventId={eventId} />}

      {(tab === "details" || tab === "location") && (
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => router.push("/business/marketing/events")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : eventId ? "Save changes" : "Create event"}
          </Button>
        </div>
      )}
    </div>
  );
}
