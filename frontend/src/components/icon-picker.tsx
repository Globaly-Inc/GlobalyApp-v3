"use client";

import { useMemo, useRef, useState } from "react";
import { icons, Search, X, type LucideProps } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ICON_NAMES = Object.keys(icons);
const registry = icons as Record<string, React.ComponentType<LucideProps>>;

export function IconPicker({
  id,
  value,
  onChange,
  placeholder = "Select icon…",
}: Readonly<{
  id?: string;
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const names = q ? ICON_NAMES.filter((name) => name.toLowerCase().includes(q)) : ICON_NAMES;
    return names.slice(0, 80);
  }, [query]);

  const SelectedIcon = value ? registry[value] : undefined;

  function select(name: string) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
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
            id={id}
            ref={triggerRef}
            type="button"
            variant="outline"
            className={cn("h-9 w-full justify-start gap-2 font-normal", !value && "text-muted-foreground")}
          >
            {SelectedIcon ? (
              <>
                <SelectedIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{value}</span>
              </>
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        }
      />
      {open && (
        <PopoverContent anchor={triggerRef} className="w-(--anchor-width) p-0" align="start">
          <div className="relative border-b p-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            <Input
              autoFocus
              placeholder="Search icons…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-none pl-8 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto p-2">
            {filtered.map((name) => {
              const Icon = registry[name];
              if (!Icon) return null;
              return (
                <button
                  key={name}
                  type="button"
                  title={name}
                  onClick={() => select(name)}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-md transition-colors hover:bg-accent",
                    value === name && "bg-primary/10 ring-1 ring-primary",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="col-span-6 py-6 text-center text-sm text-muted-foreground">No icons found</p>
            )}
          </div>
          {value && (
            <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5 text-xs" onClick={() => select("")}>
                <X className="h-3 w-3" /> Clear selection
              </Button>
            </div>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}
