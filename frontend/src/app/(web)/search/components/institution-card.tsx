import Link from "next/link";
import { Building2, FileText, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flagFromIso2 } from "@/lib/utils";
import { VerifiedTick } from "../../components/verified-tick";
import { CampusChips } from "./campus-chips";
import { FavouriteButton } from "./favourite-button";
import { STUDY_MODE_LABEL, type SearchBusiness } from "../types";

function InstitutionStat({
  icon: Icon, label, children,
}: Readonly<{ icon: typeof Building2; label: string; children: React.ReactNode }>) {
  return (
    // Padding pairs with the parent's sm:divide-x so the partition lines sit evenly between stats.
    <div className="flex min-w-0 items-center gap-2 sm:px-4 sm:first:pl-0">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs leading-tight text-muted-foreground">{label}</p>
        <div className="text-sm font-medium leading-tight text-foreground">{children}</div>
      </div>
    </div>
  );
}

export function InstitutionCard({ institution }: Readonly<{ institution: SearchBusiness }>) {
  const flag = flagFromIso2(institution.country_code ?? "");
  const studyModes = institution.study_modes ?? [];
  const subjectAreaCount = institution.subject_area_count ?? 0;
  const profileHref = institution.slug ? `/institution/${institution.slug}` : "#";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md">
      {institution.slug && (
        <Link href={profileHref} className="absolute inset-0 z-0" aria-label={institution.business_name} />
      )}

      <div className="pointer-events-none flex flex-col sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-4 p-4 sm:flex-row">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
              {institution.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={institution.logo_url} alt={institution.business_name} className="h-full w-full object-contain p-1" />
              ) : (
                <Building2 className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-1.5 text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
                {institution.business_name}
                <VerifiedTick status={institution.status} claimStatus={institution.claim_status} />
              </h3>

              {(institution.city ?? institution.country_name) && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <GraduationCap className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {[institution.city, institution.country_name].filter(Boolean).join(", ")}
                  </span>
                  {flag && <span aria-hidden="true">{flag}</span>}
                </p>
              )}

              <CampusChips locations={institution.campus_locations ?? []} />
            </div>

            {/* The course count sits in the action rail, so this corner is the heart alone. */}
            <div className="pointer-events-auto relative z-10 shrink-0">
              <FavouriteButton itemType="institution" itemId={String(institution.id)} />
            </div>
          </div>

          {/* Stacked on mobile, so the dividers only appear once the three sit side by side. */}
          <div className="grid min-w-0 grid-cols-1 gap-3 border-t border-border px-4 py-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
            <InstitutionStat icon={Building2} label="Institution Type">
              {institution.institution_type ?? "—"}
            </InstitutionStat>
            <InstitutionStat icon={GraduationCap} label="Study Mode">
              {studyModes.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {studyModes.map((mode) => (
                    <span key={mode} className="rounded-md bg-muted px-2 py-0.5 text-xs font-normal text-foreground">
                      {STUDY_MODE_LABEL[mode] ?? mode}
                    </span>
                  ))}
                </span>
              ) : "—"}
            </InstitutionStat>
            <InstitutionStat icon={FileText} label="Subject Areas">{subjectAreaCount || "—"}</InstitutionStat>
          </div>
        </div>

        {/* pointer-events-auto + z-10, same as the heart above: the card-wide overlay Link sits at
            inset-0, so anything meant to stay clickable has to opt back in. */}
        <div className="pointer-events-auto relative z-10 flex w-full flex-col justify-between gap-6 border-t border-border p-5 sm:w-48 sm:shrink-0 sm:border-l sm:border-t-0">
          <div>
            <p className="text-xs text-muted-foreground">Available Courses</p>
            <p className="text-xl font-bold leading-tight text-foreground">
              {(institution.course_count ?? 0).toLocaleString()}
            </p>
          </div>

          {/* No institution prefill exists yet (the enquiry dialog only reads ?course_id=), so this
              lands on the enquiry list. PersonalShell bounces anonymous visitors to sign-in and
              preserves this URL, so they come back here rather than to a generic signup. */}
          <Link href="/personal/enquiries">
            <Button size="sm" className="h-9 w-full text-xs">Enquiry</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
