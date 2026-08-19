"use client";

import { useMemo, useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MAX_WORLD_CLOCKS, WORLD_CLOCKS_KEY } from "../const";
import { usePersistedChoice } from "../utils/use-persisted-choice";

/** Stored as a comma-separated zone list so it round-trips through the same localStorage helper. */
const isZoneList = (value: string): value is string => typeof value === "string";

/** "Asia/Kolkata" → "Kolkata". The area prefix is noise once the clock is on screen. */
function cityOf(zone: string): string {
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** Current UTC offset for a zone, e.g. "GMT+5:45" — computed, never hardcoded, so DST is correct. */
function offsetLabel(zone: string, now: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" }).formatToParts(now);
    return parts.find((p) => p.type === "timeZoneName")?.value.replace("GMT", "GMT") ?? "";
  } catch {
    return "";
  }
}

function allZones(): string[] {
  return typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [Intl.DateTimeFormat().resolvedOptions().timeZone];
}

export function WorldClocks({ now, homeTimezone }: { now: Date; homeTimezone: string }) {
  const [stored, setStored] = usePersistedChoice<string>(WORLD_CLOCKS_KEY, "", isZoneList);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const added = useMemo(() => stored.split(",").filter(Boolean), [stored]);
  // The user's own zone always leads the row and cannot be removed — it is the reference the rest read against.
  const zones = useMemo(() => [homeTimezone, ...added.filter((z) => z !== homeTimezone)], [homeTimezone, added]);

  const options = useMemo(() => {
    const term = query.trim().toLowerCase();
    const candidates = allZones().filter((zone) => !zones.includes(zone));
    const matches = term ? candidates.filter((zone) => zone.toLowerCase().replace(/_/g, " ").includes(term)) : candidates;
    return matches.slice(0, 60);
  }, [query, zones]);

  const addZone = (zone: string) => {
    setPickerOpen(false);
    setQuery("");
    // Oldest drops out once the row is full, so adding always visibly does something.
    setStored([...added.filter((z) => z !== zone), zone].slice(-(MAX_WORLD_CLOCKS - 1)).join(","));
  };

  const removeZone = (zone: string) => setStored(added.filter((z) => z !== zone).join(","));

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {zones.map((zone) => {
        const isHome = zone === homeTimezone;
        return (
          <div
            key={zone}
            className="group relative min-w-30 rounded-lg bg-white/10 px-2.5 py-2 text-left backdrop-blur-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[11px] font-medium text-white">{cityOf(zone)}</span>
              {isHome && <span className="text-[10px] text-white/60">Default</span>}
            </div>
            <p className="text-base font-bold leading-tight text-white">
              {new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(now)}
              <span className="ml-0.5 text-[10px] font-normal text-white/70">
                {new Intl.DateTimeFormat(undefined, { timeZone: zone, second: "2-digit" }).format(now)}
              </span>
            </p>
            <p className="text-[10px] text-white/60">
              {new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(now)}
            </p>

            {!isHome && (
              <button
                type="button"
                aria-label={`Remove ${cityOf(zone)}`}
                onClick={() => removeZone(zone)}
                className="absolute -right-1 -top-1 hidden cursor-pointer rounded-full bg-white/90 p-0.5 text-neutral-700 shadow group-hover:block hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {added.length < MAX_WORLD_CLOCKS - 1 && (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Add a time zone"
                className="min-w-13 cursor-pointer rounded-lg border border-dashed border-white/40 px-3 text-white/70 transition-colors hover:border-white/70 hover:text-white"
              />
            }
          >
            <Plus className="mx-auto h-4 w-4" />
          </PopoverTrigger>
          {pickerOpen && (
            <PopoverContent align="end" className="w-72 p-0">
              <div className="relative border-b p-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by city or region…"
                  className="h-8 border-none pl-8 shadow-none focus-visible:ring-0"
                />
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {options.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No matching time zone.</p>
                ) : (
                  options.map((zone) => (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => addZone(zone)}
                      className={cn(
                        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted",
                      )}
                    >
                      <span className="truncate">
                        {cityOf(zone)}
                        <span className="ml-1 text-xs text-muted-foreground">{zone.split("/")[0]}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{offsetLabel(zone, now)}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          )}
        </Popover>
      )}
    </div>
  );
}
