// Pure translation between the event dialog's all-strings form state and the
// EventInput the zod schema accepts. Kept out of the component so the mapping
// (and its "" → null rules) can be read in one place.

import type { BusinessEvent, EventCategory, EventInput, EventType, EventVisibility } from "../apis";
import { fromLocalInput, localTimezone, nullIfBlank, numberOrNull, toLocalInput } from "./index";

export interface EventForm {
  title: string;
  summary: string;
  description: string;
  cover_image_url: string;
  event_type: string;
  category: string;
  status: string;
  visibility: string;
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_country: string;
  online_url: string;
  online_platform: string;
  starts_at: string;
  ends_at: string;
  registration_deadline: string;
  max_capacity: string;
  tags: string;
  contact_email: string;
  contact_phone: string;
}

export const EMPTY_EVENT_FORM: EventForm = {
  title: "",
  summary: "",
  description: "",
  cover_image_url: "",
  event_type: "in_person",
  category: "",
  status: "draft",
  visibility: "public",
  venue_name: "",
  venue_address: "",
  venue_city: "",
  venue_country: "",
  online_url: "",
  online_platform: "",
  starts_at: "",
  ends_at: "",
  registration_deadline: "",
  max_capacity: "",
  tags: "",
  contact_email: "",
  contact_phone: "",
};

/**
 * An existing event as form state. venue_address, online_platform, tags, timezone and
 * contact details are write-only on this API — serializeEvent does not return them — so
 * they start blank on edit and are only sent when the host fills them in again.
 */
export function formFromEvent(event: BusinessEvent): EventForm {
  return {
    ...EMPTY_EVENT_FORM,
    title: event.title,
    summary: event.summary ?? "",
    description: event.description ?? "",
    cover_image_url: event.cover_image_url ?? "",
    event_type: event.event_type,
    category: event.category ?? "",
    status: event.status,
    visibility: event.visibility,
    venue_name: event.venue_name ?? "",
    venue_city: event.venue_city ?? "",
    venue_country: event.venue_country ?? "",
    online_url: event.online_url ?? "",
    starts_at: toLocalInput(event.starts_at),
    ends_at: toLocalInput(event.ends_at),
    registration_deadline: toLocalInput(event.registration_deadline),
    max_capacity: event.max_capacity === null ? "" : String(event.max_capacity),
  };
}

const URL_LIKE = /^https?:\/\/\S+$/i;
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same rules the backend enforces, checked here so the host sees them per field. */
export function validateEventForm(form: EventForm): Partial<Record<keyof EventForm, string>> {
  const errors: Partial<Record<keyof EventForm, string>> = {};
  if (form.title.trim().length < 3) errors.title = "Title must be at least 3 characters";
  if (!form.starts_at) errors.starts_at = "Start date and time is required";
  if (!form.ends_at) errors.ends_at = "End date and time is required";
  if (form.starts_at && form.ends_at && new Date(form.ends_at) < new Date(form.starts_at)) {
    errors.ends_at = "End must not be before start";
  }
  if (form.cover_image_url.trim() && !URL_LIKE.test(form.cover_image_url.trim())) {
    errors.cover_image_url = "Enter a full URL starting with http:// or https://";
  }
  if (form.online_url.trim() && !URL_LIKE.test(form.online_url.trim())) {
    errors.online_url = "Enter a full URL starting with http:// or https://";
  }
  if (form.contact_email.trim() && !EMAIL_LIKE.test(form.contact_email.trim())) {
    errors.contact_email = "Enter a valid email address";
  }
  const capacity = form.max_capacity.trim();
  if (capacity && !(Number(capacity) > 0 && Number.isInteger(Number(capacity)))) {
    errors.max_capacity = "Capacity must be a whole number above zero";
  }
  return errors;
}

/** Form state → request body. Only valid forms reach here, so the dates are known-good. */
export function formToInput(form: EventForm): EventInput {
  const tags = form.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    title: form.title.trim(),
    summary: nullIfBlank(form.summary),
    description: nullIfBlank(form.description),
    cover_image_url: nullIfBlank(form.cover_image_url),
    event_type: form.event_type as EventType,
    category: (nullIfBlank(form.category) as EventCategory | null) ?? null,
    status: form.status as EventInput["status"],
    visibility: form.visibility as EventVisibility,
    venue_name: nullIfBlank(form.venue_name),
    venue_address: nullIfBlank(form.venue_address),
    venue_city: nullIfBlank(form.venue_city),
    venue_country: nullIfBlank(form.venue_country),
    online_url: nullIfBlank(form.online_url),
    online_platform: nullIfBlank(form.online_platform),
    starts_at: fromLocalInput(form.starts_at) as string,
    ends_at: fromLocalInput(form.ends_at) as string,
    timezone: localTimezone(),
    max_capacity: numberOrNull(form.max_capacity),
    registration_deadline: fromLocalInput(form.registration_deadline),
    tags: tags.length > 0 ? tags : null,
    contact_email: nullIfBlank(form.contact_email),
    contact_phone: nullIfBlank(form.contact_phone),
  };
}
