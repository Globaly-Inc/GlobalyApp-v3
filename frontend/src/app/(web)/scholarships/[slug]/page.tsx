import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft, Calendar, MapPin, Award, ExternalLink, GraduationCap, Building2,
  ListChecks, BookOpen, Clock, Star, Eye, Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { externalUrl } from "../../components/profile/profile-section";
import { Money } from "../../components/money";
import { getScholarshipBySlug } from "../api";

export async function generateMetadata({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>): Promise<Metadata> {
  const { slug } = await params;
  const scholarship = await getScholarshipBySlug(slug);
  if (!scholarship) return { title: "Scholarship not found — Globaly" };
  const title = `${scholarship.title} — Scholarship | Globaly`;
  const description = (scholarship.description ?? scholarship.requirements_summary ?? "").slice(0, 160);
  return { title, description };
}

function sourceLabel(type: string) {
  return type.replace(/_/g, " ");
}

function deadlineUrgency(deadline: string) {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: "Deadline passed", tone: "bg-muted text-muted-foreground" };
  if (days === 0) return { label: "Closes today", tone: "bg-destructive/10 text-destructive" };
  if (days <= 14) return { label: `${days} day${days === 1 ? "" : "s"} left`, tone: "bg-amber-500/10 text-amber-600" };
  return { label: `${days} days left`, tone: "bg-emerald-500/10 text-emerald-600" };
}

function SectionCard({
  icon: Icon, title, children,
}: Readonly<{ icon: typeof BookOpen; title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <h2 className="font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default async function ScholarshipDetailPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const scholarship = await getScholarshipBySlug(slug);
  if (!scholarship) notFound();

  const urgency = scholarship.deadline ? deadlineUrgency(scholarship.deadline) : null;

  return (
    <div>
      <div className="sticky top-16 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-5xl px-4 py-2.5">
          <Link href="/search?tab=scholarships" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All scholarships
          </Link>
        </div>
      </div>

      <section className="border-b border-border bg-linear-to-br from-primary/5 via-background to-primary/10 py-10">
        <div className="container mx-auto max-w-5xl px-4">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
              <GraduationCap className="h-8 w-8 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {scholarship.is_featured && (
                  <Badge className="gap-1 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">
                    <Star className="h-3 w-3 fill-current" /> Featured
                  </Badge>
                )}
                {scholarship.basis && <Badge variant="outline" className="capitalize">{scholarship.basis}</Badge>}
                <Badge variant="secondary" className="capitalize">{sourceLabel(scholarship.coverage_type)}</Badge>
                <Badge variant="outline" className="capitalize">{sourceLabel(scholarship.source_type)}</Badge>
              </div>
              <h1 className="mt-3 text-3xl font-bold leading-tight text-foreground md:text-4xl text-balance">{scholarship.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {scholarship.provider_name && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" /> {scholarship.provider_name}
                  </span>
                )}
                {(scholarship.city || scholarship.country) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> {[scholarship.city, scholarship.country].filter(Boolean).join(", ")}
                  </span>
                )}
                {scholarship.view_count > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Eye className="h-4 w-4" /> {scholarship.view_count.toLocaleString()} views
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {scholarship.description && (
              <SectionCard icon={BookOpen} title="About this scholarship">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{scholarship.description}</p>
              </SectionCard>
            )}

            {scholarship.requirements_summary && (
              <SectionCard icon={ListChecks} title="Requirements">
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{scholarship.requirements_summary}</p>
              </SectionCard>
            )}

            {scholarship.degree_levels.length > 0 && (
              <SectionCard icon={GraduationCap} title="Eligible degree levels">
                <div className="flex flex-wrap gap-2">
                  {scholarship.degree_levels.map((d) => (
                    <Badge key={d} variant="outline" className="capitalize">{d.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {scholarship.coverage_amount != null && (
                <div className="border-b border-border bg-primary/5 p-5">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Award className="h-3.5 w-3.5" /> Award value
                  </p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">
                    <Money amount={scholarship.coverage_amount} currency={scholarship.coverage_currency} />
                  </p>
                  {scholarship.coverage_description && (
                    <p className="mt-1.5 text-xs text-muted-foreground">{scholarship.coverage_description}</p>
                  )}
                </div>
              )}

              <div className="space-y-4 p-5">
                {scholarship.deadline && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Deadline</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Calendar className="h-4 w-4 text-primary" />
                        {new Date(scholarship.deadline).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                      </span>
                      {urgency && (
                        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${urgency.tone}`}>
                          <Clock className="h-3 w-3" /> {urgency.label}
                        </span>
                      )}
                    </div>
                    {scholarship.deadline_notes && <p className="mt-1.5 text-xs text-muted-foreground">{scholarship.deadline_notes}</p>}
                  </div>
                )}

                {scholarship.provider_name && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provider</p>
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Landmark className="h-4 w-4 text-primary" /> {scholarship.provider_name}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-1">
                  {scholarship.application_url ? (
                    <Button
                      className="h-11 w-full text-base font-semibold shadow-sm"
                      render={
                        <a href={externalUrl(scholarship.application_url)} target="_blank" rel="noopener noreferrer">
                          Apply now <ExternalLink className="ml-1.5 h-4 w-4" />
                        </a>
                      }
                    />
                  ) : (
                    <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                      No application link provided — contact the provider directly.
                    </p>
                  )}
                  {scholarship.source_url && (
                    <Button
                      variant="outline"
                      className="h-10 w-full"
                      render={
                        <a href={externalUrl(scholarship.source_url)} target="_blank" rel="noopener noreferrer">
                          View source <ExternalLink className="ml-1.5 h-4 w-4" />
                        </a>
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
