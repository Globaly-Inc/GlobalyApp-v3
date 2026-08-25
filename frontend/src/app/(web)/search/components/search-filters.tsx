import { Button } from "@/components/ui/button";
import { BudgetFilter } from "./budget-filter";
import { ComboFilterField } from "./combo-filter-field";
import { DestinationFilterFields } from "./destination-filter-fields";
import { BASIS_LABEL, DEGREE_LABEL, JOB_TYPE_LABEL, type SearchTabKey } from "../types";

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
}>) {
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

      {activeTab === "courses" && (
        <>
          <FilterSection letter="B" title="Study Goal">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Degree Level</p>
            <ComboFilterField
              name="degree_level"
              value={degreeLevel}
              options={degreeLevels ?? []}
              anyLabel="Any degree"
            />
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mt-4 mb-2">Field of Study</p>
            <input
              type="text"
              name="subject_area"
              defaultValue={subjectArea}
              placeholder="e.g. Computer Science"
              className={fieldClass}
            />
          </FilterSection>
          {intakeYears && intakeYears.length > 0 && (
            <FilterSection letter="C" title="Intake">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Year</p>
              <ComboFilterField
                name="intake_year"
                value={intakeYear != null ? String(intakeYear) : undefined}
                options={intakeYears.map(String)}
                anyLabel="Any year"
              />
            </FilterSection>
          )}
          <FilterSection letter={intakeYears && intakeYears.length > 0 ? "D" : "C"} title="Budget">
            <BudgetFilter min={feeMin} max={feeMax} />
          </FilterSection>
        </>
      )}

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

      {activeTab === "visa-services" && (
        <FilterSection letter="B" title="Registration">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" name="licensed_only" value="true" defaultChecked={licensedOnly} className="h-4 w-4 rounded border-input" />
            Active registration only
          </label>
        </FilterSection>
      )}

      {activeTab === "scholarships" && (
        <>
          <FilterSection letter="B" title="Basis">
            <SelectField
              name="basis"
              value={basis}
              options={Object.entries(BASIS_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </FilterSection>
          <FilterSection letter="C" title="Degree Level">
            <SelectField
              name="degree_level"
              value={degreeLevel}
              options={Object.entries(DEGREE_LABEL).map(([value, label]) => ({ value, label }))}
            />
          </FilterSection>
        </>
      )}

      <Button type="submit" className="h-10 w-full mt-1">Apply Filters</Button>
    </form>
  );
}
