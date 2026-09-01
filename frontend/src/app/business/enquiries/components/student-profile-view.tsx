"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Briefcase,
  GraduationCap,
  Languages,
  LoaderCircle,
  Mail,
  PhoneOff,
  User,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { flagEmoji } from "@/components/ui/phone-input";
import { cn } from "@/lib/utils";
import { geoApi, type Country } from "@/app/geo/apis";
import { businessEnquiriesApi } from "../apis";
import type { DistributionListItem, EligibilityCriterion, UnlockedStudentProfile } from "../apis";

/**
 * The student behind one unlocked enquiry, as a full page.
 *
 * Laid out to match the student's own profile screen: cover band with the avatar overlapping it,
 * then a two-thirds/one-third split — Personal Details, Contact Details and the record sections on
 * the left, a sidebar on the right. A business and a student looking at the same person should be
 * looking at the same page, so this mirrors profile-view.tsx's grid, profile-hero-card.tsx's hero
 * and profile-details-cards.tsx's field grids rather than inventing a business-side layout.
 *
 * The sidebar swaps the two cards that only mean something to their owner — Profile Completion and
 * the public link — for Course Requirements, which is the reason an agent opened this at all.
 */
export function StudentProfileView({ distributionId }: Readonly<{ distributionId: string }>) {
  const [profile, setProfile] = useState<UnlockedStudentProfile | null>(null);
  const [item, setItem] = useState<DistributionListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    let active = true;
    businessEnquiriesApi
      .getStudentProfile(distributionId)
      .then((p) => active && setProfile(p))
      .catch((e: Error) => active && setError(e.message));
    // The criteria live on the list item, not the profile — the verdict belongs to the enquiry.
    // Best-effort: a failure here costs the requirements card, not the page.
    businessEnquiriesApi
      .listDistributions()
      .then(({ data }) => active && setItem(data.find((r) => r.distribution_id === distributionId) ?? null))
      .catch(() => {});
    geoApi.getCountries().then((c) => active && setCountries(c)).catch(() => {});
    return () => {
      active = false;
    };
  }, [distributionId]);

  const p = profile?.profile ?? null;
  const name = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";
  const country = (id?: number | null) => countries.find((c) => c.id === id) ?? null;
  const countryName = (id?: number | null) => country(id)?.name ?? null;
  const nationality = country(p?.nationality_id);
  const criteria = item?.eligibility_criteria ?? null;

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <BackLink />
        <Card className="mt-4">
          <CardContent className="space-y-3">
            <p className="text-sm text-destructive">{error}</p>
            {/* The most likely cause by far, and the agent can act on it themselves. */}
            <p className="text-sm text-muted-foreground">
              A student&apos;s profile is only available once your organisation has unlocked their
              enquiry.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <BackLink />
        <Card className="mt-4">
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Loading profile…
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <BackLink />

      {/* Hero — cover with the avatar overlapping it, read-only: no CoverLogoEditor, because a
          business must never be offered a way to change a student's photo. */}
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        <div
          className="h-32 bg-muted sm:h-44"
          style={
            profile.cover_url
              ? { backgroundImage: `url(${profile.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : undefined
          }
        />
        <CardContent>
          <div className="-mt-14 flex items-end gap-4">
            <Avatar className="size-28 shrink-0 rounded-xl border-4 border-background shadow-lg">
              {profile.photo_url && <AvatarImage src={profile.photo_url} alt="" className="rounded-lg object-cover" />}
              <AvatarFallback className="rounded-lg bg-primary/10 text-2xl text-primary">
                {name ? name.charAt(0).toUpperCase() : <User className="size-8" aria-hidden />}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-xl font-bold text-foreground">{name || "Student"}</h1>
              {nationality && <p className="text-sm text-muted-foreground">From {nationality.name}</p>}
              {p?.city_of_residence && (
                <p className="text-sm text-muted-foreground">
                  {nationality && `${flagEmoji(nationality.iso2)} `}
                  {p.city_of_residence}
                  {countryName(p.country_of_residence_id) ? `, ${countryName(p.country_of_residence_id)}` : ""}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section icon={User} title="Personal Details">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Full Name" value={name} />
              <Field label="Date of Birth" value={formatDate(p?.date_of_birth)} />
              <Field label="Gender" value={titleise(p?.gender)} />
              <Field label="Nationality" value={nationality?.name} />
              <Field label="City of Residence" value={p?.city_of_residence} />
            </div>
          </Section>

          <Section icon={Mail} title="Contact Details">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email" value={profile.email} />
              {profile.phone_withheld ? (
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  {/* Stated, not blank — the agent paid for this profile and should know the gap is
                      the student's choice, not a field we failed to collect. */}
                  <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <PhoneOff className="size-3.5 shrink-0" aria-hidden />
                    Not shared by the student
                  </p>
                </div>
              ) : (
                <Field label="Phone" value={profile.phone} />
              )}
              <Field
                label="Personal Address"
                value={[p?.personal_address_street, p?.personal_address_city, p?.personal_address_state, p?.personal_address_postcode]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Field label="Country" value={countryName(p?.personal_address_country_id)} />
            </div>
          </Section>

          <Section icon={GraduationCap} title="Education Background" count={profile.qualifications.length}>
            <div className="space-y-2">
              {profile.qualifications.map((q) => (
                <Row
                  key={q.id}
                  icon={GraduationCap}
                  title={q.degree_title || q.qualification_type || "Qualification"}
                  badge={titleise(q.qualification_type)}
                  subtitle={[q.institution_name, q.subject_area].filter(Boolean).join(" · ")}
                  meta={[formatRange(q.start_date, q.end_date, q.is_current), gradeLabel(q.grade_value, q.grading_system)]
                    .filter(Boolean)
                    .join(" · ")}
                />
              ))}
            </div>
          </Section>

          <Section icon={Briefcase} title="Work Experience" count={profile.work_experiences.length}>
            <div className="space-y-2">
              {profile.work_experiences.map((w) => (
                <Row
                  key={w.id}
                  icon={Briefcase}
                  title={w.job_title}
                  subtitle={w.organization_name}
                  meta={formatRange(w.start_date, w.end_date, w.is_current)}
                />
              ))}
            </div>
          </Section>

          <Section icon={Award} title="Academic Test" count={profile.academic_tests.length}>
            <div className="space-y-2">
              {profile.academic_tests.map((t) => (
                <Row
                  key={t.id}
                  icon={Award}
                  title={t.test_type ?? "Test"}
                  subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
                  meta={[formatDate(t.test_date), subScoreLabel(t.sub_scores)].filter(Boolean).join(" · ")}
                />
              ))}
            </div>
          </Section>

          <Section icon={Languages} title="Language Test" count={profile.language_tests.length}>
            <div className="space-y-2">
              {profile.language_tests.map((t) => (
                <Row
                  key={t.id}
                  icon={Languages}
                  title={t.test_type ?? "Test"}
                  subtitle={t.test_status === "completed" ? `Score: ${t.overall_score ?? "—"}` : "Awaiting results"}
                  meta={[formatDate(t.test_date), subScoreLabel(t.sub_scores)].filter(Boolean).join(" · ")}
                />
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          {criteria && criteria.length > 0 && (
            <Section icon={GraduationCap} title="Course Requirements" count={criteria.length}>
              <div className="space-y-2">
                {criteria.map((c) => (
                  <div key={c.key} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Needs {c.required ?? "—"} · has {c.actual ?? "not provided"}
                        {c.converted && " (converted)"}
                      </p>
                    </div>
                    <CriterionBadge status={c.status} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section icon={GraduationCap} title="Study Preferences">
            <div className="space-y-3">
              <BadgeList label="Study Destinations" values={p?.preferred_destinations?.map((id) => countryName(id) ?? String(id))} />
              <BadgeList label="Subject Areas" values={p?.preferred_fields ?? undefined} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Degree Level" value={p?.preferred_degree_levels?.map((d) => titleise(d)).join(", ")} />
                <Field label="Expected Start" value={formatMonthYear(p?.expected_start_date)} />
              </div>
              <Field
                label="Budget"
                value={
                  p?.budget_min || p?.budget_max
                    ? `${p?.budget_currency ?? ""} ${p?.budget_min ?? "?"} – ${p?.budget_max ?? "?"} / year`
                    : null
                }
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" className="-ml-2" render={<Link href="/business/enquiries" />}>
      <ArrowLeft className="size-4" aria-hidden />
      Back to enquiries
    </Button>
  );
}

function BadgeList({ label, values }: Readonly<{ label: string; values?: string[] }>) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values?.length ? (
          values.map((v) => (
            <Badge key={v} variant="secondary">
              {v}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

/**
 * SectionCard/OneToManySection without the add and edit affordances.
 *
 * Not imported from the portal: OneToManySection requires an `onAdd` and SectionCard's edit button
 * an `onEdit`, and a business must never be offered a way to change a student's record. Same
 * Card / CardTitle / count-Badge composition, so the two read identically.
 */
function Section({
  icon: Icon,
  title,
  count,
  children,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {count != null && count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {count === 0 ? <p className="text-sm text-muted-foreground">Not provided.</p> : children}
      </CardContent>
    </Card>
  );
}

/** The portal's ItemRow, minus edit/delete, plus a badge slot. */
function Row({
  icon: Icon,
  title,
  badge,
  subtitle,
  meta,
}: Readonly<{
  icon?: ComponentType<{ className?: string }>;
  title: string;
  badge?: string | null;
  subtitle?: string | null;
  meta?: string | null;
}>) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      {Icon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          {badge && (
            <Badge variant="secondary" className="shrink-0 text-[11px]">
              {badge}
            </Badge>
          )}
        </div>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        {meta && <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>}
      </div>
    </div>
  );
}

/** Matches the portal's Field: small label above the value, em dash when empty. */
function Field({ label, value }: Readonly<{ label: string; value?: string | null }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

/** Same tones as eligibility-badge.tsx, so a criterion reads the same wherever it appears. */
function CriterionBadge({ status }: Readonly<{ status: EligibilityCriterion["status"] }>) {
  const tone =
    status === "pass"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : status === "fail"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : "border-border bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("shrink-0 text-[11px]", tone)}>
      {status === "pass" ? "Meets" : status === "fail" ? "Below" : "Unknown"}
    </Badge>
  );
}

// ── Formatting, mirroring record-sections.tsx so dates read the same in both places ──

function formatMonthYear(value?: string | null): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-\d{2}/.exec(value);
  if (!iso) return value;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

function formatRange(start: string | null, end: string | null, isCurrent: boolean): string | null {
  if (!start && !end) return null;
  return `${formatMonthYear(start) ?? "—"} – ${isCurrent ? "Present" : (formatMonthYear(end) ?? "—")}`;
}

function formatDate(value?: string | null): string | null {
  return value ? (value.split("T")[0] ?? null) : null;
}

function gradeLabel(grade: string | null, system: string | null): string | null {
  if (!grade) return null;
  return system ? `${grade} (${system.replace(/_/g, " ")})` : grade;
}

/** "L 7.5 · R 7.0 · W 6.5 · S 7.0" — the bands an agent checks against a course's sub-minimums. */
function subScoreLabel(subScores: Record<string, string> | null): string | null {
  if (!subScores) return null;
  const parts = (["listening", "reading", "writing", "speaking"] as const)
    .map((k) => (subScores[k] ? `${k.charAt(0).toUpperCase()} ${subScores[k]}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function titleise(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
