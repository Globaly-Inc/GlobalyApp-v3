import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { VisaServiceItem } from "../../../search/types";

/** "AUD 1,200", "From AUD 800", "AUD 800 – 1,500" — whichever of the fee columns is filled in. */
function feeLabel(service: VisaServiceItem): string | null {
  const currency = service.fee_currency ?? "";
  const amount = (value: string) => `${currency} ${Number(value).toLocaleString()}`.trim();

  if (service.fee_amount) return amount(service.fee_amount);
  if (service.fee_from && service.fee_to) return `${amount(service.fee_from)} – ${Number(service.fee_to).toLocaleString()}`;
  if (service.fee_from) return `From ${amount(service.fee_from)}`;
  return null;
}

export function VisaServicesSection({ services }: Readonly<{ services: VisaServiceItem[] }>) {
  if (services.length === 0) return null;

  return (
    <ProfileSection icon={FileText} title="Visa Services" count={services.length}>
      <div className="space-y-3">
        {services.map((service) => {
          const fee = feeLabel(service);
          const tags = [...(service.visa_types_handled ?? []), ...(service.specializations ?? [])];
          return (
            <div key={service.id} className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold leading-snug text-foreground">{service.name}</h3>
                  {service.type && <p className="mt-0.5 text-xs capitalize text-muted-foreground">{service.type.replace(/_/g, " ")}</p>}
                </div>
                {fee && <p className="shrink-0 text-sm font-semibold text-primary">{fee}</p>}
              </div>

              {service.description && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
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
