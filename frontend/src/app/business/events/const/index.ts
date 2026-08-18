import type { ComboboxOption } from "@/components/combobox";

export const EVENT_STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

export const REGISTRATION_STATUS_STYLES: Record<string, string> = {
  registered: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  checked_in: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  free: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground/70",
};

export const EVENT_STATUS_FILTERS: ComboboxOption[] = [
  { value: "", label: "All states" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "cancelled", label: "Cancelled" },
];

export const EVENT_STATUS_OPTIONS: ComboboxOption[] = [
  { value: "draft", label: "Draft", description: "Only your team can see it" },
  { value: "published", label: "Published", description: "Listed publicly and open for registration" },
  { value: "cancelled", label: "Cancelled" },
];

export const EVENT_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "in_person", label: "In person" },
  { value: "online", label: "Online" },
  { value: "hybrid", label: "Hybrid" },
];

export const EVENT_CATEGORY_OPTIONS: ComboboxOption[] = [
  { value: "networking", label: "Networking" },
  { value: "workshop", label: "Workshop" },
  { value: "conference", label: "Conference" },
  { value: "open_day", label: "Open day" },
  { value: "other", label: "Other" },
];

export const EVENT_VISIBILITY_OPTIONS: ComboboxOption[] = [
  { value: "public", label: "Public", description: "Anyone browsing events can find it" },
  { value: "targeted", label: "Targeted", description: "Only shown to matching audiences" },
];

export const REGISTRATION_STATUS_FILTERS: ComboboxOption[] = [
  { value: "", label: "All attendees" },
  { value: "registered", label: "Registered" },
  { value: "checked_in", label: "Checked in" },
  { value: "cancelled", label: "Cancelled" },
];

export const EVENT_COLUMNS = ["Event", "When", "Where", "Type", "State", "Capacity", "Views", ""];

/**
 * "Claimed" rather than "Sold": seats are taken at checkout, so the count includes
 * reservations that have not settled (and may yet expire), not just paid sales.
 */
export const TICKET_COLUMNS = ["Ticket", "Price", "Capacity", "Claimed", "Remaining", "State", ""];

export const REGISTRATION_COLUMNS = [
  "Attendee",
  "Email",
  "Ticket",
  "Seats",
  "Paid",
  "Payment",
  "State",
  "Registered",
  "",
];

/** Currencies the ticket form offers. The API accepts any 3-letter code. */
export const TICKET_CURRENCY_OPTIONS: ComboboxOption[] = [
  { value: "USD", label: "USD" },
  { value: "AUD", label: "AUD" },
  { value: "GBP", label: "GBP" },
  { value: "EUR", label: "EUR" },
  { value: "NPR", label: "NPR" },
  { value: "INR", label: "INR" },
];

/** Matches MAX_TICKETS_PER_ORDER in backend/src/modules/events/consts.ts. */
export const MAX_TICKETS_PER_ORDER = 20;
