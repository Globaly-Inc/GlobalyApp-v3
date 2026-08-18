export const EVENT_STATUS_STYLES: Record<string, string> = {
  published: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  free: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground/70",
};

export const EVENT_STATUS_FILTERS = [
  { value: "", label: "All states" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "Cancelled" },
];

export const EVENT_COLUMNS = ["Event", "Host", "When", "Where", "Type", "State", "Registered", "Views"];

export const REGISTRATION_COLUMNS = [
  "Attendee",
  "Email",
  "Ticket",
  "Seats",
  "Paid",
  "Payment",
  "State",
  "Registered",
];
