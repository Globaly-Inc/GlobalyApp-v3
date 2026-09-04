import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Money } from "../../../components/money";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { VisaServiceItem } from "../../../search/types";

/** "AUD 1,200", "From AUD 800", "AUD 800 – 1,500" — whichever of the fee columns is filled in. */
function FeeLabel({ service }: Readonly<{ service: VisaServiceItem }>) {
  const money = (amount: string, to?: string | null) => (
    <Money amount={amount} to={to} currency={service.fee_currency} />
  );

  if (service.fee_amount) return money(service.fee_amount);
  if (service.fee_from && service.fee_to) return money(service.fee_from, service.fee_to);
  if (service.fee_from) return <>From {money(service.fee_from)}</>;
  return null;
}

/**
 * The track record and reach superadmin holds on the service row — the same figures the admin's
 * service card shows. Rendered only where extraction actually captured them.
 */
function serviceFacts(service: VisaServiceItem): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (service.consultation_free) facts.push({ label: "Consultation", value: "Free" });
  else if (service.consultation_fee) {
    facts.push({ label: "Consultation", value: `${service.fee_currency ?? ""} ${service.consultation_fee}`.trim() });
  }
  if (service.years_experience) facts.push({ label: "Experience", value: `${service.years_experience} years` });
  if (service.team_size) facts.push({ label: "Team size", value: String(service.team_size) });
  if (service.success_rate) facts.push({ label: "Success rate", value: `${service.success_rate}%` });
  if (service.average_rating) {
    facts.push({
      label: "Rating",
      value: service.review_count
        ? `${service.average_rating} (${service.review_count})`
        : String(service.average_rating),
    });
  }
  const list = (values: string[] | null) => (values?.length ? values.join(", ") : null);
  const languages = list(service.languages_spoken);
  if (languages) facts.push({ label: "Languages", value: languages });
  const countries = list(service.countries_serviced);
  if (countries) facts.push({ label: "Serves", value: countries });
  return facts;
}

export function VisaServicesSection({ services }: Readonly<{ services: VisaServiceItem[] }>) {
  if (services.length === 0) return null;

  return (
    <ProfileSection icon={FileText} title="Visa Services" count={services.length}>
      <div className="space-y-3">
        {services.map((service) => {
          const tags = [
            ...(service.visa_types_handled ?? []),
            ...(service.specializations ?? []),
            ...(service.services_offered ?? []),
          ];
          const facts = serviceFacts(service);
          return (
            <div key={service.id} className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug text-foreground">{service.name}</h3>
                  {service.type && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{service.type.replace(/_/g, " ")}</p>}
                </div>
                {(service.fee_amount || service.fee_from) && (
                  <p className="shrink-0 text-sm font-semibold text-primary">
                    <FeeLabel service={service} />
                  </p>
                )}
              </div>

              {service.description && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
              )}

              {facts.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {facts.map((fact) => (
                    <div key={fact.label} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{fact.label}</dt>
                      <dd className="truncate text-xs font-medium text-foreground">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {tags.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px] font-normal capitalize">{tag.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ProfileSection>
  );
}
