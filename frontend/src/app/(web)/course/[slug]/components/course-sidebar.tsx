import Link from "next/link";
import { Award, ExternalLink, MapPin, Share2 } from "lucide-react";
import { SocialIcon } from "../../../components/social-icon";
import { ProfileSection, externalUrl } from "../../../components/profile/profile-section";
import { joinParts, toProfileSocials } from "../../../components/profile/profile-data";
import { DEGREE_LABEL, type CourseDetail } from "../../../search/types";

/** "https://uni.edu.au/" -> "uni.edu.au" — the bare host, for a compact link label. */
function displayUrl(url: string) {
  const bare = url.replace("https://", "").replace("http://", "");
  return bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

export function CourseAwardedByCard({ course }: Readonly<{ course: CourseDetail }>) {
  const institution = course.institution;
  const name = institution?.name ?? course.awarding_institution;
  if (!name) return null;

  const logo = institution?.logo_url ?? course.institution_logo_url;
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const location = joinParts(institution?.city, course.country_name);
  const degreeLabel = course.degree_level ? DEGREE_LABEL[course.degree_level] ?? course.degree_level : null;

  return (
    <ProfileSection icon={Award} title="Awarded By">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={name} className="h-full w-full object-contain p-1" />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">{initials}</span>
          )}
        </div>
        <div className="min-w-0">
          {institution ? (
            <Link href={`/institution/${institution.slug}`} className="block truncate text-sm font-bold text-primary hover:underline">
              {institution.name}
            </Link>
          ) : (
            <p className="truncate text-sm font-bold text-foreground">{name}</p>
          )}
          {location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />{location}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-3">
        {degreeLabel && (
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Degree level</span>
            <span className="text-right font-medium text-foreground">{degreeLabel}</span>
          </div>
        )}
        {institution?.website && (
          <div className="flex justify-between gap-3 text-sm">
            <span className="shrink-0 text-muted-foreground">Website</span>
            <a
              href={externalUrl(institution.website)}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate font-medium text-primary hover:underline"
            >
              {displayUrl(institution.website)}
            </a>
          </div>
        )}
        {course.source_url && (
          <a
            href={externalUrl(course?.source_url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            View this course on their website<ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </ProfileSection>
  );
}

export function CourseConnectCard({ institution }: Readonly<{ institution: CourseDetail["institution"] }>) {
  const socials = institution ? toProfileSocials(institution) : [];
  if (socials.length === 0) return null;

  return (
    <ProfileSection icon={Share2} title="Connect with us">
      <div className="flex flex-wrap gap-2">
        {socials.map((social) => (
          <a
            key={social.name}
            href={externalUrl(social.url)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.name}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <SocialIcon name={social.name} className="h-4 w-4" />
          </a>
        ))}
      </div>
    </ProfileSection>
  );
}
