// Eligibility orchestration.
//
// Every function takes the owner id as its first argument and every caller passes
// req.auth.sub — there is no code path that derives the owner from anything a
// client sent, and no route accepts a user id.
//
// FAIL CLOSED. A check is a claim about whether someone may apply for a degree, so
// every input the verdict depends on must be present or the request fails:
//   no profile row                -> 404, "complete your profile"
//   service not live in catalog   -> 404
//   tenant schema unreachable, or the tenant row gone -> 503
// The 503 is the important one. `category_specific_data` holds every requirement,
// so an empty blob evaluates to "eligible" against nothing — reading it as `{}`
// when the read FAILED would hand the student a fabricated pass. It is the one
// branch where "no data" and "no requirements" are different facts, and only the
// caller of the tenant read can tell them apart.

import { AppError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { buildPaginatedResponse, paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import { evaluate, type EligibilityProfile } from "../lib/rules.js";
import * as repo from "../repositories/eligibility.repository.js";

const logger = createChildLogger("eligibility");

/** jsonb -> the ids the rule engine compares. A malformed blob is no preferences, not a crash. */
function destinationIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => Number(v)).filter((v) => Number.isInteger(v));
}

/** pg returns numeric/decimal columns as strings. The column types make a non-numeric string impossible. */
function toNumber(raw: string | number | null): number | null {
  return raw === null ? null : Number(raw);
}

function toEligibilityProfile(row: repo.ProfileRow): EligibilityProfile {
  return {
    highest_degree_level: row.highest_degree_level,
    gpa: toNumber(row.gpa),
    english_test_type: row.english_test_type,
    english_test_score: toNumber(row.english_test_score),
    budget_max: row.budget_max,
    preferred_destination_ids: destinationIds(row.preferred_destinations),
  };
}

/**
 * Run V1's rules against the caller's profile and persist the verdict.
 *
 * V1 charged 5 credits before evaluating. That is deliberately NOT ported — see the
 * module README in index.ts.
 *
 * V1's page hid the form below 50% profile completion but its FUNCTION did not
 * enforce it, so neither does this. `profile_completion_percentage` is returned so
 * the same banner can be rendered without a second request.
 */
export async function run(userId: number, input: { service_id: string }) {
  const profileRow = await repo.findProfile(userId);
  if (!profileRow) {
    throw new NotFoundError("Complete your profile before running an eligibility check.");
  }

  const service = await repo.findCheckableService(input.service_id);
  // 404 and not 403: a service that is not published must not be distinguishable
  // from one that does not exist.
  if (!service) throw new NotFoundError("Service not found");

  let requirements: Record<string, unknown>;
  try {
    const blob = await repo.findServiceRequirements(service.schema_name, service.service_id);
    if (blob === undefined) {
      // The projection says the service is live but the tenant row is gone. The
      // requirements are unknown, so no verdict is honest.
      throw new Error("tenant service row missing");
    }
    requirements = blob;
  } catch (error) {
    logger.error("eligibility: could not read the service's requirements — failing closed", {
      service_id: service.service_id,
      // String(), not error.message: a non-Error throw must still log something.
      reason: String(error),
    });
    throw new AppError(
      "This course's requirements are temporarily unavailable. Please try again shortly.",
      503,
      "ELIGIBILITY_REQUIREMENTS_UNAVAILABLE",
    );
  }

  const verdict = evaluate(toEligibilityProfile(profileRow), {
    price: toNumber(service.price),
    price_currency: service.price_currency,
    country_id: service.country_id,
    country_name: service.country_name,
    requirements,
  });

  const row = await repo.insert(userId, { service_id: service.service_id, ...verdict });

  return {
    data: {
      ...row,
      service: { service_id: service.service_id, name: service.name },
      profile_completion_percentage: profileRow.completion_percentage ?? 0,
    },
  };
}

/** The caller's own history, newest first — V1's page, one query per page not per row. */
export async function list(userId: number, query: PaginationInput) {
  const { limit, offset } = paginationToOffset(query);
  const [rows, total] = await Promise.all([repo.list(userId, { limit, offset }), repo.count(userId)]);

  const services = await repo.resolveServices(rows.map((r) => r.service_id));

  const data = rows.map((row) => ({
    ...row,
    // null when the service has since been removed — V1 rendered `undefined`.
    service: services.get(row.service_id) ?? null,
  }));

  return buildPaginatedResponse(data, total, query);
}
