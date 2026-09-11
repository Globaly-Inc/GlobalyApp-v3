// Finds postcode/map link for a campus that already has a street address but was never
// geocoded (extraction pipeline only fills what's stated in page text — it doesn't call
// any mapping API). Read-only: returns candidates for the admin to accept via the existing
// saveAndLearn path, same as any manual edit. Companion to institution-lookup.service.ts,
// which does the equivalent text-based lookup for the institution overview.
import { NotFoundError, BadRequestError } from "../../../../shared/errors.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { geocodeAddress } from "../../../../shared/google-places/placesService.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import type { MissingDetailCandidate } from "./institution-lookup.service.js";

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export async function findMissingCampusFields(campusId: string): Promise<{ fields: MissingDetailCandidate[] }> {
  const campus = await masterKnex(`${S}.extraction_campuses`).where({ id: campusId }).first();
  if (!campus) throw new NotFoundError("Campus not found");
  if (isEmpty(campus.address)) throw new BadRequestError("Campus has no address to look up");
  if (!isEmpty(campus.postcode) && !isEmpty(campus.map_link)) return { fields: [] };

  const addressLine = [campus.address, campus.city, campus.state, campus.country].filter((p) => !isEmpty(p)).join(", ");
  const geocoded = await geocodeAddress(addressLine);
  if (!geocoded) return { fields: [] };

  const fields: MissingDetailCandidate[] = [];
  if (isEmpty(campus.postcode) && geocoded.postcode) {
    fields.push({ field: "postcode", label: "Postcode", value: geocoded.postcode, source_url: null });
  }
  if (isEmpty(campus.map_link)) {
    fields.push({ field: "map_link", label: "Map link", value: geocoded.mapLink, source_url: null });
  }
  return { fields };
}
