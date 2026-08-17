import type { Knex } from "knex";
import { paginationToOffset, buildPaginatedResponse } from "../../../shared/pagination.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import * as repo from "../repositories/activity.repository.js";
import * as agentsRepo from "../../agents/repositories/agents.repository.js";

export async function logActivity(
  db: Knex,
  platformUserId: number,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: Record<string, unknown>,
) {
  const agent = await agentsRepo.findAgentByPlatformUserId(db, platformUserId);
  await repo.insertActivity(db, { agent_id: agent?.id ?? null, action, entity_type: entityType, entity_id: entityId, details });
}

export async function listActivity(db: Knex, pagination: PaginationInput) {
  const { limit, offset } = paginationToOffset(pagination);
  const { rows, total } = await repo.listActivity(db, limit, offset);
  return buildPaginatedResponse(rows, total, pagination);
}
