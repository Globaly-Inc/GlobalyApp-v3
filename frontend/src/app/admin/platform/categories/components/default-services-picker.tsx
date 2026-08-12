"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DynamicIcon } from "@/components/dynamic-icon";
import { cn } from "@/lib/utils";
import type { Category } from "../apis/types";

export function DefaultServicesPicker({
  serviceCategories,
  selectedIds,
  onChange,
}: Readonly<{
  serviceCategories: Category[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selected = serviceCategories.filter((c) => selectedIds.includes(c.id));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? serviceCategories.filter((c) => c.name.toLowerCase().includes(q)) : serviceCategories;
  }, [serviceCategories, query]);

  function toggle(id: number) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id]);
  }

  return (
    <div className="flex flex-col gap-3">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              variant="outline"
              className="h-9 w-full justify-between font-normal text-muted-foreground"
            >
              Search service categories…
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          }
        />
        {open && (
          <PopoverContent anchor={triggerRef} className="w-(--anchor-width) p-0" align="start">
            <div className="border-b p-1">
              <Input
                autoFocus
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="border-none shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No categories found.</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", selectedIds.includes(c.id) ? "opacity-100" : "opacity-0")} />
                    <DynamicIcon name={c.icon} fallback="Layers" className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        )}
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((c) => (
            <Badge key={c.id} variant="secondary" className="h-6 gap-1.5 pr-1 pl-2 text-xs">
              <DynamicIcon name={c.icon} fallback="Layers" className="h-3.5 w-3.5" />
              {c.name}
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="rounded-full p-0.5 transition-colors hover:bg-muted-foreground/20"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="py-2 text-center text-sm text-muted-foreground">No categories selected.</p>
      )}
    </div>
  );
}
