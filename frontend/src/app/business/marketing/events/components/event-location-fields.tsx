"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EventFormState } from "../types";

export function EventLocationFields({
  form,
  onChange,
}: Readonly<{ form: EventFormState; onChange: (patch: Partial<EventFormState>) => void }>) {
  const showVenue = form.event_type !== "online";
  const showOnline = form.event_type !== "in_person";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {showVenue && (
        <>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="venue-name">Venue name</Label>
            <Input id="venue-name" value={form.venue_name} onChange={(e) => onChange({ venue_name: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="venue-address">Address</Label>
            <Input
              id="venue-address"
              value={form.venue_address}
              onChange={(e) => onChange({ venue_address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-city">City</Label>
            <Input id="venue-city" value={form.venue_city} onChange={(e) => onChange({ venue_city: e.target.value })} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="venue-country">Country</Label>
            <Input
              id="venue-country"
              value={form.venue_country}
              onChange={(e) => onChange({ venue_country: e.target.value })}
            />
          </div>
        </>
      )}

      {showOnline && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="online-url">Online link</Label>
            <Input
              id="online-url"
              type="url"
              value={form.online_url}
              onChange={(e) => onChange({ online_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="online-platform">Platform</Label>
            <Input
              id="online-platform"
              value={form.online_platform}
              onChange={(e) => onChange({ online_platform: e.target.value })}
              placeholder="Zoom, Google Meet…"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-email">Contact email</Label>
        <Input
          id="contact-email"
          type="email"
          value={form.contact_email}
          onChange={(e) => onChange({ contact_email: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-phone">Contact phone</Label>
        <Input
          id="contact-phone"
          value={form.contact_phone}
          onChange={(e) => onChange({ contact_phone: e.target.value })}
        />
      </div>
    </div>
  );
}
