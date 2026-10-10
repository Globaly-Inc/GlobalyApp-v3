import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SEARCH_INPUT } from "../portal-ui/portal-ui";

/** Toolbar search box (kit SEARCH_INPUT); grows to fill the bar, no keyboard hint. */
export function ScholarshipSearch({ value, onChange }: Readonly<{ value: string; onChange: (v: string) => void }>) {
  return (
    <div className="relative min-w-0 flex-[1_1_240px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label="Search scholarships"
        className={SEARCH_INPUT}
        placeholder="Search your scholarships…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
