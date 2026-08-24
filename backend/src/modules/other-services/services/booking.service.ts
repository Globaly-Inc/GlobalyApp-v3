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
/** 24-hour clock, seconds optional — what `<input type="time">` emits. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** `<input type="datetime-local">`: a date and a time joined by T, no zone. */
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
/** Deliberately permissive — an address is valid if it can receive mail, which we cannot know here. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Digits with the punctuation people actually type, and a plausible length. Not an E.164 check. */
const PHONE_RE = /^\+?[\d\s()./-]{6,20}$/;

/**
 * Apply the admin's bounds to an already-typed answer.
 *
 * min/max read as numeric bounds on a number and as length bounds on everything else, because that is
 * what an admin means by them; min_length/max_length are always about length. The pattern is
 * admin-authored, so a regex that does not compile is ignored rather than allowed to 500 a booking.
 */
function checkBounds(field: BookingField, value: unknown): void {
  const rules = field.validation;
  if (!rules) return;

  if (typeof value === "number") {
    if (rules.min !== undefined && value < rules.min) {
      throw new BadRequestError(`${field.label} must be at least ${rules.min}`);
    }
    if (rules.max !== undefined && value > rules.max) {
      throw new BadRequestError(`${field.label} must be at most ${rules.max}`);
    }
    return;
  }

  const length = typeof value === "string" ? value.length : Array.isArray(value) ? value.length : undefined;
  if (length !== undefined) {
    const min = rules.min_length ?? rules.min;
    const max = rules.max_length ?? rules.max;
    const unit = Array.isArray(value) ? "option" : "character";
    if (min !== undefined && length < min) {
      throw new BadRequestError(`${field.label} needs at least ${min} ${unit}${min === 1 ? "" : "s"}`);
    }
    if (max !== undefined && length > max) {
      throw new BadRequestError(`${field.label} must be ${max} ${unit}${max === 1 ? "" : "s"} or fewer`);
    }
  }

  if (rules.pattern && typeof value === "string") {
    let re: RegExp;
    try {
      re = new RegExp(rules.pattern);
    } catch {
      return; // An admin typo in the pattern must not block every booking for this category.
    }
    if (!re.test(value)) throw new BadRequestError(`${field.label} is not in the expected format`);
  }
}

/** One choice from the configured options. `select` and `radio` differ only in how they are drawn. */
function checkChoice(field: BookingField, raw: unknown): string {
  const allowed = (field.options ?? []).map(String);
  if (typeof raw !== "string" || !allowed.includes(raw)) {
    throw new BadRequestError(`${field.label} must be one of: ${allowed.join(", ")}`);
  }
  return raw;
}

/** Any number of the configured options. `multi_select` and `checkbox` differ only in how they are drawn. */
function checkChoices(field: BookingField, raw: unknown): string[] {
  const allowed = (field.options ?? []).map(String);
  const values = Array.isArray(raw) ? raw.map(String) : [String(raw)];
  const bad = values.filter((v) => !allowed.includes(v));
  if (bad.length) throw new BadRequestError(`${field.label}: ${bad.join(", ")} is not an option`);
  return values;
}

function matching(field: BookingField, raw: unknown, re: RegExp, expected: string): string {
  if (typeof raw !== "string" || !re.test(raw.trim())) {
    throw new BadRequestError(`${field.label} must be ${expected}`);
  }
  return raw.trim();
}

function coerce(field: BookingField, raw: unknown): unknown {
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
      return matching(field, raw, DATE_RE, "a date");
    case "time":
      return matching(field, raw, TIME_RE, "a time");
    case "datetime":
      return matching(field, raw, DATETIME_RE, "a date and time");
    case "email":
      return matching(field, raw, EMAIL_RE, "an email address");
    case "phone":
      return matching(field, raw, PHONE_RE, "a phone number");
    case "select":
    case "radio":
      return checkChoice(field, raw);
    case "multi_select":
    case "checkbox":
      return checkChoices(field, raw);
    default:
      // text, long_text, and anything an admin invents later — stored as a trimmed string rather than
      // rejected, so a new field type does not take the booking form down until this file catches up.
      return String(raw).trim();
  }
}

function checkOne(field: BookingField, raw: unknown): unknown {
  if (isBlank(raw)) {
    if (field.is_required) throw new BadRequestError(`${field.label} is required`);
    return null;
  }
  const value = coerce(field, raw);
  checkBounds(field, value);
  return value;
}

/**
 * Validate and normalise the answers for one listing's category.
 *
 * Returns only answers to questions that were actually asked. An answer to an unknown key is an error, not
 * something to quietly drop: silently discarding it would tell the buyer their booking was recorded in full
 * when part of it was thrown away.
 */
export async function validateAnswers(categoryId: number, answers: BookingAnswers): Promise<BookingAnswers> {
  return validateAgainstFields(await repo.listBookingFields(categoryId), answers);
}

/** The rules themselves, with the definitions already loaded. Split out so it can be tested without a DB. */
export function validateAgainstFields(fields: BookingField[], answers: BookingAnswers): BookingAnswers {
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
