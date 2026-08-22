// Extraction visa services service.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import * as repo from "../repositories/visa-services.repository.js";
import type { PatchVisaServiceInput } from "../schemas/visa-services.schema.js";

export async function listVisaServices(jobId: string, status?: string) {
  const [visa_services, statusCounts] = await Promise.all([
    repo.listVisaServicesByJob(jobId, status),
    repo.countVisaServicesByStatus(jobId),
  ]);
  return { visa_services, statusCounts };
}

export async function patchVisaService(id: string, input: PatchVisaServiceInput, adminId: number) {
  const found = await repo.updateVisaService(id, input);
  if (!found) throw new NotFoundError("Visa service not found");
  await logAudit(adminId, "VISA_SERVICE_PATCH", { entityType: "extraction_visa_services", entityId: id });
  return { updated: true };
}

export async function approveVisaService(id: string, adminId: number) {
  const found = await repo.updateVisaService(id, { status: "approved" });
  if (!found) throw new NotFoundError("Visa service not found");
  await logAudit(adminId, "VISA_SERVICE_APPROVE", { entityType: "extraction_visa_services", entityId: id });
  return { updated: true };
}

export async function discardVisaService(id: string, adminId: number) {
  const found = await repo.updateVisaService(id, { status: "discarded" });
  if (!found) throw new NotFoundError("Visa service not found");
  await logAudit(adminId, "VISA_SERVICE_DISCARD", { entityType: "extraction_visa_services", entityId: id });
  return { updated: true };
}

export async function deleteVisaService(id: string, adminId: number) {
  const found = await repo.deleteVisaService(id);
  if (!found) throw new NotFoundError("Visa service not found");
  await logAudit(adminId, "VISA_SERVICE_DELETE", { entityType: "extraction_visa_services", entityId: id });
  return { deleted: true };
}
