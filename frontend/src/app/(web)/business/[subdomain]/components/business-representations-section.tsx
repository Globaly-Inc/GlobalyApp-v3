import { BadgeCheck, Building2, Users } from "lucide-react";
import { ProfileSection } from "../../../components/profile/profile-section";
import type { BusinessRepresentation } from "../../../search/types";

export function BusinessRepresentationsSection({ representations = [] }: Readonly<{ representations?: BusinessRepresentation[] }>) {
  if (representations.length === 0) return null;

  return (
    <ProfileSection icon={Users} title="Authorized Representative For" count={representations.length}>
      <div className="space-y-2">
        {representations.map((rep) => (
          <div key={rep.id} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
              {rep.partner_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rep.partner_logo_url} alt="" className="h-full w-full object-contain p-0.5" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{rep.partner_name}</p>
              <p className="text-xs capitalize text-muted-foreground">{rep.partner_kind}</p>
            </div>
            <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
          </div>
        ))}
      </div>
    </ProfileSection>
  );
}
