import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";

export const EVENT_STATUSES = ["draft", "published", "cancelled", "completed"] as const;
export const EVENT_VISIBILITIES = ["public", "members", "invite_only"] as const;
export const EVENT_TYPES = ["in_person", "online", "hybrid"] as const;
export const REGISTRATION_STATUSES = ["registered", "checked_in", "cancelled"] as const;
export const COHOST_STATUSES = ["pending", "accepted", "declined"] as const;

export const EventInputSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(10000).nullable().optional(),
    event_type: z.enum(EVENT_TYPES).default("in_person"),
    status: z.enum(EVENT_STATUSES).default("draft"),
    visibility: z.enum(EVENT_VISIBILITIES).default("public"),
    target_audiences: z.array(z.string()).default([]),
    venue_name: z.string().max(200).nullable().optional(),
    venue_address: z.string().max(500).nullable().optional(),
    venue_city: z.string().max(120).nullable().optional(),
    venue_country: z.string().max(120).nullable().optional(),
    online_url: z.string().url().nullable().optional(),
    online_platform: z.string().max(120).nullable().optional(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    timezone: z.string().max(60).nullable().optional(),
    max_capacity: z.number().int().positive().nullable().optional(),
    registration_deadline: z.coerce.date().nullable().optional(),
    contact_email: z.string().email().nullable().optional(),
    contact_phone: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.ends_at >= v.starts_at, { message: "ends_at must be on/after starts_at", path: ["ends_at"] });

export const EventPatchInputSchema = EventInputSchema.innerType().partial();

export const EventIdParamSchema = z.object({ eventId: z.coerce.number().int().positive() });

export const ListEventsQuerySchema = PaginationSchema.extend({
  status: z.enum(EVENT_STATUSES).optional(),
  search: z.string().optional(),
});

export const CancelEventSchema = z.object({ reason: z.string().max(1000).optional() });

export const TicketInputSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  quantity: z.number().int().positive().nullable().optional(),
  max_per_order: z.number().int().positive().default(10),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const TicketPatchInputSchema = TicketInputSchema.partial();

export const TicketIdParamSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  ticketId: z.coerce.number().int().positive(),
});

export const RegistrationInputSchema = z.object({
  ticket_id: z.number().int().positive().nullable().optional(),
  registrant_name: z.string().min(1).max(200),
  registrant_email: z.string().email(),
  registrant_phone: z.string().max(40).nullable().optional(),
  quantity: z.number().int().positive().default(1),
  notes: z.string().max(1000).nullable().optional(),
});

export const RegistrationIdParamSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  registrationId: z.coerce.number().int().positive(),
});

export const CheckInInputSchema = z.object({ checkIn: z.boolean() });

export const CoHostInviteSchema = z.object({
  host_business_id: z.number().int().positive(),
  role: z.string().max(60).default("co_host"),
});

export const CoHostIdParamSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  coHostId: z.coerce.number().int().positive(),
});

export const CoHostRespondSchema = z.object({ accept: z.boolean() });

export const UpdateInputSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1).max(10000),
});
