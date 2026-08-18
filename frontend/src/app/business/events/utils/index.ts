import type { BusinessEvent } from "../apis";

export function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/** Where an event happens — online events have no venue, so say so rather than showing a dash. */
export function eventPlace(event: BusinessEvent): string {
  if (event.event_type === "online") return "Online";
  return [event.venue_city, event.venue_country].filter(Boolean).join(", ") || "—";
}

export function attendeeName(row: { first_name: string | null; last_name: string | null }): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || "—";
}

/**
 * ISO instant → the `YYYY-MM-DDTHH:mm` an `<input type="datetime-local">` wants,
 * in the viewer's own timezone. `toISOString()` would shift it to UTC.
 */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` local → the offset-bearing ISO string the zod schema requires. */
export function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Empty form fields must go to the API as null — `""` fails the url/email/enum validators. */
export function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Empty numeric fields mean "unlimited"/"not set", which the API spells as null. */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Capacity as the list shows it: claimed seats over a cap, or just the cap. */
export function capacityLabel(event: BusinessEvent): string {
  return event.max_capacity === null ? "Unlimited" : `${event.max_capacity} seats`;
}

/** The browser's IANA zone, so an event created here carries the timezone it was authored in. */
export function localTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
