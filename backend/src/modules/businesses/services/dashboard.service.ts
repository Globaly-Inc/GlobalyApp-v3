// Business dashboard — the /business/portal landing screen.
//
// V1's BusinessDashboard.tsx read exactly four sources: `profiles` (the acting
// user), `credit_wallets`, `enquiry_distributions` and `business_services`. All
// four already exist in V3 with a service in front of them, so this file is
// assembly, not a new data model: it owns no SQL of its own beyond the four
// calls below.
//
// ── why one endpoint and not four calls from the client ──
// The counts are counts. Fetching a page of services purely to read `meta.total`
// off the envelope is three quarters of a wasted query per stat card, and the
// shell already blocks on business context before any of it can start.
//
// ── projection ──
// `req.business` is a whole `BusinessRecord`: `claim_token`, `customer_id`,
// `subscription_id`, `owner_id`, `meta`, `deleted_at`. `projectBusiness` is an
// allowlist, and it is what the unit test asserts negatively against — the risk
// here is not a missing field, it is an extra one.
//
// ── honesty ──
// Every number below is read, never defaulted. `Promise.all` rather than
// `allSettled` on purpose: a read that fails must surface as a 500, because the
// alternative is rendering a fabricated zero next to four real ones.

import type { Knex } from "knex";
import { ForbiddenError } from "../../../shared/errors.js";
import type { BusinessRecord } from "../../../core/types.js";
import * as agentsRepo from "../../agents/repositories/agents.repository.js";
import * as credits from "../../billing/services/credits.service.js";
import * as enquiriesRepo from "../../enquiries/repositories/enquiries.repository.js";
import * as enquiriesService from "../../enquiries/services/enquiries.service.js";
import * as servicesRepo from "../../superadmin/platform/business-services/repositories/business-services.repository.js";

/** V1's sidebar showed five recent leads. */
const RECENT_ENQUIRY_LIMIT = 5;

/** The acting member, as far as the dashboard is concerned. */
export interface MemberSource {
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_owner: boolean;
}

/**
 * The only columns of a business row this endpoint may echo back.
 *
 * Everything omitted is omitted deliberately: billing identifiers, the claim
 * token (a bearer credential in its own right), `owner_id`, `schema_name`,
 * `account_status`, `deleted_at` and the free-form `meta` blob.
 */
export function projectBusiness(business: BusinessRecord) {
  return {
    // BusinessRecord types this as string; the column is a serial. Same
    // narrowing the enquiries and billing routes already do.
    id: Number(business.id),
    business_name: business.business_name,
    subdomain: business.subdomain,
    business_type: business.business_type,
    // Drives V1's "pending verification" banner.
    status: business.status,
    logo_url: business.logo_url,
    verified_at: business.verified_at ?? null,
    is_published: business.is_published,
    onboarding_completed: business.onboarding_completed,
  };
}

/**
 * V1 read `profiles.first_name/last_name` for the greeting. V3's equivalent for
 * a business context is the agents row, which the membership check already
 * fetched — so the greeting costs nothing extra. Contact columns stay off it.
 */
export function projectMember(agent: MemberSource) {
  return {
    first_name: agent.first_name,
    last_name: agent.last_name,
    role: agent.role,
    is_owner: agent.is_owner,
  };
}

export interface DashboardParts {
  business: BusinessRecord;
  agent: MemberSource;
  balance: number;
  enquiriesTotal: number;
  enquiriesLocked: number;
  recentEnquiries: unknown[];
  servicesTotal: number;
  servicesPublished: number;
}

/** Pure assembler — kept separate from the reads so it is testable without a DB. */
export function buildDashboard(parts: DashboardParts) {
  return {
    business: projectBusiness(parts.business),
    member: projectMember(parts.agent),
    credits: { balance: parts.balance },
    enquiries: {
      total: parts.enquiriesTotal,
      locked: parts.enquiriesLocked,
      // Copied, not aliased: the caller's array must not become part of the
      // response by reference.
      recent: [...parts.recentEnquiries],
    },
    services: {
      total: parts.servicesTotal,
      published: parts.servicesPublished,
    },
  };
}

/**
 * @param db  the caller's own tenant schema (req.db)
 * @param business  the resolved tenant (req.business)
 * @param platformUserId  req.auth.sub
 */
export async function getDashboard(db: Knex, business: BusinessRecord, platformUserId: number) {
  const businessId = Number(business.id);

  // Membership check and the greeting's name, in one query.
  //
  // `orgId` only ever reaches a token through switchAccount, which checks
  // membership — but a token outlives the agents row it was issued against
  // (removed from the team, soft-deleted), and the tenant plugin resolves any
  // schema the claim names without asking whether the caller belongs to it. So
  // this re-checks against the tenant schema, which is the only place the answer
  // actually lives. 403 before a single tenant number is read.
  const agent = await agentsRepo.findAgentByPlatformUserId(db, platformUserId);
  if (!agent) throw new ForbiddenError("Not a member of this business");

  const [wallet, enquiriesTotal, enquiriesLocked, recent, servicesTotal, servicesPublished] =
    await Promise.all([
      credits.getBalance(businessId),
      enquiriesRepo.countInbox(businessId, {}),
      enquiriesRepo.countInbox(businessId, { unlocked: false }),
      // Already masked by `toInboxItem` — a locked lead carries a 140-character
      // preview and a first name, and no amount of dashboard code can widen that.
      enquiriesService.listInbox(businessId, { page: 1, limit: RECENT_ENQUIRY_LIMIT }),
      servicesRepo.countServices(db, {}),
      servicesRepo.countServices(db, { is_published: true }),
    ]);

  return buildDashboard({
    business,
    agent,
    balance: wallet.balance,
    enquiriesTotal,
    enquiriesLocked,
    recentEnquiries: recent.data,
    servicesTotal,
    servicesPublished,
  });
}
