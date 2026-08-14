// Validating a buyer's booking answers against the questions their category actually asks.
//
// The questions live in `schema_fields`, defined per category by an admin. That means this file cannot know
// them at compile time and neither can zod — the schema layer only guarantees the shape (flat, scalar), and
// everything about *meaning* is checked here against the definitions read at request time.
//
// The rule throughout: answer an unknown question and it is rejected rather than stored. A jsonb column will
// accept anything, so the only thing standing between it and arbitrary buyer-controlled keys is this.

import { BadRequestError } from "../../../shared/errors.js";
import * as repo from "../repositories/services.repository.js";
import type { BookingAnswers } from "../schemas/services.schema.js";

/** What the booking form needs to render itself, and what validation reads. */
export type BookingField = repo.BookingFieldRow;

export async function fieldsForCategory(categoryId: number): Promise<BookingField[]> {
  return repo.listBookingFields(categoryId);
}

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** ISO date, as `<input type="date">` emits it. Not a full parser — a date is a date, not a moment. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkOne(field: BookingField, raw: unknown): unknown {
  if (isBlank(raw)) {
    if (field.is_required) throw new BadRequestError(`${field.label} is required`);
    return null;
  }

  switch (field.type) {
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new BadRequestError(`${field.label} must be a number`);
      return n;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true" || raw === "false") return raw === "true";
      throw new BadRequestError(`${field.label} must be yes or no`);
    case "date":
      if (typeof raw !== "string" || !DATE_RE.test(raw)) {
        throw new BadRequestError(`${field.label} must be a date`);
      }
      return raw;
    case "select": {
      const allowed = (field.options ?? []).map(String);
      if (typeof raw !== "string" || !allowed.includes(raw)) {
        throw new BadRequestError(`${field.label} must be one of: ${allowed.join(", ")}`);
      }
      return raw;
    }
    case "multi_select": {
      const allowed = (field.options ?? []).map(String);
      const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const bad = values.filter((v) => !allowed.includes(v));
      if (bad.length) throw new BadRequestError(`${field.label}: ${bad.join(", ")} is not an option`);
      return values;
    }
    default:
      // text, and anything an admin invents later — stored as a trimmed string rather than rejected, so a new
      // field type does not take the booking form down until this file catches up.
      return String(raw).trim();
  }
}

/**
 * Validate and normalise the answers for one listing's category.
 *
 * Returns only answers to questions that were actually asked. An answer to an unknown key is an error, not
 * something to quietly drop: silently discarding it would tell the buyer their booking was recorded in full
 * when part of it was thrown away.
 */
export async function validateAnswers(categoryId: number, answers: BookingAnswers): Promise<BookingAnswers> {
  const fields = await repo.listBookingFields(categoryId);
  const known = new Set(fields.map((f) => f.key));

  const unknown = Object.keys(answers).filter((k) => !known.has(k));
  if (unknown.length) {
    throw new BadRequestError(`This service does not ask for: ${unknown.join(", ")}`);
  }

  const clean: BookingAnswers = {};
  for (const field of fields) {
    const value = checkOne(field, answers[field.key]);
    if (value !== null) clean[field.key] = value as BookingAnswers[string];
  }
  return clean;
}

/**
 * Answers rendered for a human, in the order the admin arranged the questions.
 *
 * The seller sees this on the request they are deciding, and the stored keys mean nothing on their own — the
 * label lives in schema_fields, so pairing them has to happen at read time. A question deleted after a
 * booking was made leaves its answer unlabelled rather than hidden: it is still what the buyer told us.
 */
export async function describeAnswers(
  categoryId: number,
  // Widened deliberately: what comes back out of jsonb is whatever was written, and this only renders it.
  answers: Record<string, unknown> | null,
): Promise<{ key: string; label: string; value: string }[]> {
  if (!answers || Object.keys(answers).length === 0) return [];
  const fields = await repo.listBookingFields(categoryId);
  const byKey = new Map(fields.map((f) => [f.key, f]));

  const render = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

  const described = fields
    .filter((f) => answers[f.key] !== undefined)
    .map((f) => ({ key: f.key, label: f.label, value: render(answers[f.key]) }));

  const orphans = Object.keys(answers)
    .filter((k) => !byKey.has(k))
    .map((k) => ({ key: k, label: k, value: render(answers[k]) }));

  return [...described, ...orphans];
}
