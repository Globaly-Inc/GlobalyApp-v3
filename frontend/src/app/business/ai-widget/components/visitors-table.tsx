"use client";

import { MessageSquare, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ACTIONS, rowDelay, STICKY_TD, STICKY_TH, TABLE, TABLE_WRAP, TD, TH, TR } from "@/app/business/profile/components/portal-ui/portal-ui";
import { relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import { VISITOR_STATUS_BADGE } from "../const";
import { visitorDisplayName, visitorInitials } from "../utils";
import type { WidgetVisitor } from "../apis/types";
import { ChannelGlyph } from "@/app/business/messages/components/channel-glyph";
import { INBOX_CHANNELS } from "@/app/business/messages/const";

/**
 * The list itself — a real table, because Status and Last activity were asked for as columns.
 * Styled with the Team tab's portal table classes (sticky header, sticky Actions column), so the
 * two pages read as one app.
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

  // The Team table's frame: its own scroll box, so the header and the Actions column stay put
  // while a narrow screen scrolls the columns sideways instead of dropping them.
  return (
    <div className={TABLE_WRAP}>
      <table className={cn(TABLE, "min-w-[1080px] table-fixed")}>
        <thead>
          <tr>
            <th className={cn(TH, "w-11")}>
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all on this page" />
            </th>
            <th className={cn(TH, "w-[24%]")}>Visitor</th>
            <th className={cn(TH, "w-28")}>Channel</th>
            <th className={cn(TH, "w-14")}>Age</th>
            <th className={cn(TH, "w-20")}>Gender</th>
            <th className={cn(TH, "w-28")}>Nationality</th>
            <th className={TH}>Study preference</th>
            <th className={cn(TH, "w-24")}>Status</th>
            <th className={cn(TH, "w-16")}>Chats</th>
            <th className={cn(TH, "w-28")}>Last activity</th>
            <th className={cn(TH, STICKY_TH, "w-20")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visitors.map((v, i) => {
            const badge = VISITOR_STATUS_BADGE[v.status];
            const anonymous = !v.name;
            const selected = selectedIds.has(v.id);
            return (
              <tr key={v.id} className={TR} style={rowDelay(i)} data-state={selected ? "selected" : undefined}>
                <td className={TD}>
                  <Checkbox checked={selected} onCheckedChange={() => toggleOne(v.id)} aria-label={`Select ${visitorDisplayName(v)}`} />
                </td>
                {/* Name with the email (or channel handle) beneath it. */}
                <td className={TD}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-9 shrink-0">
                      <AvatarFallback className={cn("text-xs font-semibold", anonymous ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
                        {anonymous ? <User className="h-4 w-4" /> : visitorInitials(v)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <b className={cn("block truncate text-sm", anonymous && "font-medium italic text-muted-foreground")}>{visitorDisplayName(v)}</b>
                      {v.email ? (
                        <a href={`mailto:${v.email}`} className="block truncate text-[12.5px] text-muted-foreground hover:text-primary hover:underline" title={v.email}>
                          {v.email}
                        </a>
                      ) : (
                        v.channel_handle && <small className="block truncate text-[12.5px] text-muted-foreground">{v.channel_handle}</small>
                      )}
                    </div>
                  </div>
                </td>
                <td className={TD}>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={v.channel_handle ?? undefined}>
                    <ChannelGlyph channel={v.channel ?? "ai_embed"} size="sm" />
                    <span className="truncate">{INBOX_CHANNELS[v.channel ?? "ai_embed"].label}</span>
                  </span>
                </td>
                {/* Verbatim, never a bucket — "early 30s" is a real stored value. */}
                <td className={cn(TD, "truncate")} title={v.age ?? undefined}>{orDash(v.age)}</td>
                <td className={cn(TD, "truncate capitalize")}>{orDash(v.gender)}</td>
                {/* The resolved country when there is one, otherwise the visitor's own wording; the
                    title carries the original, so a wrong resolution is visible from the list. */}
                <td className={cn(TD, "truncate")} title={v.nationality_raw ?? undefined}>{orDash(v.nationality ?? v.nationality_raw)}</td>
                <td className={cn(TD, "truncate")} title={v.study_preference ?? undefined}>{orDash(v.study_preference)}</td>
                <td className={TD}>
                  <Badge className={badge.className}>{badge.label}</Badge>
                </td>
                <td className={cn(TD, "text-muted-foreground")}>
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {v.message_count}
                  </span>
                </td>
                <td className={cn(TD, "truncate font-mono text-[11px] font-medium text-muted-foreground")}>{relativeTime(v.last_activity_at)}</td>
                <td className={cn(TD, STICKY_TD)}>
                  <div className={ACTIONS}>
                    <Button size="sm" onClick={() => onView(v)}>View</Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
