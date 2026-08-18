// Public certificate verification and admin training monitoring.
//
// ── the verification projection is the security boundary ──
// `verifyCertificate` runs OUTSIDE the authenticated scope. It returns exactly
// what is printed on the credential — holder name, program, issuer, level,
// score, dates, validity — and nothing else. In particular it NEVER returns the
// holder's email or phone, the platform user id, the certificate row id, the
// program id, or the business id: those are internal identifiers that would turn
// a public verifier into an enumeration oracle.
//
// An unknown code is a plain 404. A code that exists but has expired is a 200
// with `valid: false` — "this credential is real and lapsed" is a different and
// more useful answer than "no such credential".

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import type { TargetAudience } from "../consts.js";
import * as repo from "../repositories/training.repository.js";

export async function verifyCertificate(code: string) {
  const row = await repo.findByVerificationCode(code);
  if (!row) throw new NotFoundError("No certificate with that verification code");

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const lapsed = expiresAt !== null && expiresAt.getTime() < Date.now();

  return {
    valid: !row.is_expired && !lapsed,
    verification_code: row.verification_code,
    holder_name:
      `${row.holder_first_name ?? ""} ${row.holder_last_name ?? ""}`.trim() || "Certificate holder",
    program_title: row.program_title ?? null,
    issued_by: row.issued_by ?? null,
    level: row.level,
    score: row.score,
    issued_at: row.issued_at,
    expires_at: row.expires_at,
  };
}

// ── Admin monitoring (requireAdmin) ─────────────────────────────────────────

export interface AdminListQuery extends PaginationInput {
  business_id?: number;
  target_audience?: TargetAudience;
}

export async function listForAdmin(query: AdminListQuery) {
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = masterKnex("training_programs as p").whereNull("p.deleted_at");
    if (query.business_id) q.andWhere("p.business_id", query.business_id);
    if (query.target_audience) q.andWhere("p.target_audience", query.target_audience);
    return q;
  };

  const [rows, countRow] = await Promise.all([
    base()
      .leftJoin("businesses as b", "b.id", "p.business_id")
      .orderBy("p.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .select(
        "p.id",
        "p.business_id",
        "p.title",
        "p.category",
        "p.target_audience",
        "p.is_published",
        "p.is_mandatory",
        "p.passing_score",
        "p.created_at",
        "b.business_name",
        masterKnex.raw(
          `(SELECT count(*) FROM training_chapters c WHERE c.program_id = p.id) AS chapters`,
        ),
        masterKnex.raw(
          `(SELECT count(*) FROM training_assignments a WHERE a.program_id = p.id) AS enrolments`,
        ),
        masterKnex.raw(
          `(SELECT count(*) FROM training_certificates tc WHERE tc.program_id = p.id) AS certificates_issued`,
        ),
      ),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);

  const data = rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    business_id: Number(r.business_id),
    business_name: (r.business_name as string) ?? null,
    title: r.title as string,
    category: (r.category as string) ?? null,
    target_audience: r.target_audience as TargetAudience,
    is_published: r.is_published as boolean,
    is_mandatory: r.is_mandatory as boolean,
    passing_score: Number(r.passing_score),
    created_at: r.created_at as Date,
    chapters: Number(r.chapters ?? 0),
    enrolments: Number(r.enrolments ?? 0),
    certificates_issued: Number(r.certificates_issued ?? 0),
  }));

  return buildPaginatedResponse(data, Number(countRow?.count ?? 0), query);
}

export async function statsForAdmin() {
  const [programs, enrolments, certificates, gamification] = await Promise.all([
    masterKnex("training_programs")
      .whereNull("deleted_at")
      .select(
        masterKnex.raw(`count(*) AS total, count(*) FILTER (WHERE is_published) AS published`),
      )
      .first(),
    masterKnex("training_assignments")
      .select(
        masterKnex.raw(
          `count(*) AS total, count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS last_30_days`,
        ),
      )
      .first(),
    masterKnex("training_certificates")
      .select(
        masterKnex.raw(
          `count(*) AS total, count(*) FILTER (WHERE is_expired) AS expired, count(*) FILTER (WHERE level = 'gold') AS gold`,
        ),
      )
      .first(),
    masterKnex("training_gamification")
      .select(
        masterKnex.raw(
          `count(*) AS learners, coalesce(sum(total_xp), 0) AS total_xp, coalesce(max(longest_streak), 0) AS longest_streak`,
        ),
      )
      .first(),
  ]);

  const n = (v: unknown) => Number(v ?? 0);
  return {
    programs: { total: n(programs?.total), published: n(programs?.published) },
    enrolments: { total: n(enrolments?.total), last_30_days: n(enrolments?.last_30_days) },
    certificates: {
      total: n(certificates?.total),
      expired: n(certificates?.expired),
      gold: n(certificates?.gold),
    },
    gamification: {
      learners: n(gamification?.learners),
      total_xp: n(gamification?.total_xp),
      longest_streak: n(gamification?.longest_streak),
    },
  };
}
