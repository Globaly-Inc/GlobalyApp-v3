import type { Knex } from "knex";

const FEE_TYPES = [
  { id: 1, slug: "tuition_fee", name: "Tuition Fee", sort_order: 1 },
  { id: 2, slug: "application_fee", name: "Application Fee", sort_order: 2 },
  { id: 3, slug: "enrollment_fee", name: "Enrollment Fee", sort_order: 3 },
  { id: 4, slug: "material_fee", name: "Material Fee", sort_order: 4 },
  { id: 5, slug: "exam_fee", name: "Exam Fee", sort_order: 5 },
  { id: 6, slug: "late_payment_fee", name: "Late Payment Fee", sort_order: 6 },
  { id: 7, slug: "health_insurance_fee", name: "Health Insurance Fee", sort_order: 7 },
  { id: 8, slug: "student_services_fee", name: "Student Services Fee", sort_order: 8 },
];

export async function seed(knex: Knex): Promise<void> {
  for (const f of FEE_TYPES) {
    const exists = await knex("fee_types").where({ slug: f.slug }).first();
    // business_id left null and status "approved" — this is platform reference data, not a
    // business submission awaiting review (the column defaults to "pending" for that case).
    if (!exists) await knex("fee_types").insert({ ...f, business_id: null, is_global: true, status: "approved" });
  }
  await knex.raw(
    "SELECT setval(pg_get_serial_sequence('fee_types', 'id'), (SELECT MAX(id) FROM fee_types))",
  );
}
