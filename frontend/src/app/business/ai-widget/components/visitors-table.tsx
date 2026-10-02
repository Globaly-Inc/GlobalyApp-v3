"use client";

import { MessageSquare, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "../const";
import { visitorDisplayName, visitorInitials } from "../utils";
import type { WidgetVisitor } from "../apis/types";

/**
 * The list itself — a real table, because Status and Last activity were asked for as columns
 * and a column that only lines up on one screen width is not a column. The card chrome around
 * it (header, tabs, pagination) is the Team tab's, so the two pages still read as one app.
 */

/**
 * An em dash, not an empty cell. Every one of these attributes is absent for most visitors —
 * nobody states their age unprompted — so a blank would read as a rendering gap rather than as
 * the normal state. Matches how the email column has always handled a missing address.
 */
function orDash(value: string | null | undefined) {
  return value ? value : <span className="text-muted-foreground">—</span>;
}

export function VisitorsTable({
  visitors,
  selectedIds,
  onSelectedIdsChange,
  onView,
}: Readonly<{
  visitors: WidgetVisitor[];
  selectedIds: Set<number>;
  onSelectedIdsChange: (ids: Set<number>) => void;
  onView: (visitor: WidgetVisitor) => void;
}>) {
  // "Select all" means every row ON THIS PAGE, which is what the checkbox can honestly promise
  // — the rest of the matches have not been fetched. ponytail: a true select-across-pages needs
  // the server to return ids, add it when a bulk action needs more than a page.
  const allSelected = visitors.length > 0 && visitors.every((v) => selectedIds.has(v.id));

  const toggleAll = () => {
    const next = new Set(selectedIds);
    if (allSelected) visitors.forEach((v) => next.delete(v.id));
    else visitors.forEach((v) => next.add(v.id));
    onSelectedIdsChange(next);
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  // table-fixed + truncating cells keeps the table inside the card at any width: the two
  // free-text columns (name/email and study preference) absorb whatever width is left, and
  // the per-visitor demographics drop out below lg rather than pushing a horizontal scroll.
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className="table-fixed">
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10 pl-3">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all on this page" />
            </TableHead>
            <TableHead className="text-xs text-muted-foreground">Visitor</TableHead>
            <TableHead className="hidden w-14 text-xs text-muted-foreground lg:table-cell">Age</TableHead>
            <TableHead className="hidden w-20 text-xs text-muted-foreground lg:table-cell">Gender</TableHead>
            <TableHead className="hidden w-28 text-xs text-muted-foreground lg:table-cell">Nationality</TableHead>
            <TableHead className="hidden text-xs text-muted-foreground lg:table-cell">Study preference</TableHead>
            <TableHead className="w-24 text-xs text-muted-foreground">Status</TableHead>
            <TableHead className="w-16 text-xs text-muted-foreground">Chats</TableHead>
            <TableHead className="hidden w-28 text-xs text-muted-foreground md:table-cell">Last activity</TableHead>
            <TableHead className="w-20 pr-3 text-right text-xs text-muted-foreground">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visitors.map((v) => {
            const badge = VISITOR_STATUS_BADGE[v.status];
            const anonymous = !v.name;
            const selected = selectedIds.has(v.id);
            return (
              <TableRow key={v.id} data-state={selected ? "selected" : undefined}>
                <TableCell className="pl-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() => toggleOne(v.id)}
                    aria-label={`Select ${visitorDisplayName(v)}`}
                  />
                </TableCell>
                {/* Name with the email beneath it — one column instead of two is most of the width
                    that used to overflow. No email is the normal state, so it is simply omitted. */}
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback
                        className={cn(
                          "text-xs font-semibold",
                          anonymous ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                        )}
                      >
                        {anonymous ? <User className="h-4 w-4" /> : visitorInitials(v)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className={cn("truncate font-medium", anonymous && "text-muted-foreground italic")}>
                        {visitorDisplayName(v)}
                      </p>
                      {v.email && (
                        <a
                          href={`mailto:${v.email}`}
                          className="block truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                          title={v.email}
                        >
                          {v.email}
                        </a>
                      )}
                    </div>
                  </div>
                </TableCell>
                {/* Verbatim, never a bucket — "early 30s" is a real stored value. */}
                <TableCell className="hidden truncate lg:table-cell" title={v.age ?? undefined}>{orDash(v.age)}</TableCell>
                <TableCell className="hidden truncate capitalize lg:table-cell">{orDash(v.gender)}</TableCell>
                {/* The resolved country when there is one, otherwise the visitor's own wording.
                    The title carries the original whenever it differed, so a wrong resolution is
                    visible without opening the drawer. */}
                <TableCell className="hidden truncate lg:table-cell" title={v.nationality_raw ?? undefined}>
                  {orDash(v.nationality ?? v.nationality_raw)}
                </TableCell>
                <TableCell className="hidden truncate lg:table-cell" title={v.study_preference ?? undefined}>
                  {orDash(v.study_preference)}
                </TableCell>
                <TableCell>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {v.message_count}
                  </span>
                </TableCell>
                <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                  {relativeTime(v.last_activity_at)}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <Button size="sm" onClick={() => onView(v)}>View</Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
