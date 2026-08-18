// Business-owner management of its own embed configs.
//
// The table shipped in 20260816_001 with no way to create a row, so §3.8's
// "widget endpoints … MISSING" could not be closed without this: the origin
// allowlist is the widget's security boundary and a tenant has to be able to set it.
//
// Authenticated + business-scoped. Every read and write is filtered by
// the caller's own business id in the repository, so an owner of business A cannot see or patch
// business B's config even by guessing an id — the cross-tenant isolation §1.6
// requires, tested in tests/integration/ai-embed.test.ts.
//
// These responses DO include allowed_origins and the credit counters: the caller is
// the authenticated owner of the row. Only the public widget surface gets the
// projection.

import type { FastifyInstance } from "fastify";

import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/embed-config.repository.js";
import {
  CreateEmbedConfigSchema,
  EmbedConfigIdParamSchema,
  UpdateEmbedConfigSchema,
} from "../schemas/embed.schema.js";

/** Owner-facing shape. Explicit, like every other projection in this module. */
function toOwnerConfig(row: repo.EmbedConfigRow) {
  return {
    id: row.id,
    embed_key: row.embed_key,
    display_name: row.display_name,
    logo_url: row.logo_url,
    brand_color: row.brand_color,
    business_type: row.business_type,
    custom_instructions: row.custom_instructions,
    welcome_message: row.welcome_message,
    starter_questions: row.starter_questions ?? [],
    allowed_origins: row.allowed_origins,
    scoped_institution_ids: row.scoped_institution_ids ?? [],
    scoped_agent_id: row.scoped_agent_id,
    monthly_credit_limit: row.monthly_credit_limit,
    credits_used_this_month: row.credits_used_this_month,
    month_reset_at: row.month_reset_at,
    overage_enabled: row.overage_enabled,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function embedConfigRoutes(app: FastifyInstance) {
  app.get("/configs", { preHandler: [requireBusinessContext] }, async (req, reply) => {
    const rows = await repo.listForBusiness(Number(req.business!.id));
    return reply.send({ configs: rows.map(toOwnerConfig) });
  });

  app.post("/configs", { preHandler: [requireBusinessContext] }, async (req, reply) => {
    const input = CreateEmbedConfigSchema.parse(req.body ?? {});
    const row = await repo.create(Number(req.business!.id), input);
    return reply.code(201).send({ config: toOwnerConfig(row) });
  });

  app.patch("/configs/:id", { preHandler: [requireBusinessContext] }, async (req, reply) => {
    const { id } = EmbedConfigIdParamSchema.parse(req.params);
    const input = UpdateEmbedConfigSchema.parse(req.body ?? {});

    const row = await repo.update(id, Number(req.business!.id), input);
    // A miss is a 404 whether the row belongs to someone else or does not exist —
    // the owner of business A learns nothing about business B's ids.
    if (!row) throw new NotFoundError("Embed config not found");

    return reply.send({ config: toOwnerConfig(row) });
  });
}
