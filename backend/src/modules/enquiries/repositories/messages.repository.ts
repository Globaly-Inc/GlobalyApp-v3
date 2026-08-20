// Enquiry chat messages — reads/writes globalyapp.enquiry_messages.
//
// A thread is identified by its distribution: `enquiry_distributions` already is one
// (enquiry, business) pair, so there is no conversation row to look up first. Same
// shape as other_service_order_messages, where the order is the thread.
//
// Authorization lives in messages.service.ts, not here — this module will happily read
// any thread it is handed.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

const T = "enquiry_messages";

export interface EnquiryMessageRow {
  id: number;
  distribution_id: string;
  sender_id: number;
  body: string;
  created_at: Date;
  sender_name: string;
  /** Raw storage path on platform_users — the service signs it. */
  sender_photo_url: string | null;
}

// last_name is nullable on platform_users, so concat has to tolerate it — matches
// services.repository.ts's fullName().
const fullName = (alias: string) => `trim(concat(${alias}.first_name, ' ', coalesce(${alias}.last_name, '')))`;

const messageQuery = () =>
  masterKnex(`${T} as m`)
    .join("platform_users as u", "u.id", "m.sender_id")
    .select(
      "m.id",
      "m.distribution_id",
      "m.sender_id",
      "m.body",
      "m.created_at",
      "u.photo_url as sender_photo_url",
      masterKnex.raw(`${fullName("u")} as sender_name`),
    );

/** Oldest first — a conversation reads top to bottom. */
export async function listByDistribution(distributionId: string): Promise<EnquiryMessageRow[]> {
  return messageQuery()
    .where("m.distribution_id", distributionId)
    .orderBy("m.created_at", "asc") as unknown as Promise<EnquiryMessageRow[]>;
}

export async function insert(data: {
  distribution_id: string;
  sender_id: number;
  body: string;
}): Promise<EnquiryMessageRow> {
  const [inserted] = await masterKnex(T).insert(data).returning("id");
  // Re-read through the join so the caller gets sender_name without a second shape.
  const row = await messageQuery().where("m.id", inserted.id).first();
  return row as EnquiryMessageRow;
}

/**
 * Same insert, on a caller's transaction — the unlock flow seeds the thread's opening
 * message and it must commit with the unlock, not separately. No re-read: the caller
 * doesn't need the row back, and the joined read wouldn't see an uncommitted insert.
 */
export async function insertInTrx(
  trx: Knex.Transaction,
  data: { distribution_id: string; sender_id: number; body: string },
): Promise<void> {
  await trx(T).insert(data);
}

/**
 * The distribution plus the parent enquiry's owner — everything the service needs to
 * decide who may read or write this thread, in one round trip.
 */
export async function findThreadContext(distributionId: string) {
  return masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .where("d.id", distributionId)
    .whereNull("d.deleted_at")
    .first(
      "d.id as distribution_id",
      "d.business_id",
      "d.status",
      "d.unlocked_at",
      "e.id as enquiry_id",
      "e.student_id",
    );
}

export interface ThreadSummaryRow {
  distribution_id: string;
  enquiry_id: string;
  status: string;
  unlocked_at: Date;
  business_name: string;
  logo_url: string | null;
  course_name: string;
  last_message_at: Date | null;
}

/**
 * Every thread a student has, newest activity first — the inbox behind
 * /personal/messages. Only UNLOCKED distributions exist as threads, so the
 * `unlocked_at` filter is what makes a row a conversation.
 *
 * The last-message timestamp comes from a grouped subquery rather than a lateral join:
 * only the time is needed (for ordering and the row's date), not the body.
 */
export async function listThreadsForStudent(studentId: number): Promise<ThreadSummaryRow[]> {
  const lastMessage = masterKnex(T)
    .select("distribution_id")
    .max("created_at as last_message_at")
    .groupBy("distribution_id")
    .as("lm");

  return masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .join("businesses as b", "b.id", "d.business_id")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin(lastMessage, "lm.distribution_id", "d.id")
    .where("e.student_id", studentId)
    .whereNotNull("d.unlocked_at")
    .whereNull("d.deleted_at")
    .whereNull("e.deleted_at")
    .orderByRaw("coalesce(lm.last_message_at, d.unlocked_at) desc")
    .select(
      "d.id as distribution_id",
      "e.id as enquiry_id",
      "d.status",
      "d.unlocked_at",
      "b.business_name",
      "b.logo_url",
      "c.name as course_name",
      "lm.last_message_at",
    ) as unknown as Promise<ThreadSummaryRow[]>;
}
