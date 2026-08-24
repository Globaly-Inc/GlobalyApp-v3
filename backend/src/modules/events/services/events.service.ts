import { NotFoundError } from "../../../shared/errors.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import { paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/events.repository.js";
import * as registrationsRepo from "../repositories/registrations.repository.js";
import type { CreateEventInput, UpdateEventInput } from "../schemas/events.schema.js";

export async function listForBusiness(businessId: number) {
  const events = await repo.listForBusiness(businessId);
  const counts = await Promise.all(events.map((e) => registrationsRepo.countForEvent(e.id)));
  return events.map((event, i) => ({ ...event, registrant_count: counts[i] }));
}

export async function listPublished(pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  return repo.listPublished(limit, offset);
}

export async function create(businessId: number, input: CreateEventInput) {
  return repo.insert({ business_id: businessId, ...input });
}

export async function getOne(eventId: number, businessId: number) {
  const event = await repo.findForBusiness(eventId, businessId);
  if (!event) throw new NotFoundError("Event not found");
  return event;
}

export async function getPublic(eventId: number) {
  const event = await repo.findById(eventId);
  if (!event || event.status !== "published") throw new NotFoundError("Event not found");
  return event;
}

export async function update(eventId: number, businessId: number, input: UpdateEventInput) {
  await getOne(eventId, businessId);
  return repo.update(eventId, input);
}

export async function remove(eventId: number, businessId: number) {
  await getOne(eventId, businessId);
  await repo.softDelete(eventId);
}

export async function listRegistrants(eventId: number, businessId: number) {
  await getOne(eventId, businessId);
  return registrationsRepo.listForEvent(eventId);
}
