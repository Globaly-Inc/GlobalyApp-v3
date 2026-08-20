import { Link2, MapPin, Mail, Phone } from "lucide-react";
import { SectionCard } from "../../../course/[slug]/components/section-card";
import type { InstitutionDetail } from "../../../search/types";

// lucide-react in this app has no brand icon set — a plain link glyph plus
// the platform name (below) is enough to identify each social link.
const SOCIALS: { key: keyof InstitutionDetail; label: string }[] = [
  { key: "facebook_url", label: "Facebook" },
  { key: "instagram_url", label: "Instagram" },
  { key: "twitter_url", label: "X (Twitter)" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "youtube_url", label: "YouTube" },
];

export function InstitutionInfoCard({ institution }: Readonly<{ institution: InstitutionDetail }>) {
  const socials = SOCIALS.filter((s) => institution[s.key]);
  const hasContactInfo = institution.phone || institution.email || institution.address;

  if (!hasContactInfo && socials.length === 0) return null;

  return (
    <SectionCard icon={Phone} title="Contact">
      <div className="flex flex-col gap-2.5 text-sm">
        {institution.phone && (
          <p className="flex items-center gap-2 text-foreground"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{institution.phone}</p>
        )}
        {institution.email && (
          <p className="flex items-center gap-2 text-foreground"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{institution.email}</p>
        )}
        {institution.address && (
          <p className="flex items-center gap-2 text-foreground"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{institution.address}</p>
        )}
      </div>

      {socials.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-border">
          {socials.map(({ key, label }) => (
            <a
              key={key}
              href={institution[key] as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <Link2 className="h-3.5 w-3.5" />{label}
            </a>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
