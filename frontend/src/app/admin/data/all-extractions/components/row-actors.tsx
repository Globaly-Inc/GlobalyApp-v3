"use client";

import { Bot, PencilLine, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActorFields } from "../apis/types";

/** "Added by / Edited by" line for one extraction row.
 *
 *  A row with no creator was scraped by the pipeline, and says so — that IS the answer to
 *  "who added this", so it earns a line rather than rendering nothing. The editor is
 *  omitted when it's the same person who added the row: the common case is an admin
 *  creating and then correcting their own row, and repeating the name reads as noise. */
export function RowActors({ row, className }: Readonly<{ row: ActorFields; className?: string }>) {
  const creator = row.created_by_name || row.created_by_email;
  const editor = row.updated_by_name || row.updated_by_email;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground", className)}>
      {creator ? (
        <span className="flex items-center gap-1" title={row.created_by_email ?? undefined}>
          <UserRound className="h-3.5 w-3.5 shrink-0" />
          Added by {creator}
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <Bot className="h-3.5 w-3.5 shrink-0" />
          Extracted automatically
        </span>
      )}
      {editor && editor !== creator && (
        <span className="flex items-center gap-1" title={row.updated_by_email ?? undefined}>
          <PencilLine className="h-3.5 w-3.5 shrink-0" />
          Edited by {editor}
        </span>
      )}
    </div>
  );
}
