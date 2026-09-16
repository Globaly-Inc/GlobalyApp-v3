// Superadmin routes for a single business/institution's private contact records.

import type { FastifyInstance } from "fastify";
import { buildPaginatedResponse, paginationToOffset } from "../../../../../shared/pagination.js";
import * as platformRepo from "../../platform.repository.js";
import {
  ContactInputSchema, ContactListQuerySchema, ContactPatchSchema, IdParamSchema, SubIdParamSchema,
} from "../schemas/business-contacts.schema.js";
import * as service from "../services/business-contacts.service.js";

export async function businessContactsRoutes(app: FastifyInstance) {
  app.get("/businesses/:id/contacts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ContactListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listContacts(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/businesses/:id/contacts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ContactInputSchema.parse(req.body);
    const contact = await service.createContact(id, data, Number(req.auth.sub));
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CONTACT_CREATED", "business", undefined, { business_id: id });
    return reply.status(201).send(contact);
  });

  app.patch("/businesses/:id/contacts/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ContactPatchSchema.parse(req.body);
    const contact = await service.updateContact(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CONTACT_UPDATED", "business", undefined, { business_id: id, contact_id: subId });
    return reply.send(contact);
  });

  app.delete("/businesses/:id/contacts/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteContact(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "BUSINESS_CONTACT_DELETED", "business", undefined, { business_id: id });
    return reply.status(204).send();
  });

  // Institution twins — same business_contacts tenant table, only the owning-entity differs.

  app.get("/institutions/:id/contacts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const { search, ...pagination } = ContactListQuerySchema.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const { rows, total } = await service.listInstitutionContacts(id, limit, offset, search);
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  app.post("/institutions/:id/contacts", async (req, reply) => {
    const { id } = IdParamSchema.parse(req.params);
    const data = ContactInputSchema.parse(req.body);
    const contact = await service.createInstitutionContact(id, data, Number(req.auth.sub));
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_CONTACT_CREATED", "institution", undefined, { institution_id: id });
    return reply.status(201).send(contact);
  });

  app.patch("/institutions/:id/contacts/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    const data = ContactPatchSchema.parse(req.body);
    const contact = await service.updateInstitutionContact(id, subId, data);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_CONTACT_UPDATED", "institution", undefined, { institution_id: id, contact_id: subId });
    return reply.send(contact);
  });

  app.delete("/institutions/:id/contacts/:subId", async (req, reply) => {
    const { id, subId } = SubIdParamSchema.parse(req.params);
    await service.deleteInstitutionContact(id, subId);
    await platformRepo.logAdminAction(Number(req.auth.sub), "INSTITUTION_CONTACT_DELETED", "institution", undefined, { institution_id: id });
    return reply.status(204).send();
  });
}
