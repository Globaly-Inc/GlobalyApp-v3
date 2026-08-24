import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/programs.repository.js";
import type { CreateProgramInput, UpdateProgramInput } from "../schemas/ambassadors.schema.js";

export async function list(businessId: number) {
  return repo.listForBusiness(businessId);
}

export async function create(businessId: number, input: CreateProgramInput) {
  return repo.insert({
    business_id: businessId,
    name: input.name,
    description: input.description ?? null,
    commission_type: input.commission_type,
    commission_value: input.commission_value,
    currency: input.currency,
  });
}

export async function getOne(programId: number, businessId: number) {
  const program = await repo.findForBusiness(programId, businessId);
  if (!program) throw new NotFoundError("Ambassador program not found");
  return program;
}

export async function update(programId: number, businessId: number, input: UpdateProgramInput) {
  await getOne(programId, businessId); // 404s before an update that would otherwise silently affect 0 rows
  return repo.update(programId, input);
}
