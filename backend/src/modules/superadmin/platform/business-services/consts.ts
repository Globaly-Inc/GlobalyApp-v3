// Table wiring for the tenant service catalog.
//
// Route segments map to table names here and nowhere else, so a URL fragment can
// never reach a query as an identifier — every table name a query sees comes out
// of one of these frozen maps.
//
// `jsonb` lists the columns node-pg would otherwise mangle: it turns a JS array
// into a Postgres array literal, which a jsonb column rejects. Those values are
// JSON.stringify'd before they reach Knex (same convention as businesses.meta).

export interface ChildSpec {
  readonly table: string;
  readonly parent: string;
  readonly orderBy: string;
  readonly jsonb: readonly string[];
}

/** Collections that hang off one service (or, for installments, off a structure). */
export const SERVICE_CHILDREN = {
  fees: {
    table: "service_fees",
    parent: "service_id",
    orderBy: "created_at",
    jsonb: ["installments"],
  },
  "fee-structures": {
    table: "service_fee_structures",
    parent: "service_id",
    orderBy: "created_at",
    jsonb: [],
  },
  intakes: {
    table: "service_intakes",
    parent: "service_id",
    orderBy: "start_date",
    jsonb: [],
  },
  eligibility: {
    table: "service_eligibility_requirements",
    parent: "service_id",
    orderBy: "created_at",
    jsonb: ["min_scores", "academic_tests", "language_tests"],
  },
} as const satisfies Record<string, ChildSpec>;

export type ChildKey = keyof typeof SERVICE_CHILDREN;

export const INSTALLMENTS: ChildSpec = {
  table: "service_fee_installments",
  parent: "fee_structure_id",
  orderBy: "sort_order",
  jsonb: [],
};

/**
 * Schema-level reusable entities. V1 hung these off business_id; the schema IS
 * the business here, so they have no parent column and are shared by every
 * service in the tenant through an assignment junction.
 */
export const SERVICE_LIBRARY = {
  "study-options": { table: "service_study_options", orderBy: "created_at" },
  "study-units": { table: "service_study_units", orderBy: "unit_name" },
} as const;

export type LibraryKey = keyof typeof SERVICE_LIBRARY;

export interface AssignmentSpec {
  readonly table: string;
  /** The junction column pointing at the shared entity. */
  readonly column: string;
  /** Tenant table the column references, or null when it targets the master schema. */
  readonly target: string | null;
}

export const SERVICE_ASSIGNMENTS = {
  fees: { table: "service_fee_assignments", column: "service_fee_id", target: "service_fees" },
  intakes: { table: "service_intake_assignments", column: "intake_id", target: "service_intakes" },
  eligibility: {
    table: "service_eligibility_assignments",
    column: "eligibility_requirement_id",
    target: "service_eligibility_requirements",
  },
  "study-options": {
    table: "service_study_option_assignments",
    column: "study_option_id",
    target: "service_study_options",
  },
  "study-units": {
    table: "service_study_unit_assignments",
    column: "study_unit_id",
    target: "service_study_units",
  },
  // accreditation_id is an integer FK into public.accreditations (master schema).
  accreditations: { table: "service_accreditation_assignments", column: "accreditation_id", target: null },
} as const satisfies Record<string, AssignmentSpec>;

export type AssignmentKey = keyof typeof SERVICE_ASSIGNMENTS;

/** Columns on business_services that node-pg must be handed as JSON text. */
export const SERVICE_JSONB_COLUMNS = [
  "gallery_urls",
  "public_visibility",
  "category_specific_data",
  "meta",
] as const;
