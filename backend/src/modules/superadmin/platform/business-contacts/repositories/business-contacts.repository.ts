// Repository for the business_contacts table — lives in each business/institution's own tenant
// schema, same table name deliberately (see the institution migration's comment).

import { getKnex } from "../../../../../core/db/pool-manager.js";

const CONTACT_COLUMNS = [
  "uuid as id", "full_name", "job_title", "department", "email", "phone", "phone_country_code",
  "linkedin_url", "other_url", "tags", "preferred_channel", "is_primary", "notes", "created_at", "updated_at",
];

export async function listContacts(orgId: number, schemaName: string, limit: number, offset: number, search?: string) {
  const db = await getKnex(orgId, schemaName);
  const base = () => {
    const q = db("business_contacts").whereNull("deleted_at");
    if (search) q.whereILike("full_name", `%${search}%`);
    return q;
  };
  const [{ count }] = await base().count("id as count");
  const rows = await base().select(CONTACT_COLUMNS).orderBy("is_primary", "desc").orderBy("full_name").limit(limit).offset(offset);
  return { rows, total: Number(count) };
}

export async function createContact(orgId: number, schemaName: string, data: Record<string, unknown>, createdBy: number) {
  const db = await getKnex(orgId, schemaName);
  return db.transaction(async (trx) => {
    if (data.is_primary) {
      // ponytail: SELECT ... FOR UPDATE serializes concurrent primary-contact writers on this
      // table; add a partial unique index instead if this table sees real write contention.
      await trx("business_contacts").whereNull("deleted_at").forUpdate();
      await trx("business_contacts").whereNull("deleted_at").update({ is_primary: false });
    }
    const [row] = await trx("business_contacts")
      .insert({ ...data, created_by: createdBy })
      .returning(CONTACT_COLUMNS);
    return row;
  });
}

export async function updateContact(orgId: number, schemaName: string, contactId: string, data: Record<string, unknown>) {
  const db = await getKnex(orgId, schemaName);
  return db.transaction(async (trx) => {
    if (data.is_primary) {
      await trx("business_contacts").whereNull("deleted_at").forUpdate();
      await trx("business_contacts").whereNull("deleted_at").whereNot({ uuid: contactId }).update({ is_primary: false });
    }
    const [row] = await trx("business_contacts")
      .where({ uuid: contactId })
      .whereNull("deleted_at")
      .update({ ...data, updated_at: trx.fn.now() })
      .returning(CONTACT_COLUMNS);
    return row;
  });
}

export async function deleteContact(orgId: number, schemaName: string, contactId: string) {
  const db = await getKnex(orgId, schemaName);
  return db("business_contacts").where({ uuid: contactId }).whereNull("deleted_at").update({ deleted_at: db.fn.now() });
}
