import Link from "next/link";
import type { Metadata } from "next";
import { Search, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchMaraAgents } from "./api";

export const metadata: Metadata = {
  title: "Registered migration agents — Globaly",
  description: "Search registered migration agents by name, MARN, or office state.",
};

function filterHref(q: string, state: string) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (state) qs.set("state", state);
  const s = qs.toString();
  return s ? `/migration-agents?${s}` : "/migration-agents";
}

export default async function MigrationAgentsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; state?: string }> }>) {
  const { q = "", state = "" } = await searchParams;

  const [agents, all] = await Promise.all([
    searchMaraAgents({ q: q || undefined, state: state || undefined }),
    searchMaraAgents({ q: q || undefined, limit: 100 }),
  ]);

  const states = [...new Set(all.map((a) => a.office_state).filter((s): s is string => !!s))].sort();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Registered migration agents</h1>
        </div>
        <p className="text-muted-foreground">
          {agents.length} registered agent{agents.length !== 1 ? "s" : ""}. Each entry shows the
          public registration record — check the registrar before engaging anyone.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <form action="/migration-agents" className="rounded-xl border border-border bg-card p-4">
            <label htmlFor="mara-q" className="mb-2 block text-sm font-semibold text-foreground">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="mara-q"
                name="q"
                defaultValue={q}
                placeholder="Name or MARN"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <Button type="submit" size="sm" aria-label="Search agents">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </form>

          {states.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Office state</h3>
              <div className="max-h-96 space-y-1 overflow-y-auto">
                <Link
                  href={filterHref(q, "")}
                  scroll={false}
                  className={`block rounded px-2 py-1 text-sm hover:bg-muted ${!state ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  All
                </Link>
                {states.map((option) => (
                  <Link
                    key={option}
                    href={filterHref(q, option)}
                    scroll={false}
                    className={`block rounded px-2 py-1 text-sm hover:bg-muted ${state === option ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    {option}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="space-y-3">
          {agents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              No agents match these filters.
            </div>
          ) : (
            agents.map((agent) => (
              <Link
                key={agent.marn}
                href={`/migration-agents/${encodeURIComponent(agent.marn)}`}
                className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">MARN {agent.marn}</Badge>
                  {agent.registration_status && (
                    <Badge variant="secondary">{agent.registration_status}</Badge>
                  )}
                </div>
                <h2 className="font-semibold text-foreground">{agent.business_name ?? agent.marn}</h2>
                <p className="text-xs text-muted-foreground">
                  {[agent.office_city, agent.office_state].filter(Boolean).join(", ") || "—"}
                </p>
                {agent.practice_areas?.length ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Practice areas: {agent.practice_areas.join(", ")}
                  </p>
                ) : null}
                {agent.languages_spoken?.length ? (
                  <p className="text-sm text-muted-foreground">
                    Languages: {agent.languages_spoken.join(", ")}
                  </p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
