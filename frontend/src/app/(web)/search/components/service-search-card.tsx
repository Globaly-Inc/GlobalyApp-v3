import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SearchService } from "../types";

export function ServiceSearchCard({ service: s }: Readonly<{ service: SearchService }>) {
  return (
    <div className="bg-card border border-border rounded-xl hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 flex items-start gap-3 py-3.5 px-4">
          <div className="w-12 h-12 rounded-lg border border-border bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo_url} alt={s.business_name} className="h-full w-full object-contain p-1" />
            ) : (
              <Briefcase className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <h3 className="font-semibold text-foreground leading-snug text-[15px] line-clamp-1">{s.name}</h3>
            <p className="text-xs text-muted-foreground truncate">{s.business_name}</p>
            {s.category_name && <p className="text-xs font-medium text-primary/90 truncate">{s.category_name}</p>}
          </div>
        </div>

        <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 px-4 py-3 flex flex-col justify-center gap-2">
          {s.price && <p className="text-sm font-bold text-primary leading-tight whitespace-nowrap">{s.price}</p>}
          <Link href={`/business/${s.business_subdomain}`}>
            <Button size="sm" className="w-full text-xs h-9">View business</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
