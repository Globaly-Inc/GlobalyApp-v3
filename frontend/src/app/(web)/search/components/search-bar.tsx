import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchTabKey } from "../types";

export function SearchBar({
  activeTab, search, country, city, degreeLevel, subjectArea, jobType, isRemote, feeMin, feeMax, currency, sort,
  intakeYear, basis, licensedOnly, basePath = "/search",
}: Readonly<{
  activeTab: SearchTabKey;
  basePath?: string;
  search?: string;
  country?: string;
  city?: string;
  degreeLevel?: string;
  subjectArea?: string;
  jobType?: string;
  isRemote?: boolean;
  feeMin?: number;
  feeMax?: number;
  currency?: string;
  sort?: string;
  intakeYear?: number;
  basis?: string;
  licensedOnly?: boolean;
}>) {
  return (
    <form method="get" action={basePath} className="flex items-center gap-2 flex-1">
      <input type="hidden" name="tab" value={activeTab} />
      {country && <input type="hidden" name="country" value={country} />}
      {city && <input type="hidden" name="city" value={city} />}
      {degreeLevel && <input type="hidden" name="degree_level" value={degreeLevel} />}
      {subjectArea && <input type="hidden" name="subject_area" value={subjectArea} />}
      {jobType && <input type="hidden" name="job_type" value={jobType} />}
      {isRemote && <input type="hidden" name="is_remote" value="true" />}
      {feeMin != null && <input type="hidden" name="fee_min" value={feeMin} />}
      {feeMax != null && <input type="hidden" name="fee_max" value={feeMax} />}
      {currency && <input type="hidden" name="currency" value={currency} />}
      {sort && <input type="hidden" name="sort" value={sort} />}
      {intakeYear != null && <input type="hidden" name="intake_year" value={intakeYear} />}
      {basis && <input type="hidden" name="basis" value={basis} />}
      {licensedOnly && <input type="hidden" name="licensed_only" value="true" />}
      <input
        type="text"
        name="search"
        defaultValue={search}
        placeholder={`Search ${activeTab.replace("-", " ")}...`}
        className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" className="h-10 gap-1.5 shrink-0">
        <Search className="h-4 w-4" />
        <span className="hidden sm:inline">Search</span>
      </Button>
    </form>
  );
}
