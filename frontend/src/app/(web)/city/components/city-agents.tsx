import { ArrowRight, Briefcase } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { SearchBusiness } from "../../search/types";

export function CityAgents({ cityName, agents }: Readonly<{ cityName: string; agents: SearchBusiness[] }>) {
  if (agents.length === 0) return null;

  return (
    <Reveal>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Agents in {cityName}</h2>
        <Button
          variant="outline"
          className="h-10"
          render={<Link href={`/search?tab=education-agencies&city=${encodeURIComponent(cityName)}`} />}
        >
          View All <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                {agent.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={agent.logo_url} alt={agent.business_name} className="h-full w-full rounded-lg object-contain p-1" />
                ) : (
                  <Briefcase className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{agent.business_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[agent.city, agent.country_name].filter(Boolean).join(", ")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Reveal>
  );
}
