import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Calendar, MapPin, Award, ExternalLink, GraduationCap, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default async function ScholarshipDetailPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const scholarship = await getScholarshipBySlug(slug);
  if (!scholarship) notFound();

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Link href="/scholarships" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> All scholarships
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <GraduationCap className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-foreground leading-tight">{scholarship.title}</h1>
                {scholarship.provider_name && (
                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" />
                    {scholarship.provider_name}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {scholarship.basis && <Badge variant="outline" className="capitalize">{scholarship.basis}</Badge>}
                  <Badge variant="secondary" className="capitalize">{scholarship.coverage_type.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline" className="capitalize">{scholarship.source_type}</Badge>
                </div>
              </div>
            </div>
          </div>

          {scholarship.description && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-3">About this scholarship</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{scholarship.description}</p>
            </div>
          )}

          {scholarship.requirements_summary && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-3">Requirements</h2>
              <p className="text-sm text-foreground/80 whitespace-pre-line">{scholarship.requirements_summary}</p>
            </div>
          )}

          {scholarship.degree_levels.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold text-foreground mb-3">Eligible degree levels</h2>
              <div className="flex flex-wrap gap-2">
                {scholarship.degree_levels.map((d) => (
                  <Badge key={d} variant="outline" className="capitalize">{d.replace(/_/g, " ")}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            {scholarship.coverage_amount && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Award value</p>
                <p className="text-xl font-bold text-foreground flex items-center gap-2 mt-1">
                  <Award className="h-5 w-5 text-primary" />
                  {scholarship.coverage_currency} {Number(scholarship.coverage_amount).toLocaleString()}
                </p>
              </div>
            )}
            {scholarship.coverage_description && (
              <p className="text-sm text-muted-foreground">{scholarship.coverage_description}</p>
            )}

            {scholarship.deadline && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Deadline</p>
                <p className="font-medium text-foreground flex items-center gap-2 mt-1">
                  <Calendar className="h-4 w-4 text-primary" />
                  {new Date(scholarship.deadline).toLocaleDateString()}
                </p>
                {scholarship.deadline_notes && <p className="text-xs text-muted-foreground mt-1">{scholarship.deadline_notes}</p>}
              </div>
            )}

            {(scholarship.country || scholarship.city) && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
                <p className="font-medium text-foreground flex items-center gap-2 mt-1">
                  <MapPin className="h-4 w-4 text-primary" />
                  {[scholarship.city, scholarship.country].filter(Boolean).join(", ")}
                </p>
              </div>
            )}

            {scholarship.application_url && (
              <Button
                className="w-full"
                render={<a href={scholarship.application_url} target="_blank" rel="noopener noreferrer" />}
              >
                Apply now <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            )}
            {scholarship.source_url && (
              <Button
                variant="outline"
                className="w-full"
                render={<a href={scholarship.source_url} target="_blank" rel="noopener noreferrer" />}
              >
                Source <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
