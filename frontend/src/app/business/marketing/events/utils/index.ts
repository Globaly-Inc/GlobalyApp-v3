import type { EventInput, EventItem } from "../apis/types";
import { EMPTY_EVENT_FORM, type EventFormState } from "../types";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function eventToFormState(event: EventItem): EventFormState {
  return {
    ...EMPTY_EVENT_FORM,
    title: event.title,
    description: event.description ?? "",
    event_type: event.event_type,
    status: event.status,
    visibility: event.visibility,
    target_audiences: event.target_audiences,
    venue_name: event.venue_name ?? "",
    venue_address: event.venue_address ?? "",
    venue_city: event.venue_city ?? "",
    venue_country: event.venue_country ?? "",
    online_url: event.online_url ?? "",
    online_platform: event.online_platform ?? "",
    starts_at: toLocalInput(event.starts_at),
    ends_at: toLocalInput(event.ends_at),
    timezone: event.timezone ?? "",
    max_capacity: event.max_capacity != null ? String(event.max_capacity) : "",
    registration_deadline: toLocalInput(event.registration_deadline),
    contact_email: event.contact_email ?? "",
    contact_phone: event.contact_phone ?? "",
  };
}

export function formStateToInput(form: EventFormState): EventInput {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    event_type: form.event_type,
    status: form.status,
    visibility: form.visibility,
    target_audiences: form.target_audiences,
    venue_name: form.venue_name.trim() || null,
    venue_address: form.venue_address.trim() || null,
    venue_city: form.venue_city.trim() || null,
    venue_country: form.venue_country.trim() || null,
    online_url: form.online_url.trim() || null,
    online_platform: form.online_platform.trim() || null,
    starts_at: new Date(form.starts_at).toISOString(),
    ends_at: new Date(form.ends_at).toISOString(),
    timezone: form.timezone.trim() || null,
    max_capacity: form.max_capacity ? Number(form.max_capacity) : null,
    registration_deadline: form.registration_deadline ? new Date(form.registration_deadline).toISOString() : null,
    contact_email: form.contact_email.trim() || null,
    contact_phone: form.contact_phone.trim() || null,
  };
}
