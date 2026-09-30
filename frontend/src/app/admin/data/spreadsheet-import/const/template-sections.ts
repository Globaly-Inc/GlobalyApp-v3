// The sections of a tab-per-section workbook (the downloadable template's tabs) and the fields each
// one takes. `key`s are what buildTemplateGroups and the backend's SpreadsheetExtrasSchema expect;
// `label` is the template's own heading, so the template maps itself. A workbook laid out some
// other way is mapped onto these in the Map step — its tabs onto sections, its columns onto fields.

import { SYSTEM_FIELDS, type TemplateTabKey } from "./index";

/** `group` labels a field in the picker — set on the per-course extras a Courses tab can carry. */
export type SectionField = { key: string; label: string; required?: boolean; aliases?: string[]; group?: string };

/** A Courses tab often keeps each course's fees, intakes and requirements as extra columns (the
 * course-per-row layout). Those are the course-row fields the backend already reads (rowToProduct),
 * so they're offered here too — same keys, labels and aliases, and the same validation. */
const PER_COURSE_EXTRAS: SectionField[] = SYSTEM_FIELDS
  .filter((f) => ["Fees", "Intakes", "Entry requirements", "English requirements"].includes(f.group))
  .map((f) => ({ key: f.key, label: f.label, aliases: f.aliases, group: f.group }));
export type Section = { key: TemplateTabKey; tab: string; aliases: string[]; fields: SectionField[] };

const COURSE_NAMES: SectionField = { key: "courses", label: "Course Names", aliases: ["course", "courses", "coursename", "program", "programs", "programme"] };
const BANDS = " (Overall, L, R, W, S)";

export const TEMPLATE_SECTIONS: Section[] = [
  {
    key: "institution", tab: "Institution", aliases: ["institution", "institutions", "university", "overview", "profile", "about"],
    fields: [
      { key: "institution_name", label: "Institution Name", required: true, aliases: ["institution", "university", "universityname", "name", "partnername", "school", "college"] },
      { key: "ownership_type", label: "Institution Type", aliases: ["type", "ownership", "ownershiptype", "sector"] },
      { key: "website", label: "Website", aliases: ["url", "web"] }, { key: "email", label: "Email" }, { key: "phone", label: "Phone", aliases: ["contactnumber", "phonenumber"] },
      { key: "address", label: "Address", aliases: ["street"] }, { key: "city", label: "City" }, { key: "state", label: "State", aliases: ["province"] },
      { key: "country", label: "Country" }, { key: "zip_code", label: "Postcode", aliases: ["zipcode", "zip", "postalcode"] },
      { key: "description", label: "Description", aliases: ["about", "overview"] }, { key: "logo_url", label: "Logo URL", aliases: ["logo"] },
      { key: "facebook_url", label: "Facebook URL", aliases: ["facebook"] }, { key: "instagram_url", label: "Instagram URL", aliases: ["instagram"] },
      { key: "twitter_url", label: "Twitter URL", aliases: ["twitter"] }, { key: "linkedin_url", label: "LinkedIn URL", aliases: ["linkedin"] },
      { key: "youtube_url", label: "YouTube URL", aliases: ["youtube"] },
    ],
  },
  {
    key: "branches", tab: "Branches", aliases: ["branches", "branch", "campuses", "campus", "locations"],
    fields: [
      { key: "name", label: "Branch Name", required: true, aliases: ["branch", "campus", "campusname", "name"] },
      { key: "address", label: "Address" }, { key: "city", label: "City" }, { key: "state", label: "State" }, { key: "country", label: "Country" },
      { key: "postcode", label: "Postcode", aliases: ["zipcode", "zip"] }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
      { key: "map_link", label: "Map Link", aliases: ["map", "googlemaps"] },
    ],
  },
  {
    key: "agents", tab: "Agents", aliases: ["agents", "agent", "agencies", "representatives"],
    fields: [
      { key: "name", label: "Agent Name", required: true, aliases: ["agent", "agency", "agencyname", "name"] },
      { key: "email", label: "Email" }, { key: "phone", label: "Phone" }, { key: "website", label: "Website" }, { key: "address", label: "Address" },
      { key: "city", label: "City" }, { key: "state", label: "State" }, { key: "country", label: "Country" }, { key: "postcode", label: "Postcode" },
    ],
  },
  {
    key: "courses", tab: "Courses", aliases: ["courses", "course", "programs", "programmes", "program", "products"],
    fields: [
      { key: "course_name", label: "Course Name", required: true, aliases: ["course", "program", "programname", "programme", "productname", "title", "name"] },
      { key: "short_name", label: "Short Name", aliases: ["abbreviation"] },
      { key: "degree_level", label: "Degree Level", aliases: ["level", "courselevel", "qualification"] },
      { key: "subject_area", label: "Subject Area", aliases: ["subject", "fieldofstudy", "discipline"] },
      { key: "duration", label: "Duration", aliases: ["length", "courseduration"] },
      { key: "study_mode", label: "Study Mode", aliases: ["mode", "deliverymode"] },
      { key: "course_description", label: "Course Description", aliases: ["description", "overview"] },
      { key: "course_url", label: "Course URL", aliases: ["url", "link"] },
      { key: "branch_names", label: "Branch Names", aliases: ["branches", "branchesname", "branchname", "branch", "campus", "campuses"] },
      { key: "awarding_institution", label: "Awarding Institution", aliases: ["awardedby"] },
      ...PER_COURSE_EXTRAS,
    ],
  },
  {
    key: "fees", tab: "Fees", aliases: ["fees", "fee", "tuition", "feestructure"],
    fields: [
      COURSE_NAMES, { key: "name", label: "Fee Name", aliases: ["feetype", "type", "tuitionfeetypeproductfee"] },
      { key: "period", label: "Period", aliases: ["feeperiod", "installmenttype", "per"] },
      { key: "installments", label: "Installments", aliases: ["instalments", "noofinstallments", "tuitionfeetypeinstallments"] },
      { key: "currency", label: "Currency" },
      { key: "international_amount", label: "International Amount", aliases: ["internationaltuitionfeetypeamount", "internationalfee", "internationaltuitionfee", "tuitionfeetypeamount", "tuition", "tuitionfee"] },
      { key: "domestic_amount", label: "Domestic Amount", aliases: ["domestictuitionfeetypeamount", "domesticfee", "domestictuitionfee"] },
      { key: "application_fee_name", label: "Application Fee Name", aliases: ["applicationfeetypeproductfee", "applicationfeetype"] },
      { key: "application_fee_amount", label: "Application Fee Amount", aliases: ["applicationtypeamount", "applicationfee", "applicationamount"] },
      { key: "application_fee_period", label: "Application Fee Period", aliases: ["applicationinstallmenttype", "installmenttype"] },
      { key: "application_fee_installments", label: "Application Fee Installments", aliases: ["applicationtypeinstallments", "applicationinstallments"] },
      // One fee per row — still accepted from older templates and other layouts.
      { key: "amount", label: "Amount", aliases: ["fee", "cost", "price"] },
      { key: "student_type", label: "Student Type", aliases: ["studenttype", "appliesto"] },
    ],
  },
  {
    key: "intakes", tab: "Intakes", aliases: ["intakes", "intake", "startdates", "sessions"],
    fields: [
      COURSE_NAMES, { key: "intake_month", label: "Intake Month", aliases: ["month", "intake"] },
      { key: "intake_year", label: "Intake Year", aliases: ["year"] }, { key: "intake_name", label: "Intake Name", aliases: ["name", "session"] },
      { key: "start_date", label: "Start Date", aliases: ["start", "commencement"] }, { key: "end_date", label: "End Date", aliases: ["end"] },
      { key: "orientation_date", label: "Orientation Date", aliases: ["orientation"] },
      { key: "admission_deadline", label: "Admission Deadline", aliases: ["deadline", "applicationdeadline"] },
    ],
  },
  {
    key: "eligibility", tab: "Eligibility", aliases: ["eligibility", "requirements", "entryrequirements", "admissionrequirements"],
    fields: [
      COURSE_NAMES, { key: "min_degree_level", label: "Min Degree Level", aliases: ["requirementdegreelevel", "entrylevel", "requireddegree"] },
      { key: "score_type", label: "Score Type" }, { key: "min_score", label: "Min Score", aliases: ["gpa", "academicscore"] },
      { key: "ielts", label: `IELTS${BANDS}` }, { key: "toefl", label: `TOEFL${BANDS}`, aliases: ["toeflibt"] },
      { key: "pte", label: `PTE${BANDS}` }, { key: "duolingo", label: `Duolingo${BANDS}`, aliases: ["det"] },
      { key: "gre", label: "GRE (Total)" }, { key: "gmat", label: "GMAT (Total)" }, { key: "sat_1", label: "SAT (Total)", aliases: ["sat"] },
    ],
  },
  {
    key: "scholarships", tab: "Scholarships", aliases: ["scholarships", "scholarship", "funding", "bursaries"],
    fields: [
      { key: "name", label: "Scholarship Name", required: true, aliases: ["scholarship", "title", "name"] }, COURSE_NAMES,
      { key: "coverage_type", label: "Coverage Type", aliases: ["coverage"] }, { key: "amount", label: "Amount", aliases: ["value"] },
      { key: "currency", label: "Currency" }, { key: "deadline", label: "Deadline" }, { key: "application_url", label: "Application URL", aliases: ["url", "link"] },
      { key: "applicable_to", label: "Applies To", aliases: ["appliesto", "studenttype"] }, { key: "description", label: "Description" },
    ],
  },
  {
    key: "study_units", tab: "Study Units", aliases: ["studyunits", "units", "modules", "subjects", "curriculum"],
    fields: [
      COURSE_NAMES, { key: "unit_name", label: "Unit Name", required: true, aliases: ["unit", "module", "modulename", "subject", "name"] },
      { key: "unit_code", label: "Unit Code", aliases: ["code", "modulecode"] }, { key: "unit_type", label: "Unit Type", aliases: ["type"] },
      { key: "credit_points", label: "Credit Points", aliases: ["credits", "creditpoints"] }, { key: "description", label: "Description" },
    ],
  },
  {
    key: "study_options", tab: "Study Options", aliases: ["studyoptions", "options", "deliveryoptions"],
    fields: [
      COURSE_NAMES, { key: "study_mode", label: "Study Mode", required: true, aliases: ["mode"] },
      { key: "study_load", label: "Study Load", required: true, aliases: ["load", "attendance"] },
      { key: "duration_value", label: "Duration Value", aliases: ["duration"] }, { key: "duration_unit", label: "Duration Unit", aliases: ["unit"] },
    ],
  },
  {
    key: "accreditations", tab: "Accreditations", aliases: ["accreditations", "accreditation"],
    fields: [
      { key: "name", label: "Accreditation Name", required: true, aliases: ["accreditation", "name"] }, COURSE_NAMES,
      { key: "issuing_organization", label: "Issuing Organization", aliases: ["organization", "body", "issuer"] },
      { key: "website", label: "Website" }, { key: "description", label: "Description" },
    ],
  },
];

export const SECTION_BY_KEY = new Map(TEMPLATE_SECTIONS.map((s) => [s.key, s]));
