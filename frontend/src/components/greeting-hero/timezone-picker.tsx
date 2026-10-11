"use client";

import { useMemo, useState } from "react";
import { Globe, Pencil, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { allZones } from "./utils";

/** The small "Asia/Kathmandu ✎" link under the hero clock, opening a searchable zone list. */
export function TimezonePicker({ timezone, onChange }: Readonly<{ timezone: string; onChange: (zone: string) => void }>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const zones = allZones().map((zone) => ({ value: zone, label: zone.replace(/_/g, " ") }));
    return term ? zones.filter((z) => z.label.toLowerCase().includes(term)) : zones;
  }, [query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger className="mt-1 flex cursor-pointer items-center gap-1 text-xs text-white/70 transition-colors hover:text-white">
        <Globe className="size-3" />
        {timezone.replace(/_/g, " ")}
        <Pencil className="size-2.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="relative border-b p-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 opacity-50" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search timezone…"
            className="h-8 border-none pl-8 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[250px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No timezone found.</p>
          ) : (
            filtered.map((tz) => (
              <button
                key={tz.value}
                type="button"
                onClick={() => {
                  onChange(tz.value);
                  setOpen(false);
                }}
                className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                {tz.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
