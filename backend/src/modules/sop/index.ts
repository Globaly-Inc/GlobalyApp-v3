// SOP generator — the guided Statement-of-Purpose pipeline. Wave E5.
//
// questionnaire → draft → revision → export, with revision history.
//
// GREENFIELD, and verified so before designing. §3.7 lists this feature as "used in
// prod"; it is not. V1's repo carries the migration
// (supabase/migrations/20260701101635_ai_sop_generator.sql) and three edge functions
// (sop-intake, sop-generate, sop-documents), but none of its six tables appear in the
// 199-table live-V1 census that scripts/migration/v1-tables.json captured from the
// frozen project's own `migration-export /tables` endpoint on 2026-07-16, nor in the
// v1_staging extract. There is nothing to migrate and no live behaviour to preserve.
// V2 declares two of the six tables as a verbatim column port, so its "versioned
// documents redesign" is V1's shape with four tables missing. V1's fuller pipeline is
// what is built here, in V3's module shape, with its defects encoded as fixes.
//
// PLACEMENT (§1.2): everything is master (`public`). An SOP belongs to a platform_user,
// who has no candidate tenant schema, and the institution and course it targets are
// references *out* of master — the only direction that works, since a tenant schema
// could not hold a row FK'd to another tenant's course.
//
// PERSONAL ONLY. Registered inside the server's protected scope with no tenant plugin:
// there is no business surface, and the wallet is always the student's own (see
// generation.service.personalScope). V1 additionally let an agent at any business
// holding a distribution for this student's enquiry open, draft and export the SOP.
// That delegation path is deliberately NOT built — it is a second authorization graph
// and a second wallet path, for a feature with zero existing users. The columns it
// needs (`initiated_by`, `is_agent_initiated`) exist, so it is a route away, not a
// migration away.

import type { FastifyInstance } from "fastify";
import { sopRoutes } from "./routes/sop.routes.js";

export default async function sopModule(app: FastifyInstance) {
  await app.register(sopRoutes, { prefix: "/api/v3/personal/sop" });
}
