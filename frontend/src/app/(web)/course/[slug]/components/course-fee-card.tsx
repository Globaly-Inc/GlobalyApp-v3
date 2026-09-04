import { Wallet } from "lucide-react";
import { Money } from "../../../components/money";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { CourseDetail, FeeInstallment } from "../../../search/types";

function FeeTile({
  label, total, currency, installments, period,
}: Readonly<{
  label: string;
  total: string | null;
  currency: string | null;
  installments: FeeInstallment[] | null;
  period?: string | null;
}>) {
  const amount = total == null ? null : Number(total);
  if (amount == null || Number.isNaN(amount)) return null;

  // A single entry is just the total restated — only a real schedule is worth expanding.
  const schedule = (installments ?? []).filter((i) => i.amount != null);

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <Money amount={amount} currency={currency} className="block text-2xl font-bold text-foreground" />
      {/* The period comes off the fee row itself — calling a per-year figure the course total
          would overstate a three-year degree by three. */}
      <p className="mt-1 text-xs text-muted-foreground">{label}{period ? ` · ${period}` : ""}</p>

      {schedule.length > 1 && (
        // ponytail: <details> is the whole disclosure — no state, no client component.
        <details className="group mt-3 border-t border-border pt-3">
          <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline">
            Instalments ({schedule.length}) <span className="inline-block transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="mt-2 space-y-1.5">
            {schedule.map((item, i) => (
              <li key={`${item.label ?? item.name ?? i}`} className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{item.label || item.name || `Instalment ${i + 1}`}</span>
                <Money amount={item.amount} currency={currency} className="font-medium text-foreground" />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function CourseFeeCard({ course }: Readonly<{ course: CourseDetail }>) {
  const hasFees = course.domestic_fee_total != null || course.international_fee_total != null;

  return (
    <ProfileSection icon={Wallet} title="Course Fee">
      {hasFees ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FeeTile
            label="Domestic" total={course.domestic_fee_total} period={course.domestic_fee_period}
            currency={course.domestic_currency} installments={course.domestic_fee_installments}
          />
          <FeeTile
            label="International" total={course.international_fee_total} period={course.international_fee_period}
            currency={course.international_currency} installments={course.international_fee_installments}
          />
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">Fees on enquiry.</p>
      )}
    </ProfileSection>
  );
}
