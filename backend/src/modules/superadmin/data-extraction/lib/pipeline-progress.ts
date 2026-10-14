import { masterKnex } from "../../../../core/db/master-pool.js";

export function freshProgress(bag: Record<string, unknown>) {
  return masterKnex.raw(
    "jsonb_strip_nulls(jsonb_build_object('agentcis_id', pipeline_progress->'agentcis_id')) || ?::jsonb",
    [JSON.stringify(bag)],
  );
}
