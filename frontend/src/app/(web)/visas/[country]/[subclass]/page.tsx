import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getVisaDetail } from "../../api";
import type { VisaDetail } from "../../types";

interface Params {
  params: Promise<{ country: string; subclass: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { country, subclass } = await params;
  const visa = await getVisaDetail(country, decodeURIComponent(subclass));
  if (!visa) return { title: "Visa not found — Globaly" };
  return {
    title: `${visa.name} (Subclass ${visa.subclass_code}) — Globaly`,
    description: visa.description ?? undefined,
  };
}

export default async function VisaDetailPage({ params }: Params) {
  const { country, subclass } = await params;
  const visa = await getVisaDetail(country, decodeURIComponent(subclass));
  if (!visa) notFound();

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/visas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All visas
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{visa.country_code}</Badge>
        <Badge variant="outline">Subclass {visa.subclass_code}</Badge>
        {visa.visa_stream && <Badge variant="outline">{visa.visa_stream}</Badge>}
        {visa.is_permanent && <Badge>Permanent residency</Badge>}
      </div>

      <h1 className="text-3xl font-bold text-foreground">{visa.name}</h1>
      {visa.department_name && (
        <p className="mt-1 text-sm text-muted-foreground">
          Published by{" "}
          {visa.department_slug ? (
            <Link href={`/institution/${visa.department_slug}`} className="underline">
              {visa.department_name}
            </Link>
          ) : (
            visa.department_name
          )}
        </p>
      )}

      {(visa.overview ?? visa.description) && (
        <p className="mt-4 whitespace-pre-line text-foreground">{visa.overview ?? visa.description}</p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Category" value={visa.category} />
        <Fact
          label="Duration"
          value={visa.duration_months != null ? `${visa.duration_months} months` : null}
        />
        <Fact label="Processing time" value={processingTime(visa)} />
        <Fact label="Application fee" value={fee(visa)} />
        <Fact
          label="Points test"
          value={
            visa.points_test_required
              ? visa.min_points != null
                ? `Required — minimum ${visa.min_points}`
                : "Required"
              : "Not required"
          }
        />
        <Fact label="Age" value={ageRange(visa)} />
        <Fact label="Eligible nationalities" value={list(visa.eligible_nationalities)} />
        <Fact label="Excluded nationalities" value={list(visa.excluded_nationalities)} />
      </dl>

      <JsonFacts label="Work rights" value={visa.work_rights} />
      <JsonFacts label="Study rights" value={visa.study_rights} />
      <JsonFacts label="English requirements" value={visa.english_requirements} />

      {/* The backend rejects anything that is not http(s) (shared/url.ts), so these
          hrefs cannot carry a javascript: payload. */}
      {(visa.official_url ?? visa.source_url) && (
        <div className="mt-8 flex flex-wrap gap-2">
          {visa.official_url && (
            <a
              href={visa.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Official page
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {visa.source_url && visa.source_url !== visa.official_url && (
            <a
              href={visa.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Source
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function processingTime(visa: VisaDetail): string | null {
  const { processing_time_min_days: min, processing_time_max_days: max } = visa;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

function fee(visa: VisaDetail): string | null {
  if (!visa.application_fee_amount) return null;
  const amount = Number(visa.application_fee_amount);
  if (Number.isNaN(amount)) return null;
  return `${visa.application_fee_currency ?? ""} ${amount.toLocaleString()}`.trim();
}

function ageRange(visa: VisaDetail): string | null {
  const { age_min: min, age_max: max } = visa;
  if (min == null && max == null) return null;
  if (min != null && max != null) return `${min}–${max}`;
  return min != null ? `${min}+` : `Up to ${max}`;
}

function list(values: string[] | null): string | null {
  return values?.length ? values.join(", ") : null;
}

function Fact({ label, value }: Readonly<{ label: string; value: string | null }>) {
  if (!value) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/**
 * work_rights / study_rights / english_requirements are free-form jsonb the
 * extractor fills, so the shape varies by country. Flat key/value pairs are
 * rendered as a list; anything nested falls back to formatted JSON rather than
 * being dropped.
 */
function JsonFacts({ label, value }: Readonly<{ label: string; value: unknown }>) {
  if (value == null || typeof value !== "object") return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold text-foreground">{label}</h2>
      <ul className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
        {entries.map(([key, entryValue]) => (
          <li key={key} className="flex flex-wrap gap-2 border-b border-border py-1 last:border-0">
            <span className="font-medium text-muted-foreground">{key.replace(/_/g, " ")}:</span>
            <span className="text-foreground">
              {typeof entryValue === "object" && entryValue !== null
                ? JSON.stringify(entryValue)
                : String(entryValue)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
