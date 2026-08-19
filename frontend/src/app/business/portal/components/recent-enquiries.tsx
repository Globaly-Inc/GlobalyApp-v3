"use client";

import Link from "next/link";
import { Inbox, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { InboxItem } from "../apis/types";
import { leadHeadline } from "../utils";

function leadDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function LeadRow({ lead }: { lead: InboxItem }) {
  return (
    <li className="flex items-start gap-3 border-b border-border py-3 last:border-0">
      <span
        aria-hidden
        className={`mt-1.5 size-2 shrink-0 rounded-full ${lead.unlocked ? "bg-primary" : "bg-muted-foreground/40"}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{leadHeadline(lead)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {lead.student.first_name} · {leadDate(lead.created_at)}
          {lead.distance_km !== null ? ` · ${lead.distance_km} km away` : ""}
        </p>
      </div>
      {lead.unlocked ? (
        <Badge variant="secondary">Unlocked</Badge>
      ) : (
        <Badge variant="outline">
          <Lock /> {lead.coin_cost}
        </Badge>
      )}
    </li>
  );
}

export function RecentEnquiries({ leads, total }: { leads: InboxItem[]; total: number }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4 md:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recent enquiries</h2>
        {total > 0 ? (
          <Link href="/business/enquiries" className="text-xs font-medium text-primary hover:underline">
            View all
          </Link>
        ) : null}
      </div>

      {/* Honest empty state. Several V3 businesses legitimately have zero leads,
          and this screen says so rather than showing a placeholder number. */}
      {leads.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Inbox className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No enquiries yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Student leads matched to your business will appear here. Publishing your services makes you eligible for
            more of them.
          </p>
        </div>
      ) : (
        <ul className="mt-2">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </ul>
      )}
    </section>
  );
}
