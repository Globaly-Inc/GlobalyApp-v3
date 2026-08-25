import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SocialIcon } from "../../../components/social-icon";
import { externalUrl } from "../../../components/profile/profile-section";
import { toProfileSocials } from "../../../components/profile/profile-data";
import { DEGREE_LABEL, type CourseDetail } from "../../../search/types";

/**
 * V1's course hero: the awarding institution's cover as a band, its crest overlapping the lower
 * edge, then the course name with the institution line and its socials beneath, and the two
 * calls to action on the right.
 */
export function CourseHero({ course }: Readonly<{ course: CourseDetail }>) {
  const institution = course.institution;
  const name = institution?.name ?? course.awarding_institution;
  // The institution's crest only — `course.image_url` is the course's own scraped photo, which
  // would put an unrelated picture in the crest slot. No crest means initials.
  const logo = institution?.logo_url ?? course.institution_logo_url;
  const initials = (name ?? course.name).split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const socials = institution ? toProfileSocials(institution) : [];
  const degreeLabel = course.degree_level ? DEGREE_LABEL[course.degree_level] ?? course.degree_level : null;

  return (
    <div className="relative isolate rounded-xl border border-border bg-card">
      <div className="relative z-0 h-32 overflow-hidden rounded-t-xl bg-gradient-to-br from-primary/20 via-primary/10 to-background md:h-40">
        {institution?.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={institution.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      <div className="relative z-10 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-end gap-4">
              <div className="relative z-20 -mt-14 flex h-28 w-28 shrink-0 items-center justify-center rounded-xl border-4 border-card bg-background p-3 shadow-lg">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={name ?? course.name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-lg font-bold text-primary">{initials || "?"}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <GraduationCap className="h-3 w-3" />{course.subject_area ?? "Academic Courses"}
                  </Badge>
                  {degreeLabel && <Badge variant="outline" className="text-xs">{degreeLabel}</Badge>}
                </div>
                <h1 className="truncate text-xl font-bold text-foreground">{course.name}</h1>
              </div>
            </div>

            {/* Left padding clears the crest above, so the institution line starts beside it. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:pl-32">
              {institution ? (
                <Link href={`/institution/${institution.slug}`} className="text-sm text-primary hover:underline">
                  {institution.name}
                </Link>
              ) : (
                name && <p className="text-sm text-muted-foreground">{name}</p>
              )}

              {socials.length > 0 && (
                <div className="ml-2 flex items-center gap-1.5">
                  {socials.map((social) => (
                    <a
                      key={social.name}
                      href={externalUrl(social.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={social.name}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <SocialIcon name={social.name} className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-row gap-2 self-center sm:w-auto">
            {/* V1 sent this to a standalone eligibility tool; V3 answers it on this page. */}
            <a
              href="#eligibility"
              // cn, not a template string: the variant's border-input has to win over the base
              // border-transparent, and tailwind-merge is what resolves that conflict.
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 flex-1 gap-1.5 text-xs sm:flex-none")}
            >
              <GraduationCap className="h-3.5 w-3.5" />Check Eligibility
            </a>
            <Link href={`/personal/enquiries?course_id=${course.id}`} className="flex-1 sm:flex-none">
              <Button size="sm" className="h-9 w-full text-xs">Enquire</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
