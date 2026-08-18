import type { AdminEvent } from "../apis";

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

/** Where an event happens — online events have no venue, so say so rather than showing a dash. */
export function eventPlace(event: AdminEvent): string {
  if (event.event_type === "online") return "Online";
  return [event.venue_city, event.venue_country].filter(Boolean).join(", ") || "—";
}

/** Attendee display name, falling back to the email the backend already returned. */
export function attendeeName(row: { first_name: string | null; last_name: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
}
