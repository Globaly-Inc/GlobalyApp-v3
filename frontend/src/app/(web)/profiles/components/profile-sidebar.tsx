import Link from "next/link";
import { Globe, Mail, MapPin, Phone } from "lucide-react";
import { safeUrl } from "@/lib/safe-url";
import { SocialIcon, type SocialName } from "../../components/social-icon";
import type { OrgProfile } from "../types";

// `whatsapp` is in the API payload but has no brand glyph in SocialIcon, so it is
// deliberately not rendered here rather than falling back to a wrong icon.
const SOCIAL_NAMES: SocialName[] = ["linkedin", "facebook", "instagram", "twitter", "youtube"];

export function ProfileSidebar({ org }: Readonly<{ org: OrgProfile }>) {
  const address = [org.address, org.city, org.state, org.postcode, org.country?.name].filter(Boolean).join(", ");
  const website = safeUrl(org.website);
  // Every one of these is a stored value rendered into an href, so each goes through
  // the allowlist; a link that fails it is dropped, never rendered raw.
  const socials = SOCIAL_NAMES.map((name) => ({ name, href: safeUrl(org.social[name]) })).filter(
    (s): s is { name: SocialName; href: string } => Boolean(s.href),
  );

  return (
    <aside className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Contact</h2>
        <ul className="space-y-2.5 text-sm">
          {address && (
            <li className="flex gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{address}</span>
            </li>
          )}
          {org.phone && (
            <li className="flex gap-2 text-muted-foreground">
              <Phone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <a href={`tel:${org.phone}`} className="hover:text-foreground">{org.phone}</a>
            </li>
          )}
          {org.email && (
            <li className="flex gap-2 text-muted-foreground">
              <Mail className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <a href={`mailto:${org.email}`} className="break-all hover:text-foreground">{org.email}</a>
            </li>
          )}
          {website && (
            <li className="flex gap-2 text-muted-foreground">
              <Globe className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <Link href={website} target="_blank" rel="noopener noreferrer" className="break-all hover:text-foreground">
                {website.replace(/^https?:\/\//, "")}
              </Link>
            </li>
          )}
        </ul>

        {socials.length > 0 && (
          <div className="mt-4 flex gap-2 border-t border-border pt-3">
            {socials.map(({ name, href }) => (
              <Link
                key={name}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={name}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground"
              >
                <SocialIcon name={name} className="h-4 w-4" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {org.country?.slug && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Destination</h2>
          <Link href={`/country/${org.country.slug}`} className="text-sm text-primary hover:underline">
            Study in {org.country.name}
          </Link>
        </div>
      )}
    </aside>
  );
}
