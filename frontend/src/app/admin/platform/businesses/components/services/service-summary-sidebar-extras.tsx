"use client";

import { CalendarDays, CheckCircle2, Circle, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ManageButton, SummaryCardHeader } from "./summary-card-header";
import { useServiceSummaryData, type Kind } from "./use-service-summary-data";

export function ServiceSummarySidebarExtras({
  kind, orgId, serviceId, name, hasCategory, description, isCourse, tab, onNavigateTab,
}: Readonly<{
  kind: Kind; orgId: number; serviceId: string; name: string; hasCategory: boolean; description: string; isCourse: boolean;
  tab: string;
  onNavigateTab: (tab: "fees" | "intakes" | "eligibility") => void;
}>) {
  // Unlike the body extras above, this sidebar renders for every tab (it's not gated on
  // tab === "summary"), so it never unmounts while the admin adds a fee/intake elsewhere —
  // re-keying the fetch on `tab` picks those changes up whenever the tab changes, instead of only
  // on a full page reload.
  const { fees, intakes, eligibility, loading } = useServiceSummaryData(kind, orgId, serviceId, tab);
  if (loading) return null;

  const checklist = [
    { label: "Name & Category", done: name.trim().length > 0 && hasCategory },
    { label: "Description", done: description.trim().length > 0 },
    { label: "Fees", done: fees.length > 0 },
    ...(isCourse ? [
      { label: "Intakes", done: intakes.length > 0 },
      { label: "Eligibility", done: eligibility.length > 0 },
    ] : []),
  ];
  const doneCount = checklist.filter((s) => s.done).length;
  const remaining = checklist.filter((s) => !s.done);
  const pct = Math.round((doneCount / checklist.length) * 100);

  return (
    <>
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={DollarSign} title={isCourse ? "Course fees" : "Service fees"} action={<ManageButton hasData={fees.length > 0} onClick={() => onNavigateTab("fees")} />} />
        <CardContent className="p-5">
          {fees.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No fees configured yet.</p>
          ) : (
            <div className="space-y-3">
              {fees.map((fee) => {
                const first = fee.installments[0];
                const firstTotal = first?.lines.reduce((sum, l) => sum + l.amount, 0) ?? 0;
                return (
                  <div key={fee.id} className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
                    <Badge variant="secondary" className="text-xs capitalize">{fee.student_type}</Badge>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Total{fee.installments.length > 0 ? ` (${fee.installments.length} instalment${fee.installments.length !== 1 ? "s" : ""})` : ""}
                    </p>
                    <p className="text-lg font-bold">{fee.currency} {Number(fee.total_amount).toLocaleString()}</p>
                    {first && (
                      <p className="text-xs font-medium">{first.label || "1st instalment"}: {fee.currency} {firstTotal.toLocaleString()}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {isCourse && (
      <Card className="gap-0 overflow-hidden">
        <SummaryCardHeader icon={CalendarDays} title="Intakes" action={<ManageButton hasData={intakes.length > 0} onClick={() => onNavigateTab("intakes")} />} />
        <CardContent className="space-y-3 p-5">
          {intakes.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">No intakes configured yet.</p>
          ) : (
            intakes.map((intake) => {
              const startDate = intake.start_date ? new Date(intake.start_date) : null;
              return (
                <Card key={intake.id} className="overflow-hidden">
                  <CardContent className="flex p-0">
                    <div className="flex min-w-[60px] flex-col items-center justify-center border-r bg-primary/10 px-3 py-3 text-primary">
                      {startDate ? (
                        <>
                          <span className="text-xs font-bold uppercase tracking-wider">{startDate.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</span>
                          <span className="mt-0.5 text-xl font-black leading-none">{startDate.getDate()}</span>
                          <span className="mt-0.5 text-xs font-medium">{startDate.getFullYear()}</span>
                        </>
                      ) : (
                        <CalendarDays className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
                      <p className="truncate text-sm font-semibold">{intake.intake_name || "Unnamed intake"}</p>
                      {intake.admission_deadline && (
                        <p className="text-xs text-muted-foreground">
                          Deadline {new Date(intake.admission_deadline).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
      )}

      {doneCount < checklist.length && (
        <Card className="gap-0 overflow-hidden">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
            <h2 className="shrink-0 text-sm font-semibold">Service profile setup</h2>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Progress value={pct} className="h-1.5 flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">{doneCount}/{checklist.length}</span>
            </div>
          </div>
          <CardContent className="space-y-2 p-5">
            {remaining.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <Circle className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
