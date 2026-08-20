import { Link2, MapPin, Mail, Phone, MessageCircle } from "lucide-react";
import type { BusinessDetail } from "../../../search/types";

const SOCIALS: { key: keyof BusinessDetail; label: string }[] = [
  { key: "facebook_url", label: "Facebook" },
  { key: "instagram_url", label: "Instagram" },
  { key: "twitter_url", label: "X (Twitter)" },
  { key: "linkedin_url", label: "LinkedIn" },
  { key: "youtube_url", label: "YouTube" },
];

function ContactRow({ icon: Icon, value }: Readonly<{ icon: typeof Phone; value: string }>) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="text-sm text-foreground leading-snug">{value}</p>
    </div>
  );
}

export function BusinessInfoCard({ business }: Readonly<{ business: BusinessDetail }>) {
  const socials = SOCIALS.filter((s) => business[s.key]);
  const hasContactInfo = business.phone || business.email || business.address;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="bg-gradient-to-br from-primary/10 to-transparent px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Get in touch</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Reach out to {business.business_name} directly.</p>
      </div>

      <div className="p-5">
        {hasContactInfo && (
          <div className="flex flex-col gap-3.5 mb-2">
            {business.phone && <ContactRow icon={Phone} value={business.phone} />}
            {business.email && <ContactRow icon={Mail} value={business.email} />}
            {business.address && <ContactRow icon={MapPin} value={business.address} />}
          </div>
        )}

        {socials.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-border">
            {socials.map(({ key, label }) => (
              <a
                key={key}
                href={business[key] as string}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Link2 className="h-3.5 w-3.5" />{label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
