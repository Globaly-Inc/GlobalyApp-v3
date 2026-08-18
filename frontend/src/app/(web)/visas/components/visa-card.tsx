import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { VisaListItem } from "../types";

function processingTime(visa: VisaListItem): string | null {
  const { processing_time_min_days: min, processing_time_max_days: max } = visa;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

function fee(visa: VisaListItem): string | null {
  if (!visa.application_fee_amount) return null;
  const amount = Number(visa.application_fee_amount);
  if (Number.isNaN(amount)) return null;
  return `${visa.application_fee_currency ?? ""} ${amount.toLocaleString()}`.trim();
}

export function VisaCard({ visa }: Readonly<{ visa: VisaListItem }>) {
  const time = processingTime(visa);
  const cost = fee(visa);

  return (
    <Link
      href={`/visas/${visa.country_code}/${encodeURIComponent(visa.subclass_code)}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{visa.country_code}</Badge>
        <Badge variant="outline">Subclass {visa.subclass_code}</Badge>
        {visa.is_permanent && <Badge>Permanent</Badge>}
        {visa.points_test_required && (
          <Badge variant="outline">
            Points test{visa.min_points != null ? ` · ${visa.min_points}` : ""}
          </Badge>
        )}
      </div>

      <h2 className="font-semibold text-foreground">{visa.name}</h2>
      {visa.department_name && (
        <p className="text-xs text-muted-foreground">{visa.department_name}</p>
      )}

      {visa.description && (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{visa.description}</p>
      )}

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {visa.category && (
          <div>
            <dt className="inline font-medium">Category: </dt>
            <dd className="inline">{visa.category}</dd>
          </div>
        )}
        {visa.visa_stream && (
          <div>
            <dt className="inline font-medium">Stream: </dt>
            <dd className="inline">{visa.visa_stream}</dd>
          </div>
        )}
        {visa.duration_months != null && (
          <div>
            <dt className="inline font-medium">Duration: </dt>
            <dd className="inline">{visa.duration_months} months</dd>
          </div>
        )}
        {time && (
          <div>
            <dt className="inline font-medium">Processing: </dt>
            <dd className="inline">{time}</dd>
          </div>
        )}
        {cost && (
          <div>
            <dt className="inline font-medium">Fee: </dt>
            <dd className="inline">{cost}</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
