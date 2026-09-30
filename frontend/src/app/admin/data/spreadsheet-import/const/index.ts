// The system fields a spreadsheet column can map onto — what an extraction stores. Keys match the
// backend's SpreadsheetCourseRowSchema / SpreadsheetInstitutionSchema exactly
// (backend/src/modules/superadmin/data-extraction/schemas/spreadsheet-import.schema.ts).

export type FieldGroup = "Institution" | "Course" | "Fees" | "Intakes" | "Entry requirements" | "English requirements";
export type FieldType = "text" | "number" | "url" | "email";

export type SystemField = {
  key: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  required?: boolean;
  /** Institution-level: one value per institution, not per course row. */
  institution?: boolean;
  /** Normalised header spellings that auto-map onto this field (see normaliseHeader). */
  aliases: string[];
};

export const SYSTEM_FIELDS: SystemField[] = [
  // Institution
  { key: "institution_name", label: "Institution name", group: "Institution", type: "text", institution: true, aliases: ["institution", "institutionname", "university", "universityname", "partnername", "school"] },
  { key: "ownership_type", label: "Institution type (Public / Private)", group: "Institution", type: "text", institution: true, aliases: ["institutiontype", "ownership", "ownershiptype", "sector"] },
  { key: "website", label: "Website", group: "Institution", type: "url", institution: true, aliases: ["website", "institutionwebsite", "url", "web"] },
  { key: "email", label: "Email", group: "Institution", type: "email", institution: true, aliases: ["email", "institutionemail"] },
  { key: "phone", label: "Phone", group: "Institution", type: "text", institution: true, aliases: ["phone", "phonenumber", "contactnumber"] },
  { key: "address", label: "Address", group: "Institution", type: "text", institution: true, aliases: ["address", "street"] },
  { key: "city", label: "City", group: "Institution", type: "text", institution: true, aliases: ["city"] },
  { key: "state", label: "State", group: "Institution", type: "text", institution: true, aliases: ["state", "province"] },
  { key: "country", label: "Country", group: "Institution", type: "text", institution: true, aliases: ["country"] },
  { key: "zip_code", label: "Postcode", group: "Institution", type: "text", institution: true, aliases: ["postcode", "zipcode", "zip", "postalcode"] },
  { key: "description", label: "Institution description", group: "Institution", type: "text", institution: true, aliases: ["institutiondescription", "about"] },
  { key: "logo_url", label: "Logo URL", group: "Institution", type: "url", institution: true, aliases: ["logo", "logourl"] },
  // Course
  { key: "course_name", label: "Course name", group: "Course", type: "text", required: true, aliases: ["productname", "coursename", "course", "programname", "program", "programme", "title", "name"] },
  { key: "short_name", label: "Short name", group: "Course", type: "text", aliases: ["shortname", "abbreviation"] },
  { key: "degree_level", label: "Degree level", group: "Course", type: "text", aliases: ["degreelevel", "level", "courselevel", "qualification"] },
  { key: "subject_area", label: "Subject area", group: "Course", type: "text", aliases: ["subjectarea", "subject", "fieldofstudy", "areaofstudy", "discipline"] },
  { key: "duration", label: "Duration (e.g. 4 Years)", group: "Course", type: "text", aliases: ["duration", "courseduration", "length"] },
  { key: "study_mode", label: "Study mode", group: "Course", type: "text", aliases: ["studymode", "mode", "deliverymode"] },
  { key: "course_description", label: "Course description", group: "Course", type: "text", aliases: ["description", "coursedescription", "overview"] },
  { key: "course_url", label: "Course URL", group: "Course", type: "url", aliases: ["courseurl", "producturl", "link", "programurl"] },
  { key: "branch_names", label: "Branches (e.g. Main Campus, City Campus)", group: "Course", type: "text", aliases: ["branchesname", "branchname", "branches", "branch", "campus", "campuses", "campusname"] },
  // Fees
  { key: "fee_amount", label: "International tuition fee (per period)", group: "Fees", type: "number", aliases: ["tuitionfeetypeamount", "internationaltuitionfeetypeamount", "internationalfee", "internationaltuitionfee", "feeamount", "amount", "tuitionfee", "fee", "tuition"] },
  { key: "domestic_fee_amount", label: "Domestic tuition fee (per period)", group: "Fees", type: "number", aliases: ["domestictuitionfeetypeamount", "domesticfee", "domestictuitionfee", "domesticamount"] },
  { key: "fee_installments", label: "Number of installments", group: "Fees", type: "number", aliases: ["tuitionfeetypeinstallments", "installments", "instalments", "noofinstallments"] },
  { key: "fee_period", label: "Fee period (e.g. Per Semester)", group: "Fees", type: "text", aliases: ["installmenttype", "feeperiod", "period", "feeterm"] },
  { key: "fee_name", label: "Fee name", group: "Fees", type: "text", aliases: ["tuitionfeetypeproductfee", "feename", "feetype"] },
  { key: "fee_currency", label: "Currency", group: "Fees", type: "text", aliases: ["currency", "feecurrency"] },
  // After fee_period on purpose: a sheet's SECOND "INSTALLMENT TYPE" (the application fee's) lands here.
  { key: "application_fee_name", label: "Application fee name", group: "Fees", type: "text", aliases: ["applicationfeetypeproductfee", "applicationfeename", "applicationfeetype"] },
  { key: "application_fee_amount", label: "Application fee amount", group: "Fees", type: "number", aliases: ["applicationtypeamount", "applicationfeeamount", "applicationfee", "applicationamount"] },
  { key: "application_fee_period", label: "Application fee period", group: "Fees", type: "text", aliases: ["installmenttype", "applicationinstallmenttype", "applicationfeeperiod"] },
  { key: "application_fee_installments", label: "Application fee installments", group: "Fees", type: "number", aliases: ["applicationtypeinstallments", "applicationfeeinstallments", "applicationinstallments"] },
  // Intakes
  { key: "intake_months", label: "Intake months (e.g. Aug, Jan)", group: "Intakes", type: "text", aliases: ["intakemonth", "intakemonths", "intake", "intakes"] },
  // Entry requirements
  { key: "min_degree_level", label: "Minimum degree level", group: "Entry requirements", type: "text", aliases: ["requirementdegreelevel", "entrylevel", "mindegreelevel", "requireddegree"] },
  { key: "min_score", label: "Minimum academic score", group: "Entry requirements", type: "number", aliases: ["minscore", "academicscore", "gpa"] },
  { key: "score_type", label: "Score type (GPA / Percentage)", group: "Entry requirements", type: "text", aliases: ["scoretype", "academicscoretype"] },
  { key: "gre", label: "GRE (Total)", group: "Entry requirements", type: "number", aliases: ["gre"] },
  { key: "gmat", label: "GMAT (Total)", group: "Entry requirements", type: "number", aliases: ["gmat"] },
  { key: "sat_1", label: "SAT I (Total)", group: "Entry requirements", type: "number", aliases: ["sat", "sati", "sat1"] },
  { key: "sat_2", label: "SAT II", group: "Entry requirements", type: "number", aliases: ["satii", "sat2"] },
  // English
  { key: "ielts", label: "IELTS (Overall, L, R, W, S)", group: "English requirements", type: "number", aliases: ["ielts"] },
  { key: "toefl", label: "TOEFL (Overall, L, R, W, S)", group: "English requirements", type: "number", aliases: ["toefl", "toeflibt"] },
  { key: "pte", label: "PTE (Overall, L, R, W, S)", group: "English requirements", type: "number", aliases: ["pte"] },
  { key: "duolingo", label: "Duolingo (Overall, L, R, W, S)", group: "English requirements", type: "number", aliases: ["duolingo", "det"] },
];

export const FIELD_BY_KEY = new Map(SYSTEM_FIELDS.map((f) => [f.key, f]));

/** Where each institution's name comes from — a tab per institution, or a column. */
export type InstitutionSource = "sheet" | "column";

export const STEPS = ["Upload File", "Preview Data", "Map Fields", "Validate Data", "Finalize Import"] as const;

export const MAX_FILE_MB = 20;

/** The downloadable multi-tab template (public/templates/institution-import-template.xlsx), keyed by
 * lowercased tab name. Headers map by snake_case ("Intake Month" → intake_month) unless renamed;
 * keys match the backend's SpreadsheetExtrasSchema / SpreadsheetCourseRowSchema. `required` rows
 * missing a value are skipped with a warning. Eligibility is folded into the course rows. */
export type TemplateTabKey = "institution" | "courses" | "eligibility" | "branches" | "agents" | "fees" | "intakes"
  | "scholarships" | "study_units" | "study_options" | "accreditations";
/** `required`: "a|b" is met by either field. `numeric`: a non-number skips the row when the field is required, otherwise is dropped with a warning. */
export const TEMPLATE_TABS: Record<string, { key: TemplateTabKey; rename?: Record<string, string>; required?: string[]; requiredLabel?: string; numeric?: string[] }> = {
  institution: { key: "institution", rename: { postcode: "zip_code" } },
  courses: { key: "courses" },
  eligibility: { key: "eligibility", rename: { course_names: "courses", sat: "sat_1" } },
  branches: { key: "branches", rename: { branch_name: "name" }, required: ["name"] },
  agents: { key: "agents", rename: { agent_name: "name" }, required: ["name"] },
  // One row per course, a column per fee kind (international / domestic tuition, application fee) —
  // split into separate fees by expandFeeRow. A plain Amount + Student Type row still works.
  fees: {
    key: "fees", rename: { course_names: "courses", fee_name: "name" },
    required: ["amount|international_amount|domestic_amount|application_fee_amount"], requiredLabel: "an amount",
    numeric: ["amount", "installments", "international_amount", "domestic_amount", "application_fee_amount", "application_fee_installments"],
  },
  intakes: { key: "intakes", rename: { course_names: "courses" }, required: ["intake_month|start_date"], numeric: ["intake_year"] },
  scholarships: { key: "scholarships", rename: { course_names: "courses", scholarship_name: "name", applies_to: "applicable_to" }, required: ["name"], numeric: ["amount"] },
  "study units": { key: "study_units", rename: { course_names: "courses" }, required: ["unit_name"], numeric: ["credit_points"] },
  "study options": { key: "study_options", rename: { course_names: "courses" }, required: ["study_mode", "study_load"], numeric: ["duration_value"] },
  accreditations: { key: "accreditations", rename: { course_names: "courses", accreditation_name: "name" }, required: ["name"] },
};

/** Used for a fee when the sheet states no currency — mirrors the backend fallback. */
export const DEFAULT_CURRENCY = "USD";
