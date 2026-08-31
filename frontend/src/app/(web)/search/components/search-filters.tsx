import { Button } from "@/components/ui/button";
import { BudgetFilter } from "./budget-filter";
import { ComboFilterField } from "./combo-filter-field";
import { DestinationFilterFields } from "./destination-filter-fields";
import {
  BASIS_LABEL, COVERAGE_LABEL, DEGREE_LABEL, DURATION_OPTIONS, JOB_TYPE_LABEL, STUDY_MODE_LABEL,
  VISA_SERVICE_TYPE_LABEL, type SearchTabKey,
} from "../types";

function FilterSection({
  letter, title, children,
}: Readonly<{ letter: string; title: string; children: React.ReactNode }>) {
  return (
    <div className="border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">
      <p className="text-xs font-bold uppercase tracking-wide text-primary mb-3">{letter}. {title}</p>
      {children}
    </div>
  );
}

// Destination is always A; everything after it is lettered by position.
const LETTERS = ["B", "C", "D", "E", "F", "G", "H"];

const fieldClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

function RadioList({
  name, options, value,
}: Readonly<{ name: string; options: { value: string; label: string }[]; value?: string }>) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="radio" name={name} value="" defaultChecked={!value} className="h-4 w-4 border-input" />
        Any
      </label>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
          <input type="radio" name={name} value={o.value} defaultChecked={value === o.value} className="h-4 w-4 border-input" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function SelectField({
  name, options, value, anyLabel = "Any",
}: Readonly<{ name: string; options: { value: string; label: string }[]; value?: string; anyLabel?: string }>) {
  return (
    <select name={name} defaultValue={value ?? ""} className={fieldClass}>
      <option value="">{anyLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function SearchFilters({
  activeTab,
  country,
  city,
  search,
  degreeLevel,
  degreeLevels,
  subjectArea,
  jobType,
  isRemote,
  feeMin,
  feeMax,
  currency,
  sort,
  intakeYear,
  intakeYears,
  basis,
  countryOptions,
  cityOptions,
  licensedOnly,
  basePath = "/search",
  institutionType,
  institutionTypes,
  intakeFrom,
  intakeMonths,
  institution,
  institutions,
  duration,
  studyMode,
  catalogSubjectAreas,
  catalogDegreeLevels,
  catalogStudyModes,
  verifiedOnly,
  serviceType,
  serviceTypes,
  coverageType,
  coverageTypes,
}: Readonly<{
  activeTab: SearchTabKey;
  basePath?: string;
  country?: string;
  city?: string;
  search?: string;
  degreeLevel?: string;
  degreeLevels?: string[];
  subjectArea?: string;
  jobType?: string;
  isRemote?: boolean;
  feeMin?: number;
  feeMax?: number;
  currency?: string;
  sort?: string;
  intakeYear?: number;
  intakeYears?: number[];
  basis?: string;
  countryOptions?: { value: string; label: string }[];
  cityOptions?: { value: string; label: string }[];
  licensedOnly?: boolean;
  institutionType?: string;
  institutionTypes?: string[];
  intakeFrom?: string;
  intakeMonths?: string[];
  institution?: string;
  institutions?: string[];
  duration?: string;
  studyMode?: string;
  catalogSubjectAreas?: string[];
  catalogDegreeLevels?: string[];
  catalogStudyModes?: string[];
  verifiedOnly?: boolean;
  serviceType?: string;
  serviceTypes?: string[];
  coverageType?: string;
  coverageTypes?: string[];
}>) {
  // Sections are listed rather than hand-lettered: adding one used to mean re-deriving every
  // letter after it, which is how "C" ended up conditional on the intake facet being non-empty.
  const courseSections = activeTab !== "courses" ? [] : [
    {
      title: "Study Goal",
      body: (
        <>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Degree Level</p>
          <ComboFilterField name="degree_level" value={degreeLevel} options={degreeLevels ?? []} anyLabel="Any degree" />
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-4 mb-2">Field of Study</p>
          <input
            type="text"
            name="subject_area"
            defaultValue={subjectArea}
            placeholder="e.g. Computer Science"
            className={fieldClass}
          />
        </>
      ),
    },
    ...(institutions && institutions.length > 0 ? [{
      title: "Institution",
      body: (
        <SelectField
          name="institution"
          value={institution}
          options={institutions.map((value) => ({ value, label: value }))}
          anyLabel="Any institution"
        />
      ),
    }] : []),
    {
      title: "Duration",
      body: <SelectField name="duration" value={duration} options={DURATION_OPTIONS} anyLabel="Any duration" />,
    },
    ...(intakeYears && intakeYears.length > 0 ? [{
      title: "Intake",
      body: (
        <>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Year</p>
          <ComboFilterField
            name="intake_year"
            value={intakeYear != null ? String(intakeYear) : undefined}
            options={intakeYears.map(String)}
            anyLabel="Any year"
          />
        </>
      ),
    }] : []),
    { title: "Budget", body: <BudgetFilter min={feeMin} max={feeMax} /> },
  ];

  // Subject area, degree level and study mode describe an institution through its catalog — the API
  // keeps the institution when one of its courses matches. Only offered when the catalog has them.
  const institutionSections = activeTab !== "institutions" ? [] : [
    ...(institutionTypes && institutionTypes.length > 0 ? [{
      title: "Institution Type",
      body: (
        <RadioList
          name="institution_type"
          value={institutionType}
          options={institutionTypes.map((value) => ({ value, label: value }))}
        />
      ),
    }] : []),
    {
      title: "Upcoming Intake",
      body: (
        <>
          {/* Native month input: mm/yyyy with the browser own picker, no date library. */}
          <input
            type="month"
            name="intake_from"
            defaultValue={intakeFrom}
            min={intakeMonths?.[0]}
            max={intakeMonths?.[intakeMonths.length - 1]}
            className={fieldClass}
          />
          <p className="mt-2 text-[11px] text-muted-foreground">Shows institutions with an intake from this month onwards.</p>
        </>
      ),
    },
    ...(catalogSubjectAreas && catalogSubjectAreas.length > 0 ? [{
      title: "Subject Area",
      body: <ComboFilterField name="subject_area" value={subjectArea} options={catalogSubjectAreas} anyLabel="Any subject" />,
    }] : []),
    ...(catalogDegreeLevels && catalogDegreeLevels.length > 0 ? [{
      title: "Degree Level",
      body: (
        <SelectField
          name="degree_level"
          value={degreeLevel}
          options={catalogDegreeLevels.map((value) => ({ value, label: DEGREE_LABEL[value] ?? value }))}
          anyLabel="Any degree"
        />
      ),
    }] : []),
    ...(catalogStudyModes && catalogStudyModes.length > 0 ? [{
      title: "Study Mode",
      body: (
        <SelectField
          name="study_mode"
          value={studyMode}
          options={catalogStudyModes.map((value) => ({ value, label: STUDY_MODE_LABEL[value] ?? value }))}
          anyLabel="Any mode"
        />
      ),
    }] : []),
  ];

  // Education and migration agents are business rows: country, city and the verification badge are
  // all one carries here, so verification is the only filter beyond Destination.
  const agentSections = activeTab !== "education-agencies" && activeTab !== "migration-agents" ? [] : [
    {
      title: "Verification",
      body: (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="verified_only" value="true" defaultChecked={verifiedOnly} className="h-4 w-4 rounded border-input" />
          Verified education counselors only
        </label>
      ),
    },
  ];

  // The visa filters read the provider's services: a provider matches when one of its services does.
  const visaSections = activeTab !== "visa-services" ? [] : [
    {
      title: "Registration",
      body: (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="licensed_only" value="true" defaultChecked={licensedOnly} className="h-4 w-4 rounded border-input" />
          Active registration only
        </label>
      ),
    },
    ...(serviceTypes && serviceTypes.length > 0 ? [{
      title: "Service Type",
      body: (
        <SelectField
          name="service_type"
          value={serviceType}
          options={serviceTypes.map((value) => ({ value, label: VISA_SERVICE_TYPE_LABEL[value] ?? value }))}
          anyLabel="Any service"
        />
      ),
    }] : []),
  ];

  const scholarshipSections = activeTab !== "scholarships" ? [] : [
    {
      title: "Basis",
      body: (
        <SelectField
          name="basis"
          value={basis}
          options={Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label }))}
        />
      ),
    },
    {
      title: "Degree Level",
      body: (
        <SelectField
          name="degree_level"
          value={degreeLevel}
          options={Object.entries(DEGREE_LABEL).map(([value, label]) => ({ value, label }))}
        />
      ),
    },
    // Coverage values come from the scholarship sample the country/city dropdowns already load.
    ...(coverageTypes && coverageTypes.length > 0 ? [{
      title: "Coverage",
      body: (
        <SelectField
          name="coverage_type"
          value={coverageType}
          options={coverageTypes.map((value) => ({ value, label: COVERAGE_LABEL[value] ?? value }))}
          anyLabel="Any coverage"
        />
      ),
    }] : []),
  ];

  const tabSections = [
    ...courseSections, ...institutionSections, ...agentSections, ...visaSections, ...scholarshipSections,
  ];

  return (
    <form method="get" action={basePath} className="rounded-xl border border-border bg-card p-5">
      <input type="hidden" name="tab" value={activeTab} />
      {search && <input type="hidden" name="search" value={search} />}
      {currency && <input type="hidden" name="currency" value={currency} />}
      {sort && <input type="hidden" name="sort" value={sort} />}

      <p className="text-sm font-semibold text-foreground mb-1">Filter &amp; Refine</p>
      <p className="text-xs text-muted-foreground mb-4">
        Narrow {activeTab.replace("-", " ")} by destination and{" "}
        {activeTab === "courses" ? "study goal, intake and budget"
          : activeTab === "jobs" ? "job type"
          : activeTab === "scholarships" ? "basis and degree level"
          : activeTab === "visa-services" ? "location and registration"
          : "location"}.
      </p>

      <FilterSection letter="A" title="Destination">
        {countryOptions ? (
          <div className="flex flex-col gap-2">
            <SelectField name="country" value={country} options={countryOptions} anyLabel="Any country" />
            {cityOptions ? (
              <SelectField name="city" value={city} options={cityOptions} anyLabel="Any city" />
            ) : (
              <input type="text" name="city" defaultValue={city} placeholder="City" className={fieldClass} />
            )}
          </div>
        ) : (
          <DestinationFilterFields country={country} city={city} />
        )}
      </FilterSection>

      {tabSections.map((section, i) => (
        <FilterSection key={section.title} letter={LETTERS[i] ?? "?"} title={section.title}>
          {section.body}
        </FilterSection>
      ))}

      {activeTab === "jobs" && (
        <>
          <FilterSection letter="B" title="Job Type">
            <RadioList
              name="job_type"
              value={jobType}
              options={Object.entries(JOB_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </FilterSection>
          <FilterSection letter="C" title="Work Mode">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" name="is_remote" value="true" defaultChecked={isRemote} className="h-4 w-4 rounded border-input" />
              Remote only
            </label>
          </FilterSection>
        </>
      )}

      <Button type="submit" className="h-10 w-full mt-1">Apply Filters</Button>
    </form>
  );
}
