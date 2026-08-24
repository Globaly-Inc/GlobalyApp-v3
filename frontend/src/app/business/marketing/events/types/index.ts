import type { EventType, EventVisibility, EventStatus } from "../apis/types";

/** UI-only form state — string inputs (datetime-local, number fields) that get
 * parsed/validated into an EventInput on submit. Not a wire type. */
export type EventFormState = {
  title: string;
  description: string;
  event_type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  target_audiences: string[];
  venue_name: string;
  venue_address: string;
  venue_city: string;
  venue_country: string;
  online_url: string;
  online_platform: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  max_capacity: string;
  registration_deadline: string;
  contact_email: string;
  contact_phone: string;
};

export const EMPTY_EVENT_FORM: EventFormState = {
  title: "",
  description: "",
  event_type: "in_person",
  status: "draft",
  visibility: "public",
  target_audiences: [],
  venue_name: "",
  venue_address: "",
  venue_city: "",
  venue_country: "",
  online_url: "",
  online_platform: "",
  starts_at: "",
  ends_at: "",
  timezone: "",
  max_capacity: "",
  registration_deadline: "",
  contact_email: "",
  contact_phone: "",
};
