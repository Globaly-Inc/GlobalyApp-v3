"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { categoriesApi, type CountryOption } from "@/app/admin/platform/categories/apis";
import { flagFromIso2 } from "@/app/admin/platform/categories/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type AdvancedFilters = {
  country: string;
  coverageMin: string;
  coverageMax: string;
  deadlineFrom: string;
  deadlineTo: string;
};

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  country: "", coverageMin: "", coverageMax: "", deadlineFrom: "", deadlineTo: "",
};

function activeCount(f: AdvancedFilters) {
  return Object.values(f).filter(Boolean).length;
}

export function ScholarshipAdvancedFilters({
  value,
  onApply,
}: Readonly<{ value: AdvancedFilters; onApply: (filters: AdvancedFilters) => void }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [countries, setCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-sync the draft with the applied filters each time the popover opens
      setDraft(value);
      if (countries.length === 0) categoriesApi.getCountries().then(setCountries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const countryOptions = [{ value: "", label: "All countries" }, ...countries.map((c) => ({ value: c.name, label: `${flagFromIso2(c.iso2)} ${c.name}` }))];
  const count = activeCount(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="h-10 gap-1.5">
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {count > 0 && <Badge className="ml-1 h-5 min-w-5 justify-center rounded-full px-1">{count}</Badge>}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Country</Label>
            <Combobox options={countryOptions} value={draft.country} onChange={(v) => setDraft((d) => ({ ...d, country: v }))} placeholder="All countries" />
          </div>

          <div className="space-y-2">
            <Label>Coverage amount</Label>
            <div className="flex items-center gap-2">
              <Input inputMode="decimal" placeholder="Min" value={draft.coverageMin} onChange={(e) => setDraft((d) => ({ ...d, coverageMin: e.target.value }))} />
              <span className="text-sm text-muted-foreground">–</span>
              <Input inputMode="decimal" placeholder="Max" value={draft.coverageMax} onChange={(e) => setDraft((d) => ({ ...d, coverageMax: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Deadline</Label>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker value={draft.deadlineFrom} onChange={(v) => setDraft((d) => ({ ...d, deadlineFrom: v }))} placeholder="From" />
              <DatePicker value={draft.deadlineTo} onChange={(v) => setDraft((d) => ({ ...d, deadlineTo: v }))} placeholder="To" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => { setDraft(EMPTY_ADVANCED_FILTERS); onApply(EMPTY_ADVANCED_FILTERS); setOpen(false); }}
            >
              Clear
            </Button>
            <Button size="sm" onClick={() => { onApply(draft); setOpen(false); }}>Apply filters</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
