// Pure translation between the ticket dialog's form state and the TicketInput body.

import type { EventTicket, TicketInput } from "../apis";
import { MAX_TICKETS_PER_ORDER } from "../const";
import { fromLocalInput, nullIfBlank, numberOrNull, toLocalInput } from "./index";

export interface TicketForm {
  name: string;
  description: string;
  price: string;
  currency: string;
  quantity: string;
  max_per_order: string;
  sale_starts_at: string;
  sale_ends_at: string;
  is_active: boolean;
  sort_order: string;
}

export const EMPTY_TICKET_FORM: TicketForm = {
  name: "",
  description: "",
  price: "0",
  currency: "USD",
  quantity: "",
  max_per_order: "10",
  sale_starts_at: "",
  sale_ends_at: "",
  is_active: true,
  sort_order: "0",
};

export function formFromTicket(ticket: EventTicket): TicketForm {
  return {
    name: ticket.name,
    description: ticket.description ?? "",
    price: String(ticket.price),
    currency: ticket.currency,
    quantity: ticket.quantity === null ? "" : String(ticket.quantity),
    max_per_order: String(ticket.max_per_order),
    sale_starts_at: toLocalInput(ticket.sale_starts_at),
    sale_ends_at: toLocalInput(ticket.sale_ends_at),
    is_active: ticket.is_active,
    sort_order: String(ticket.sort_order),
  };
}

export function validateTicketForm(form: TicketForm): Partial<Record<keyof TicketForm, string>> {
  const errors: Partial<Record<keyof TicketForm, string>> = {};
  if (form.name.trim().length < 1) errors.name = "Ticket name is required";

  const price = Number(form.price);
  if (!Number.isFinite(price) || price < 0) errors.price = "Price must be zero or more";

  if (form.currency.trim().length !== 3) errors.currency = "Use a 3-letter currency code";

  const quantity = form.quantity.trim();
  if (quantity && !(Number.isInteger(Number(quantity)) && Number(quantity) > 0)) {
    errors.quantity = "Capacity must be a whole number above zero";
  }

  const perOrder = Number(form.max_per_order);
  if (!Number.isInteger(perOrder) || perOrder < 1 || perOrder > MAX_TICKETS_PER_ORDER) {
    errors.max_per_order = `Between 1 and ${MAX_TICKETS_PER_ORDER}`;
  }

  if (form.sale_starts_at && form.sale_ends_at && new Date(form.sale_ends_at) < new Date(form.sale_starts_at)) {
    errors.sale_ends_at = "Sales must not end before they start";
  }

  const sort = Number(form.sort_order);
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) errors.sort_order = "Between 0 and 9999";

  return errors;
}

export function formToTicketInput(form: TicketForm): TicketInput {
  return {
    name: form.name.trim(),
    description: nullIfBlank(form.description),
    price: Number(form.price),
    currency: form.currency.trim().toUpperCase(),
    quantity: numberOrNull(form.quantity),
    max_per_order: Number(form.max_per_order),
    sale_starts_at: fromLocalInput(form.sale_starts_at),
    sale_ends_at: fromLocalInput(form.sale_ends_at),
    is_active: form.is_active,
    sort_order: Number(form.sort_order),
  };
}
