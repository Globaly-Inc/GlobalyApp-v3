import { Briefcase } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { BusinessService } from "../../../search/types";

export function BusinessServicesSection({ services = [] }: Readonly<{ services?: BusinessService[] }>) {
  if (services.length === 0) return null;

  return (
    <ProfileSection icon={Briefcase} title="Services" count={services.length}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {services.map((service) => (
          <div key={service.id} className="rounded-lg border border-border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold leading-snug text-foreground">{service.name}</h3>
            {service.description && (
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{service.description}</p>
            )}
            {service.price && (
              <p className="mt-2 text-sm font-semibold text-primary">From {Number(service.price).toLocaleString()}</p>
            )}
          </div>
        ))}
      </div>
    </ProfileSection>
  );
}
