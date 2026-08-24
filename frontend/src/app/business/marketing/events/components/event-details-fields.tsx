"use client";

import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EVENT_STATUSES, EVENT_STATUS_LABEL, EVENT_TYPE_OPTIONS, EVENT_VISIBILITY_OPTIONS } from "../const";
import type { EventFormState } from "../types";

export function EventDetailsFields({
  form,
  onChange,
}: Readonly<{ form: EventFormState; onChange: (patch: Partial<EventFormState>) => void }>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="event-title">Title</Label>
        <Input id="event-title" value={form.title} onChange={(e) => onChange({ title: e.target.value })} required />
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="event-description">Description</Label>
        <Textarea
          id="event-description"
          rows={4}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Event type</Label>
        <Combobox
          options={EVENT_TYPE_OPTIONS}
          value={form.event_type}
          onChange={(v) => onChange({ event_type: v as EventFormState["event_type"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Visibility</Label>
        <Combobox
          options={EVENT_VISIBILITY_OPTIONS}
          value={form.visibility}
          onChange={(v) => onChange({ visibility: v as EventFormState["visibility"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Status</Label>
        <Combobox
          options={EVENT_STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] }))}
          value={form.status}
          onChange={(v) => onChange({ status: v as EventFormState["status"] })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-capacity">Max capacity</Label>
        <Input
          id="event-capacity"
          type="number"
          min={1}
          value={form.max_capacity}
          onChange={(e) => onChange({ max_capacity: e.target.value })}
          placeholder="Unlimited"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-starts">Starts at</Label>
        <Input
          id="event-starts"
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => onChange({ starts_at: e.target.value })}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-ends">Ends at</Label>
        <Input
          id="event-ends"
          type="datetime-local"
          value={form.ends_at}
          onChange={(e) => onChange({ ends_at: e.target.value })}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="event-deadline">Registration deadline</Label>
        <Input
          id="event-deadline"
          type="datetime-local"
          value={form.registration_deadline}
          onChange={(e) => onChange({ registration_deadline: e.target.value })}
        />
      </div>
    </div>
  );
}
