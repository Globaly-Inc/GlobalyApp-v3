import type { Knex } from "knex";

const CATEGORIES = [
  { id: 1, slug: "visa-consultation", name: "Visa Consultation", icon: "FileCheck", sort_order: 1 },
  { id: 2, slug: "accommodation-assistance", name: "Accommodation Assistance", icon: "Home", sort_order: 2 },
  { id: 3, slug: "airport-pickup", name: "Airport Pickup", icon: "Plane", sort_order: 3 },
  { id: 4, slug: "test-preparation", name: "IELTS / PTE Coaching", icon: "BookOpen", sort_order: 4 },
  { id: 5, slug: "career-counseling", name: "Career Counseling", icon: "Compass", sort_order: 5 },
  { id: 6, slug: "health-insurance", name: "Health Insurance", icon: "HeartPulse", sort_order: 6 },
  { id: 7, slug: "banking-assistance", name: "Banking Assistance", icon: "Landmark", sort_order: 7 },
  { id: 8, slug: "sop-lor-writing", name: "SOP / LOR Writing", icon: "PenLine", sort_order: 8 },
  { id: 9, slug: "pre-departure-briefing", name: "Pre-Departure Briefing", icon: "PlaneTakeoff", sort_order: 9 },
  { id: 10, slug: "part-time-job-assistance", name: "Part-Time Job Assistance", icon: "Briefcase", sort_order: 10 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const c of CATEGORIES) {
    const exists = await knex("service_categories").where({ slug: c.slug }).first();
    if (!exists) await knex("service_categories").insert({ ...c, is_active: true });
  }
  // Explicit ids bypass the id sequence — sync it so the next auto-generated
  // insert (e.g. an admin creating a new category) doesn't collide with these.
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('service_categories', 'id'), (SELECT MAX(id) FROM service_categories))",
  );
}
