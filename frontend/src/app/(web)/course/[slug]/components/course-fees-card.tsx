import { DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "./section-card";
import type { CourseDetail } from "../../../search/types";

function FeeTile({ label, amount, currency }: Readonly<{ label: string; amount: string | null; currency: string | null }>) {
  const n = amount ? Number(amount) : null;
  if (n == null || Number.isNaN(n)) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <Badge variant="secondary" className="mb-2 text-xs">{label}</Badge>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
      <p className="text-lg font-bold text-primary">{currency ?? ""} {n.toLocaleString()}</p>
    </div>
  );
}

export function CourseFeesCard({ course }: Readonly<{ course: CourseDetail }>) {
  const hasFees = course.domestic_fee_total != null || course.international_fee_total != null;

  return (
    <SectionCard icon={DollarSign} title="Course fees">
      {hasFees ? (
        <div className="flex flex-col gap-3">
          <FeeTile label="Domestic" amount={course.domestic_fee_total} currency={course.domestic_currency} />
          <FeeTile label="International" amount={course.international_fee_total} currency={course.international_currency} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Fees on enquiry.</p>
      )}
    </SectionCard>
  );
}
