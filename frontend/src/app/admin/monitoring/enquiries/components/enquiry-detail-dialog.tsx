"use client";

import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EnquiryStatusBadge } from "@/app/business/enquiries/components/enquiry-status-badge";
import { formatDate } from "@/app/personal/earn/services/utils";
import { DISTRIBUTION_TABLE_HEAD, TIER_LABEL } from "../const";
import { RecordsTable } from "./records-table";
import type { AdminEnquiryDetail } from "../apis";

/**
 * The whole enquiry in one place: what the student wrote, and every business the matcher
 * picked — including the ones that never paid. The student's own view is deliberately
 * limited to businesses that unlocked; this screen is the only one allowed the full list,
 * because "who did this reach and why" is the question monitoring exists to answer.
 */
export function EnquiryDetailDialog({
  open,
  onOpenChange,
  enquiry,
  status,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: AdminEnquiryDetail | null;
  status: "idle" | "loading" | "failed";
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        {status === "loading" && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {status === "failed" && (
          <p className="py-12 text-center text-sm text-muted-foreground">Couldn&apos;t load this enquiry.</p>
        )}

        {status === "idle" && enquiry && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{enquiry.course_name}</DialogTitle>
              <DialogDescription>
                {enquiry.institution_name ?? "Institution unknown"} · sent {formatDate(enquiry.created_at)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3 sm:grid-cols-2">
              <Fact label="Student">
                {enquiry.student_name || "—"}
                <span className="block truncate text-xs text-muted-foreground">{enquiry.student_email}</span>
              </Fact>
              <Fact label="Status">
                <EnquiryStatusBadge status={enquiry.status} />
              </Fact>
              <Fact label="Intake">
                {[enquiry.preferred_intake, enquiry.preferred_year].filter(Boolean).join(" ") || "Not specified"}
              </Fact>
              <Fact label="Accepts">
                {enquiry.accept_count} of {enquiry.max_accepts} · {enquiry.distribution_count} distributed
              </Fact>
              {enquiry.target_business_name && (
                <Fact label="Sent directly to">{enquiry.target_business_name}</Fact>
              )}
              {enquiry.closed_at && (
                <Fact label="Closed">
                  {formatDate(enquiry.closed_at)}
                  {enquiry.close_reason && (
                    <span className="block text-xs text-muted-foreground">{enquiry.close_reason}</span>
                  )}
                </Fact>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Message</p>
              <p className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground">
                {enquiry.message}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recipients ({enquiry.distributions.length})
              </p>
              <RecordsTable
                head={DISTRIBUTION_TABLE_HEAD}
                minWidth="min-w-[560px]"
                emptyText="This enquiry was never distributed."
                rows={enquiry.distributions.map((d) => [
                  <span key="b">
                    {d.business_name}
                    <span className="block text-xs text-muted-foreground">
                      {d.recipient_kind === "institution" ? "Institution · fallback" : d.city}
                    </span>
                  </span>,
                  <span key="t" className="text-xs">
                    T{d.tier}
                    <span className="block text-muted-foreground">{TIER_LABEL[d.tier] ?? "—"}</span>
                  </span>,
                  <EnquiryStatusBadge key="s" status={d.status} />,
                  d.coin_cost || "—",
                  d.unlocked_at ? formatDate(d.unlocked_at) : "—",
                ])}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm text-foreground">{children}</div>
    </div>
  );
}
