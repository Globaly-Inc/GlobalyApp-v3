// CRM sync service — bulk-pushes all GlobalyApp businesses and institutions to
// GlobalyOS-V2 CRM as contacts. Called by POST /settings/crm/sync.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { getIntegrationSetting } from "./integration-settings.service.js";
import { createChildLogger } from "../../../../shared/logger.js";

const logger = createChildLogger("crm-sync");

type ListingRow = {
  id: number;
  kind: "business" | "institution";
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  postcode: string | null;
  country_name: string | null;
  website: string | null;
  linkedin_url: string | null;
  subdomain: string;
  status: string | null;
  business_type: string | null;
};

async function fetchAllListings(): Promise<ListingRow[]> {
  const [businesses, institutions] = await Promise.all([
    masterKnex("businesses as b")
      .leftJoin("countries as c", "c.id", "b.country_id")
      .whereNull("b.deleted_at")
      .select(
        "b.id",
        masterKnex.raw("'business' as kind"),
        "b.business_name as name",
        "b.email", "b.phone",
        "b.city", "b.state", "b.address", "b.postcode",
        "b.website", "b.linkedin_url", "b.subdomain", "b.status",
        "b.business_type",
        "c.name as country_name",
      ),
    masterKnex("institutions as i")
      .leftJoin("countries as c", "c.id", "i.country_id")
      .whereNull("i.deleted_at")
      .select(
        "i.id",
        masterKnex.raw("'institution' as kind"),
        "i.institution_name as name",
        "i.email", "i.phone",
        "i.city", "i.state", "i.address", "i.postcode",
        "i.website", "i.linkedin_url", "i.subdomain", "i.status",
        "i.institution_type as business_type",
        "c.name as country_name",
      ),
  ]);
  return [...businesses, ...institutions];
}

function toContactPayload(row: ListingRow) {
  return {
    first_name: row.name,
    email: row.email || undefined,
    phone: row.phone || undefined,
    contact_type: "partner",
    source: "globalyapp",
    linkedin_url: row.linkedin_url || undefined,
    address_street: row.address || undefined,
    address_city: row.city || undefined,
    address_state: row.state || undefined,
    address_postcode: row.postcode || undefined,
    address_country: row.country_name || undefined,
    tags: [row.kind],
    custom_fields: {
      globalyapp_id: row.id,
      globalyapp_kind: row.kind,
      globalyapp_subdomain: row.subdomain,
      globalyapp_status: row.status,
      globalyapp_website: row.website,
      globalyapp_type: row.business_type,
    },
  };
}

export type SyncResult = {
  pushed: number;
  failed: number;
  errors: Array<{ id: number; kind: string; error: string }>;
};

export async function syncToCrm(): Promise<SyncResult> {
  const [apiKey, crmUrl] = await Promise.all([
    getIntegrationSetting("globalyos_crm_api_key"),
    getIntegrationSetting("globalyos_crm_url"),
  ]);
  if (!apiKey || !crmUrl) {
    throw new Error("GlobalyOS CRM not configured — set globalyos_crm_api_key and globalyos_crm_url in integrations");
  }

  const listings = await fetchAllListings();
  const result: SyncResult = { pushed: 0, failed: 0, errors: [] };

  // ponytail: sequential to avoid hitting GlobalyOS-V2 rate limits; parallelise with
  // a concurrency pool when throughput matters and the rate limit headroom is confirmed.
  for (const row of listings) {
    try {
      const res = await fetch(`${crmUrl}/api/pdp/v1/contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          // Deduplicates replays within GlobalyOS-V2's idempotency window (~24h).
          // ponytail: after the window expires a re-run creates duplicates; add a
          // search-then-patch flow if upsert semantics are needed across windows.
          "Idempotency-Key": `globalyapp-${row.kind}-${row.id}`,
        },
        body: JSON.stringify(toContactPayload(row)),
      });
      if (res.status === 201 || res.status === 200) {
        result.pushed++;
      } else {
        const body = await res.text().catch(() => "");
        result.failed++;
        result.errors.push({ id: row.id, kind: row.kind, error: `HTTP ${res.status}: ${body.slice(0, 200)}` });
        logger.warn("CRM sync contact failed", { id: row.id, kind: row.kind, status: res.status });
      }
    } catch (err: any) {
      result.failed++;
      result.errors.push({ id: row.id, kind: row.kind, error: err.message });
      logger.warn("CRM sync contact error", { id: row.id, kind: row.kind, error: err.message });
    }
  }

  logger.info("CRM sync complete", result);
  return result;
}
