// Zod boundary for the events module. Every route parses through here before
// touching a service.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import {
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  EVENT_VISIBILITIES,
  MAX_TICKETS_PER_ORDER,
} from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const IdOrSlugParamSchema = z.object({ idOrSlug: z.string().min(1).max(200) });
export const TicketParamSchema = IdParamSchema.extend({
  ticketId: z.coerce.number().int().positive(),
});

export const BrowseEventsQuerySchema = PaginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  event_type: z.enum(EVENT_TYPES).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  upcoming: z.coerce.boolean().optional(),
});

export const AdminEventsQuerySchema = PaginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  event_type: z.enum(EVENT_TYPES).optional(),
});

export const HostEventsQuerySchema = PaginationSchema.extend({
  status: z.enum(EVENT_STATUSES).optional(),
});

export const RegistrationsQuerySchema = PaginationSchema.extend({
  status: z.enum(["registered", "checked_in", "cancelled"]).optional(),
});

const isoDate = z.string().datetime({ offset: true });

/** Fields a host may set. Host org and created_by come from the JWT, never the body. */
export const CreateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(300),
    description: z.string().max(20_000).nullish(),
    summary: z.string().max(1000).nullish(),
    cover_image_url: z.string().url().max(2000).nullish(),
    event_type: z.enum(EVENT_TYPES).default("in_person"),
    category: z.enum(EVENT_CATEGORIES).nullish(),
    status: z.enum(EVENT_STATUSES).default("draft"),
    visibility: z.enum(EVENT_VISIBILITIES).default("public"),
    target_audiences: z.array(z.string().max(100)).max(50).nullish(),
    target_countries: z.array(z.string().max(100)).max(250).nullish(),
    venue_name: z.string().max(300).nullish(),
    venue_address: z.string().max(500).nullish(),
    venue_city: z.string().max(200).nullish(),
    venue_country: z.string().max(100).nullish(),
    venue_latitude: z.number().min(-90).max(90).nullish(),
    venue_longitude: z.number().min(-180).max(180).nullish(),
    online_url: z.string().url().max(2000).nullish(),
    online_platform: z.string().max(100).nullish(),
    starts_at: isoDate,
    ends_at: isoDate,
    timezone: z.string().max(100).nullish(),
    max_capacity: z.number().int().positive().nullish(),
    registration_deadline: isoDate.nullish(),
    tags: z.array(z.string().max(60)).max(30).nullish(),
    contact_email: z.string().email().max(320).nullish(),
    contact_phone: z.string().max(50).nullish(),
  })
  .strict()
  .refine((v) => new Date(v.ends_at) >= new Date(v.starts_at), {
    message: "ends_at must not be before starts_at",
    path: ["ends_at"],
  });

export const UpdateEventSchema = CreateEventSchema.innerType()
  .partial()
  .extend({ cancellation_reason: z.string().max(1000).nullish() })
  .strict()
  .refine(
    (v) => !(v.starts_at && v.ends_at) || new Date(v.ends_at) >= new Date(v.starts_at),
    { message: "ends_at must not be before starts_at", path: ["ends_at"] },
  );

export const CreateTicketSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2000).nullish(),
    price: z.number().min(0).max(1_000_000).default(0),
    currency: z.string().trim().length(3).default("USD"),
    quantity: z.number().int().positive().nullish(),
    max_per_order: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER).default(10),
    sale_starts_at: isoDate.nullish(),
    sale_ends_at: isoDate.nullish(),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(9999).default(0),
  })
  .strict();

export const UpdateTicketSchema = CreateTicketSchema.partial().strict();

export const RegisterSchema = z
  .object({
    ticket_id: z.number().int().positive().nullish(),
    quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER).default(1),
    notes: z.string().max(2000).nullish(),
  })
  .strict();

export const CheckoutSchema = z
  .object({
    ticket_id: z.number().int().positive(),
    quantity: z.number().int().min(1).max(MAX_TICKETS_PER_ORDER).default(1),
  })
  .strict();

export const VerifyPaymentSchema = z
  .object({ session_id: z.string().trim().min(3).max(200).startsWith("cs_") })
  .strict();

export const CheckInSchema = z
  .object({ status: z.enum(["registered", "checked_in", "cancelled"]) })
  .strict();

export const CreateUpdateSchema = z
  .object({
    title: z.string().trim().max(300).nullish(),
    content: z.string().trim().min(1).max(20_000),
  })
  .strict();

export type BrowseEventsQuery = z.infer<typeof BrowseEventsQuerySchema>;
export type AdminEventsQuery = z.infer<typeof AdminEventsQuerySchema>;
export type HostEventsQuery = z.infer<typeof HostEventsQuerySchema>;
export type RegistrationsQuery = z.infer<typeof RegistrationsQuerySchema>;
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;
export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type CheckoutInput = z.infer<typeof CheckoutSchema>;
