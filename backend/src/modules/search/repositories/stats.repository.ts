// Corpus-wide counts behind the public marketing stat bars (home, /for-institutions).
//
// Every figure is scoped to what a signed-out visitor can actually reach through the search
// tabs, so the landing page can never advertise more than the site will show:
//   institutions         → institutions.is_published        (mirrors institutionsQuery)
//   courses              → job promoted to 'exported'       (mirrors PUBLICLY_VISIBLE)
//   education counselors → business_type 'agent', published (mirrors baseQuery)
//
// Countries and cities are *coverage* — the places a published institution or counselor
// actually operates in — not the size of the countries/cities lookup tables. Those tables are
// seeded reference data (~194 countries, ~2 380 cities) and describe the world, not our reach.

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";

export type PlatformStats = {
  institutions: number;
  courses: number;
  educationCounselors: number;
  countries: number;
  cities: number;
  /** Pricing page "trust stats" — a different cut of the same corpus. */
  students: number;
  verifiedBusinesses: number;
  serviceListings: number;
};

type StatsRow = Record<string, string | number>;

const PUBLISHED_INSTITUTIONS = "i.is_published and i.deleted_at is null";
const PUBLISHED_COUNSELORS = "b.business_type = 'agent' and b.is_published and b.deleted_at is null";

/**
 * One round trip: five scalar subqueries rather than five awaited counts, since the stat bar
 * always renders all of them together.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const { rows } = await masterKnex.raw<{ rows: StatsRow[] }>(`
    select
      (select count(*) from institutions i
        where ${PUBLISHED_INSTITUTIONS}) as institutions,

      (select count(*) from ${S}.extraction_courses ec
        where exists (select 1 from ${S}.extraction_jobs ej
                       where ej.id = ec.job_id and ej.status = 'exported')) as courses,

      (select count(*) from businesses b
        where ${PUBLISHED_COUNSELORS}) as education_counselors,

      (select count(*) from (
         select i.country_id from institutions i
           where ${PUBLISHED_INSTITUTIONS} and i.country_id is not null
         union
         select b.country_id from businesses b
           where ${PUBLISHED_COUNSELORS} and b.country_id is not null
       ) covered_countries) as countries,

      (select count(*) from (
         select lower(trim(i.city)) as city from institutions i
           where ${PUBLISHED_INSTITUTIONS} and nullif(trim(i.city), '') is not null
         union
         select lower(trim(b.city)) from businesses b
           where ${PUBLISHED_COUNSELORS} and nullif(trim(b.city), '') is not null
       ) covered_cities) as cities,

      -- Students = personal accounts that cleared OTP; account_status 0 never finished signup.
      (select count(*) from platform_users pu
        where pu.is_personal_account and pu.account_status = 1 and pu.deleted_at is null) as students,

      -- "Verified" is the admin-granted badge the search cards show (baseQuery's verifiedOnly).
      (select count(*) from businesses b
        where b.status = 'verified' and b.is_published and b.deleted_at is null) as verified_businesses,

      (select count(*) from other_service_listings osl
        where osl.is_active and osl.deleted_at is null) as service_listings
  `);

  const row = rows[0];
  return {
    institutions: Number(row.institutions),
    courses: Number(row.courses),
    educationCounselors: Number(row.education_counselors),
    countries: Number(row.countries),
    cities: Number(row.cities),
    students: Number(row.students),
    verifiedBusinesses: Number(row.verified_businesses),
    serviceListings: Number(row.service_listings),
  };
}
