// Business-contacts service — private, Super-Admin-only contact records for a single
// business, plus the institution twin (same tenant table, only the owning-entity lookup differs).

import { provisionBusinessSchema, provisionInstitutionSchema } from "../../../../../core/business/provisioner.js";
import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-contacts.repository.js";
import type { ContactInput, ContactPatch } from "../schemas/business-contacts.schema.js";

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

export async function listContacts(businessId: number, limit: number, offset: number, search?: string) {
  const biz = await requireBusiness(businessId);
  if (!biz.schema_provisioned_at) return { rows: [], total: 0 };
  return repo.listContacts(businessId, biz.schema_name, limit, offset, search);
}

export async function createContact(businessId: number, data: ContactInput, createdBy: number) {
  const biz = await requireBusiness(businessId);
  // Admins can add a private contact before a business is claimed — provision its tenant schema
  // on demand (same as claim does), same lazy-provisioning already used for institution services.
  if (!biz.schema_provisioned_at) await provisionBusinessSchema(biz.schema_name);
  return repo.createContact(businessId, biz.schema_name, data, createdBy);
}

export async function updateContact(businessId: number, contactId: string, data: ContactPatch) {
  const biz = await requireBusiness(businessId);
  return repo.updateContact(businessId, biz.schema_name, contactId, data);
}

export async function deleteContact(businessId: number, contactId: string) {
  const biz = await requireBusiness(businessId);
  return repo.deleteContact(businessId, biz.schema_name, contactId);
}

// ─── Institution twins ──────────────────────────────────────────────────────
// An institution's own Contacts tab: same `business_contacts` tenant table (see the migration's
// comment), same repository functions — only the owning-entity lookup differs.

async function requireInstitution(id: number) {
  const inst = await platformRepo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

export async function listInstitutionContacts(institutionId: number, limit: number, offset: number, search?: string) {
  const inst = await requireInstitution(institutionId);
  if (!inst.schema_provisioned_at) return { rows: [], total: 0 };
  return repo.listContacts(institutionId, inst.schema_name, limit, offset, search);
}

export async function createInstitutionContact(institutionId: number, data: ContactInput, createdBy: number) {
  const inst = await requireInstitution(institutionId);
  if (!inst.schema_provisioned_at) await provisionInstitutionSchema(inst.schema_name);
  return repo.createContact(institutionId, inst.schema_name, data, createdBy);
}

export async function updateInstitutionContact(institutionId: number, contactId: string, data: ContactPatch) {
  const inst = await requireInstitution(institutionId);
  return repo.updateContact(institutionId, inst.schema_name, contactId, data);
}

export async function deleteInstitutionContact(institutionId: number, contactId: string) {
  const inst = await requireInstitution(institutionId);
  return repo.deleteContact(institutionId, inst.schema_name, contactId);
}
