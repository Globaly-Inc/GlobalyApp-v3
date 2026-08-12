// Service layer for all service category extraction tables.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/services.repository.js";
import type { ServiceType } from "../schemas/services.schema.js";

const AUDIT_PREFIX: Record<ServiceType, string> = {
  accommodation: "ACCOMMODATION",
  insurance: "INSURANCE",
  banking: "BANKING",
  visa_services: "VISA_SERVICE",
  test_preparation: "TEST_PREP",
  career_services: "CAREER_SERVICE",
  translation: "TRANSLATION",
  transport: "TRANSPORT",
};

function tableFor(t: ServiceType) {
  return `extraction_${t === "visa_services" ? "visa_services" : t}`;
}

export async function listItems(
  serviceType: ServiceType,
  opts: { status?: string; job_id?: string; limit: number },
) {
  const [items, counts] = await Promise.all([
    repo.listItems(serviceType, opts),
    repo.countByStatus(serviceType),
  ]);
  return { items, counts };
}

export async function getItem(serviceType: ServiceType, id: string) {
  const item = await repo.getItem(serviceType, id);
  if (!item) throw new NotFoundError(`${serviceType} item not found`);
  return { item };
}

export async function discardItem(serviceType: ServiceType, id: string, adminId: number) {
  const found = await repo.updateStatus(serviceType, id, "discarded");
  if (!found) throw new NotFoundError(`${serviceType} item not found`);
  await logAudit(adminId, `${AUDIT_PREFIX[serviceType]}_DISCARD`, {
    entityType: tableFor(serviceType),
    entityId: id,
  });
  return { updated: true };
}

export async function updateItem(
  serviceType: ServiceType,
  id: string,
  data: Record<string, unknown>,
  adminId: number,
) {
  const found = await repo.updateItem(serviceType, id, data);
  if (!found) throw new NotFoundError(`${serviceType} item not found`);
  await logAudit(adminId, `${AUDIT_PREFIX[serviceType]}_UPDATE`, {
    entityType: tableFor(serviceType),
    entityId: id,
  });
  return { updated: true };
}

export async function deleteItem(serviceType: ServiceType, id: string, adminId: number) {
  const found = await repo.deleteItem(serviceType, id);
  if (!found) throw new NotFoundError(`${serviceType} item not found`);
  await logAudit(adminId, `${AUDIT_PREFIX[serviceType]}_DELETE`, {
    entityType: tableFor(serviceType),
    entityId: id,
  });
  return { updated: true };
}

export async function promoteItem(
  serviceType: ServiceType,
  id: string,
  adminId: number,
) {
  const resultId = await repo.promoteItem(serviceType, id);
  await logAudit(adminId, `${AUDIT_PREFIX[serviceType]}_PROMOTE`, {
    entityType: tableFor(serviceType),
    entityId: id,
  });
  return { id: resultId };
}
