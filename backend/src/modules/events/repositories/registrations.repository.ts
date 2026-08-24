import { masterKnex } from "../../../core/db/master-pool.js";
import type { RegistrationStatus } from "../consts.js";

export interface RegistrationRow {
  id: number;
  event_id: number;
  user_id: number;
  status: RegistrationStatus;
  created_at: Date;
  updated_at: Date;
}

export interface HydratedRegistrationRow extends RegistrationRow {
  attendee_name: string;
  attendee_email: string;
}

export async function countForEvent(eventId: number): Promise<number> {
  const [{ count }] = await masterKnex("event_registrations")
    .where({ event_id: eventId, status: "registered" })
    .count<{ count: string }[]>("* as count");
  return Number(count);
}

export async function listForEvent(eventId: number): Promise<HydratedRegistrationRow[]> {
  return masterKnex<HydratedRegistrationRow>("event_registrations as er")
    .join("platform_users as u", "u.id", "er.user_id")
    .where("er.event_id", eventId)
    .select("er.*", masterKnex.raw("trim(concat(u.first_name, ' ', u.last_name)) as attendee_name"), "u.email as attendee_email")
    .orderBy("er.created_at", "desc");
}

export async function findByEventAndUser(eventId: number, userId: number): Promise<RegistrationRow | undefined> {
  return masterKnex<RegistrationRow>("event_registrations").where({ event_id: eventId, user_id: userId }).first();
}

export async function insert(eventId: number, userId: number): Promise<RegistrationRow> {
  const [row] = await masterKnex<RegistrationRow>("event_registrations")
    .insert({ event_id: eventId, user_id: userId })
    .returning("*");
  return row;
}

export async function cancel(id: number): Promise<RegistrationRow> {
  const [row] = await masterKnex<RegistrationRow>("event_registrations")
    .where({ id })
    .update({ status: "cancelled", updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}
