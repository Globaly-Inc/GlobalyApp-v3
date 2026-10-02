import type { Knex } from "knex";

// Same-to-same reuse of V1's service_categories.schema_fields seed data (supabase/migrations/
// 20260222103852_..._d1e4e273.sql): each non-course category there has its own distinct set of
// custom fields (property_type for Accommodation, insurance_type for Insurance, etc.) — ours only
// ever had the 3 generic course fields (service_category_course_fields_seeder) applied uniformly
// to every category, so a category like "Insurance" had no fields of its own. Matched by category
// NAME since these rows are user-created via the admin UI in this repo (no seeded slugs to rely
// on), and onConflict on (entity_id, entity_type, key) makes this idempotent / safe to run more
// than once.
const CATEGORY_FIELDS: Record<string, { key: string; label: string; type: string; options?: (string | number)[]; is_required?: boolean; filterable?: boolean }[]> = {
  "Short Courses": [
    { key: "course_type", label: "Course type", type: "select", options: ["Certificate", "Diploma", "Workshop", "Bootcamp", "Online course"], filterable: true },
    { key: "certification", label: "Certification", type: "text" },
    { key: "delivery_mode", label: "Delivery mode", type: "select", options: ["In-person", "Online", "Hybrid"], filterable: true },
    { key: "skill_level", label: "Skill level", type: "select", options: ["Beginner", "Intermediate", "Advanced"], filterable: true },
  ],
  "Accommodation": [
    { key: "property_type", label: "Property type", type: "select", options: ["Apartment", "Studio", "Shared house", "Homestay", "Dormitory", "Townhouse"], is_required: true, filterable: true },
    { key: "room_type", label: "Room type", type: "select", options: ["Private room", "Shared room", "Entire place", "Ensuite"], filterable: true },
    { key: "furnished", label: "Furnished", type: "boolean", filterable: true },
    { key: "bills_included", label: "Bills included", type: "boolean", filterable: true },
    { key: "distance_to_campus_km", label: "Distance to campus (km)", type: "number" },
    { key: "available_from", label: "Available from", type: "date" },
    { key: "bond_amount", label: "Bond amount", type: "number" },
    { key: "max_occupants", label: "Max occupants", type: "number" },
  ],
  "Insurance": [
    { key: "insurance_type", label: "Insurance type", type: "select", options: ["OSHC", "OVHC", "Travel", "Life", "Health"], is_required: true, filterable: true },
    { key: "provider_name", label: "Provider name", type: "text", filterable: true },
    { key: "coverage_duration_months", label: "Coverage duration (months)", type: "number" },
    { key: "visa_type_coverage", label: "Visa type coverage", type: "multi_select", options: ["Student", "Work", "Visitor", "Skilled", "Family"] },
  ],
  "Banking & Finance": [
    { key: "service_type", label: "Service type", type: "select", options: ["Bank account", "Loan", "Money transfer", "Currency exchange"], is_required: true, filterable: true },
    { key: "bank_name", label: "Bank name", type: "text" },
    { key: "no_monthly_fee", label: "No monthly fee", type: "boolean", filterable: true },
  ],
  "Visa Services": [
    { key: "visa_type", label: "Visa type", type: "select", options: ["Student", "Work", "Visitor", "Skilled", "Family", "Graduate"], is_required: true, filterable: true },
    { key: "processing_time_weeks", label: "Processing time (weeks)", type: "number" },
    { key: "success_rate", label: "Success rate (%)", type: "number" },
    { key: "includes_mock_interview", label: "Includes mock interview", type: "boolean" },
  ],
  "Test Preparation": [
    { key: "test_type", label: "Test type", type: "select", options: ["IELTS", "TOEFL", "PTE", "Duolingo", "GRE", "GMAT", "SAT"], is_required: true, filterable: true },
    { key: "delivery_mode", label: "Delivery mode", type: "select", options: ["In-person", "Online", "Hybrid"], filterable: true },
    { key: "includes_practice_tests", label: "Includes practice tests", type: "boolean" },
    { key: "target_score", label: "Target score", type: "text" },
  ],
  "Career Services": [
    { key: "service_type", label: "Service type", type: "select", options: ["Resume writing", "Interview coaching", "Job placement", "Career counselling", "LinkedIn optimization", "Internship placement"], is_required: true, filterable: true },
    { key: "industry_focus", label: "Industry focus", type: "multi_select", options: ["IT", "Healthcare", "Business", "Engineering", "Hospitality", "Education", "Finance", "Trades"] },
    { key: "guaranteed_interviews", label: "Guaranteed interviews", type: "boolean" },
  ],
  "Translation Services": [
    { key: "translation_type", label: "Translation type", type: "select", options: ["Document", "Certified", "Interpreting", "Notarized"], is_required: true, filterable: true },
    { key: "languages", label: "Languages", type: "multi_select", options: ["English", "Mandarin", "Hindi", "Spanish", "Arabic", "French", "Punjabi", "Vietnamese", "Nepali", "Korean", "Japanese", "Portuguese"] },
    { key: "turnaround_days", label: "Turnaround (days)", type: "number" },
  ],
  "Transport": [
    { key: "transport_type", label: "Transport type", type: "select", options: ["Airport pickup", "Daily commute", "Car rental", "Rideshare", "Shuttle"], is_required: true, filterable: true },
    { key: "vehicle_type", label: "Vehicle type", type: "select", options: ["Sedan", "Van", "SUV", "Bus"] },
    { key: "max_passengers", label: "Max passengers", type: "number" },
    { key: "luggage_included", label: "Luggage included", type: "boolean" },
  ],
};

export async function seed(knex: Knex): Promise<void> {
  const categories = await knex("service_categories").select("id", "name");
  const rows = categories.flatMap((c) => {
    const fields = CATEGORY_FIELDS[c.name];
    if (!fields) return [];
    return fields.map((f) => ({
      entity_id: c.id,
      entity_type: "service_categories",
      is_default: false,
      label: f.label,
      key: f.key,
      type: f.type,
      is_required: f.is_required ?? false,
      filterable: f.filterable ?? false,
      options: f.options ? JSON.stringify(f.options) : null,
    }));
  });
  if (rows.length > 0) {
    await knex("schema_fields").insert(rows).onConflict(["entity_id", "entity_type", "key"]).ignore();
  }
}
