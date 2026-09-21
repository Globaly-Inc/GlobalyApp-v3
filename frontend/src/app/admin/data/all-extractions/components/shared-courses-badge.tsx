"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CourseAssignment } from "../apis/types";

const PAGE = 10;

/** Names of the OTHER courses an entity is linked to, read off the assignment rows already loaded with the job. */
export function otherCourseNames(rows: CourseAssignment[], column: string, entityId: string, currentCourseId: string): string[] {
  const byId = new Map<string, string>();
  for (const r of rows) {
    if (r[column] !== entityId || r.course_id === currentCourseId || byId.has(r.course_id)) continue;
    byId.set(r.course_id, r.course_name ?? "Unnamed course");
  }
  return [...byId.values()].sort((a, b) => a.localeCompare(b));
}

/** "+3 other courses" that lists the names on hover, ten at a time, with View more for the rest. */
export function SharedCoursesBadge({ names, prefix = "+", className }: Readonly<{ names: string[]; prefix?: string; className?: string }>) {
  const [shown, setShown] = useState(PAGE);
  if (names.length === 0) return null;
  const label = `${prefix}${names.length} other course${names.length === 1 ? "" : "s"}`;
  return (
    <Popover onOpenChange={(open) => { if (!open) setShown(PAGE); }}>
      <PopoverTrigger
        openOnHover
        delay={150}
        className={cn("cursor-default text-xs text-muted-foreground underline decoration-dotted underline-offset-2", className)}
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1.5 p-2.5">
        <p className="text-[11px] font-medium text-muted-foreground">Also linked to</p>
        <ul className="flex flex-col gap-0.5 text-xs">
          {names.slice(0, shown).map((n, i) => <li key={`${i}-${n}`} className="truncate" title={n}>{n}</li>)}
        </ul>
        {shown < names.length && (
          <Button variant="ghost" size="sm" className="h-7 justify-start px-1 text-xs cursor-pointer" onClick={() => setShown((s) => s + PAGE)}>
            View more ({names.length - shown} left)
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
