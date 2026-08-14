"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CountryMultiSelectOption = { value: number; label: string };

export function CountryMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select countries...",
  className,
}: Readonly<{
  options: CountryMultiSelectOption[];
  value: number[];
  onChange: (value: number[]) => void;
  placeholder?: string;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  const toggle = (id: number) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  const selectedLabel = options
    .filter((o) => value.includes(o.value))
    .map((o) => o.label)
    .join(", ");

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery(""); }}>
      <PopoverTrigger
        render={
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("h-10 w-full justify-between font-normal", className)}
          >
            {selectedLabel ? (
              <span className="truncate">{selectedLabel}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      {open && (
        <PopoverContent anchor={triggerRef} className="w-(--anchor-width) p-0" align="start">
          <div className="relative border-b p-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <Input
              autoFocus
              placeholder="Search countries..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 border-none pl-8 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-[250px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No countries found.</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-hidden hover:bg-muted"
                >
                  <Checkbox checked={value.includes(option.value)} tabIndex={-1} className="pointer-events-none" />
                  <span className="truncate">{option.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
