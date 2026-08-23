import type { Knex } from "knex";

/**
 * Starting booking requirements for the Other Service Categories that already exist.
 *
 * These are the questions a Personal Portal user answers when requesting a service in that category
 * (Platform → Categories → Other Service Categories → Booking Requirements). Every one of them is
 * editable, reorderable and removable in the admin UI afterwards — this only means the eight categories
 * that shipped before the requirements builder existed are not empty.
 *
 * A category created from here on gets its requirements configured by hand on the create page; nothing
 * in this file runs for it. Adding a new category to this map is not the intended way to configure one.
 *
 * Insert-if-absent per field, keyed by (entity_id, entity_type, key): re-running never duplicates a row
 * and never overwrites an admin's edit to a label, an option list or a required flag. Removing a field in
 * the admin UI and re-seeding would bring it back — that is the trade for being re-runnable, and it only
 * affects these eight slugs.
 */

export type SeedField = {
  key: string;
  label: string;
  type: string;
  is_required?: boolean;
  options?: string[];
  placeholder?: string;
  help_text?: string;
  default_value?: string;
  validation?: { min?: number; max?: number; min_length?: number; max_length?: number; pattern?: string };
};

/**
 * Keyed by slug with underscores. Both `airport-pickup` and `airport_pickup` exist in the wild —
 * the seeder normalises before looking a category up, so either spelling matches.
 */
export const REQUIREMENTS: Record<string, SeedField[]> = {
  airport_pickup: [
    { key: "pickup_date", label: "Pickup date", type: "date", is_required: true },
    { key: "pickup_time", label: "Pickup time", type: "time", is_required: true, help_text: "Your landing time, not when you expect to be outside." },
    { key: "arrival_airport", label: "Arrival airport", type: "text", is_required: true, placeholder: "e.g. Sydney (SYD)" },
    { key: "flight_number", label: "Flight number", type: "text", placeholder: "e.g. QR648" },
    { key: "passengers", label: "Number of passengers", type: "number", is_required: true, default_value: "1", validation: { min: 1, max: 8 } },
    { key: "luggage", label: "Pieces of luggage", type: "number", validation: { min: 0, max: 20 } },
    { key: "pickup_notes", label: "Anything the driver should know", type: "long_text", validation: { max_length: 500 } },
  ],

  city_orientation: [
    { key: "preferred_date", label: "Preferred date", type: "date", is_required: true },
    { key: "preferred_time", label: "Preferred time", type: "time" },
    { key: "city", label: "City", type: "text", is_required: true, placeholder: "e.g. Melbourne" },
    { key: "group_size", label: "How many of you?", type: "number", is_required: true, default_value: "1", validation: { min: 1, max: 15 } },
    {
      key: "interests", label: "What would you like covered?", type: "checkbox",
      options: ["Public transport", "Banking & SIM card", "Groceries & markets", "Getting to campus", "Healthcare", "Nightlife"],
    },
  ],

  rental_support: [
    { key: "move_in_date", label: "Move-in date", type: "date", is_required: true },
    { key: "lease_length_months", label: "How long do you need it for? (months)", type: "number", validation: { min: 1, max: 60 } },
    {
      key: "property_type", label: "Property type", type: "select", is_required: true,
      options: ["Studio", "Shared room", "Private room", "1 bedroom", "2+ bedrooms", "Homestay"],
    },
    { key: "occupants", label: "Number of people", type: "number", is_required: true, default_value: "1", validation: { min: 1, max: 10 } },
    { key: "preferred_area", label: "Preferred area", type: "text", is_required: true, placeholder: "Suburb, or near which campus" },
    { key: "weekly_budget", label: "Weekly budget", type: "number", help_text: "In the currency of the listing.", validation: { min: 0 } },
    { key: "requirements", label: "Anything else you need", type: "long_text", validation: { max_length: 500 } },
  ],

  employment_support: [
    { key: "available_from", label: "Available from", type: "date", is_required: true },
    { key: "work_type", label: "Type of work", type: "select", is_required: true, options: ["Casual", "Part-time", "Full-time", "Internship"] },
    { key: "field_of_work", label: "Field of work", type: "text", is_required: true, placeholder: "e.g. Hospitality, retail, IT support" },
    { key: "hours_per_week", label: "Hours per week", type: "number", validation: { min: 1, max: 60 } },
    { key: "has_resume", label: "Do you already have a CV?", type: "boolean", is_required: true },
    { key: "work_rights", label: "Work rights", type: "select", options: ["Student visa", "Working holiday", "Permanent resident", "Citizen", "Not sure"] },
  ],

  assignment_help: [
    { key: "due_date", label: "Due date", type: "date", is_required: true },
    { key: "subject", label: "Subject", type: "text", is_required: true, placeholder: "e.g. Statistics" },
    {
      key: "assignment_type", label: "Type of assignment", type: "select", is_required: true,
      options: ["Essay", "Report", "Presentation", "Problem set", "Code", "Other"],
    },
    { key: "word_count", label: "Word count", type: "number", validation: { min: 0, max: 100000 } },
    { key: "brief", label: "What do you need help with?", type: "long_text", is_required: true, validation: { max_length: 1000 } },
  ],

  private_tutoring: [
    { key: "subject", label: "Subject", type: "text", is_required: true, placeholder: "e.g. Calculus" },
    { key: "level", label: "Level", type: "select", is_required: true, options: ["High school", "Undergraduate", "Postgraduate", "Professional", "Other"] },
    { key: "first_session_date", label: "Preferred date for the first session", type: "date", is_required: true },
    { key: "availability", label: "When are you free?", type: "checkbox", options: ["Weekday mornings", "Weekday afternoons", "Weekday evenings", "Weekends"] },
    { key: "sessions_per_week", label: "Sessions per week", type: "number", default_value: "1", validation: { min: 1, max: 7 } },
    { key: "format", label: "Format", type: "radio", options: ["In person", "Online"] },
  ],

  // Both spellings: the row created through the admin UI is "accomodation".
  accomodation: accommodationFields(),
  accommodation: accommodationFields(),

  other: [
    { key: "what_you_need", label: "What do you need?", type: "long_text", is_required: true, validation: { max_length: 1000 } },
    { key: "preferred_date", label: "When do you need it?", type: "date" },
    { key: "contact_phone", label: "Contact number", type: "phone", help_text: "Only shared with the provider once they accept." },
  ],
};

function accommodationFields(): SeedField[] {
  return [
    { key: "check_in", label: "Check-in date", type: "date", is_required: true },
    { key: "check_out", label: "Check-out date", type: "date", is_required: true },
    { key: "guests", label: "Number of guests", type: "number", is_required: true, default_value: "1", validation: { min: 1, max: 12 } },
    { key: "room_type", label: "Room type", type: "select", is_required: true, options: ["Entire place", "Private room", "Shared room"] },
    { key: "location", label: "Preferred location", type: "text", is_required: true, placeholder: "Suburb, or near which campus" },
    { key: "notes", label: "Anything else the host should know", type: "long_text", validation: { max_length: 500 } },
  ];
}

const normalise = (slug: string) => slug.trim().toLowerCase().replace(/-/g, "_");

export async function seed(knex: Knex): Promise<void> {
  const categories: { id: number; slug: string }[] = await knex("other_service_categories").select("id", "slug");

  for (const category of categories) {
    const fields = REQUIREMENTS[normalise(category.slug)];
    if (!fields) continue; // A category an admin added — its requirements are theirs to configure.

    for (const [index, field] of fields.entries()) {
      const exists = await knex("schema_fields")
        .where({ entity_type: "other_service_categories", entity_id: category.id, key: field.key })
        .first();
      if (exists) continue;

      await knex("schema_fields").insert({
        entity_id: category.id,
        entity_type: "other_service_categories",
        key: field.key,
        label: field.label,
        type: field.type,
        is_required: field.is_required ?? false,
        filterable: false,
        is_default: false,
        // pg serialises a plain JS array as a Postgres array literal, not JSON — stringify for jsonb.
        options: field.options ? JSON.stringify(field.options) : null,
        display_order: index,
        placeholder: field.placeholder ?? null,
        help_text: field.help_text ?? null,
        default_value: field.default_value ?? null,
        validation: field.validation ? JSON.stringify(field.validation) : null,
      });
    }
  }
}
