import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getMaraAgent } from "../api";

interface Params {
  params: Promise<{ marn: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { marn } = await params;
  const agent = await getMaraAgent(decodeURIComponent(marn));
  if (!agent) return { title: "Agent not found — Globaly" };
  return {
    title: `${agent.business_name ?? agent.marn} (MARN ${agent.marn}) — Globaly`,
    description: `Registration record for migration agent MARN ${agent.marn}.`,
  };
}

export default async function MigrationAgentPage({ params }: Params) {
  const { marn } = await params;
  const agent = await getMaraAgent(decodeURIComponent(marn));
  if (!agent) notFound();

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/migration-agents"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All agents
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">MARN {agent.marn}</Badge>
        {agent.registration_status && <Badge variant="secondary">{agent.registration_status}</Badge>}
      </div>

      <h1 className="text-3xl font-bold text-foreground">{agent.business_name ?? agent.marn}</h1>
      {agent.business_slug && (
        <p className="mt-1 text-sm text-muted-foreground">
          <Link href={`/institution/${agent.business_slug}`} className="underline">
            View profile
          </Link>
        </p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Fact label="Registered" value={agent.registration_date} />
        <Fact label="Expires" value={agent.expiry_date} />
        <Fact
          label="Office"
          value={
            [agent.office_city, agent.office_state, agent.office_country].filter(Boolean).join(", ") ||
            null
          }
        />
        <Fact label="Practice areas" value={agent.practice_areas?.join(", ") ?? null} />
        <Fact label="Languages" value={agent.languages_spoken?.join(", ") ?? null} />
      </dl>

      {/* No contact details by design: the directory publishes the registration
          record, and the backend table carries no email, phone or street address. */}
      <p className="mt-6 text-sm text-muted-foreground">
        This is a public registration record. Contact details are not published here — reach the
        agent through the registrar or their own website.
      </p>

      {/* The backend rejects any non-http(s) scheme (shared/url.ts). */}
      {agent.source_url && (
        <a
          href={agent.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Registrar listing
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
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
