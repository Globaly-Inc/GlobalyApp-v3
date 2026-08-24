import { masterKnex } from "../../../core/db/master-pool.js";
import { ConflictError, NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/registrations.repository.js";

export async function register(eventId: number, userId: number) {
  return masterKnex.transaction(async (trx) => {
    const event = await trx("events").where({ id: eventId }).whereNull("deleted_at").forUpdate().first();
    if (!event || event.status !== "published") throw new NotFoundError("Event not found");

    const existing = await repo.findByEventAndUser(eventId, userId);
    if (existing?.status === "registered") return existing;

    if (event.capacity != null) {
      const count = await repo.countForEvent(eventId);
      if (count >= event.capacity) throw new ConflictError("This event is full");
    }

    if (existing) {
      const [row] = await trx("event_registrations")
        .where({ id: existing.id })
        .update({ status: "registered", updated_at: trx.fn.now() })
        .returning("*");
      return row;
    }
    const [row] = await trx("event_registrations").insert({ event_id: eventId, user_id: userId }).returning("*");
    return row;
  });
}

export async function unregister(eventId: number, userId: number) {
  const existing = await repo.findByEventAndUser(eventId, userId);
  if (!existing || existing.status === "cancelled") throw new NotFoundError("Registration not found");
  return repo.cancel(existing.id);
}
