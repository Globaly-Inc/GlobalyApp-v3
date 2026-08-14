import type { Knex } from "knex";

export interface ActivityRow {
  id: number;
  agent_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: Date;
  agent_first_name: string | null;
  agent_last_name: string | null;
}

export async function insertActivity(db: Knex, data: {
  agent_id: number | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
}) {
  await db("business_activity_log").insert({ ...data, details: JSON.stringify(data.details ?? {}) });
}

export async function listActivity(db: Knex, limit: number, offset: number) {
  const base = () => db("business_activity_log as l");
  const [{ count }] = await base().count<{ count: string }[]>("l.id as count");
  const rows = await base()
    .leftJoin("agents as a", "a.id", "l.agent_id")
    .select(
      "l.id", "l.agent_id", "l.action", "l.entity_type", "l.entity_id", "l.details", "l.created_at",
      "a.first_name as agent_first_name", "a.last_name as agent_last_name",
    )
    .orderBy("l.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}
