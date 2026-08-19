import { Clock, GraduationCap } from "lucide-react";
import type { ProfileService } from "../types";

// ponytail: the cards are deliberately not links. These are catalog_services rows, and
// V3 has no public detail page for one — /course/[slug] resolves the *courses* index and
// /service/[serviceId] resolves the numeric student-services marketplace. Linking either
// would 404. Give them a route and wrap the card in it.

/** "AUD - Australian Dollar" in the DB; only the code belongs on a card. */
const currencyCode = (raw: string | null) => (raw ?? "").split(" ")[0] || "";

function feeLabel(service: ProfileService): string | null {
  const min = Number(service.min_fee);
  const max = Number(service.max_fee);
  if (!Number.isFinite(min) || min <= 0) return null;
  const code = currencyCode(service.fee_currency);
  const range = Number.isFinite(max) && max > min ? `${min.toLocaleString()}–${max.toLocaleString()}` : min.toLocaleString();
  return `${code} ${range}`.trim();
}

function durationLabel(service: ProfileService): string | null {
  if (!service.duration_value || !service.duration_unit) return null;
  const unit = service.duration_value === 1 ? service.duration_unit.replace(/s$/, "") : service.duration_unit;
  return `${service.duration_value} ${unit}`;
}

export function ProfileServices({
  services,
  total,
  heading,
}: Readonly<{ services: ProfileService[]; total: number; heading: string }>) {
  if (services.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold text-foreground">{heading}</h2>
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nothing listed yet.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        {heading} <span className="text-sm font-normal text-muted-foreground">({total})</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {services.map((service) => {
          const fee = feeLabel(service);
          const duration = durationLabel(service);
          return (
            <div key={service.service_id} className="rounded-xl border border-border bg-card p-4">
              <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{service.name}</h3>
              {service.description && (
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{service.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{duration}
                  </span>
                )}
                {fee && (
                  <span className="flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" />{fee}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
