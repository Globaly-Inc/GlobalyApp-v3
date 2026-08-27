import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { ProfileSection, externalUrl } from "./profile-section";
import type { ProfileData } from "./profile-data";

function ContactRow({
  icon: Icon, label, value, isLink,
}: Readonly<{ icon: typeof Phone; label: string; value: string | null; isLink?: boolean }>) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {!value && <p className="text-sm italic text-muted-foreground">Not set</p>}
        {value && isLink && (
          <a href={externalUrl(value)} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-primary hover:underline">
            {value}
          </a>
        )}
        {value && !isLink && <p className="text-sm font-medium text-foreground">{value}</p>}
      </div>
    </div>
  );
}

export function ProfileContactCard({ data }: Readonly<{ data: ProfileData }>) {
  if (!data.email && !data.phone && !data.website && !data.addressLabel) return null;

  return (
    <ProfileSection icon={Phone} title="Contact Details">
      <div className="space-y-3">
        <ContactRow icon={Mail} label="Email" value={data.email} />
        <ContactRow icon={Phone} label="Phone" value={data.phone} />
        <ContactRow icon={Globe} label="Website" value={data.website} isLink />
        <ContactRow icon={MapPin} label="Address" value={data.addressLabel} />
      </div>
    </ProfileSection>
  );
}
