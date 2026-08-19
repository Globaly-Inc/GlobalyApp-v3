import { MapPin, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { BusinessBranch } from "../../../search/types";

export function BusinessBranchesSection({ branches = [] }: Readonly<{ branches?: BusinessBranch[] }>) {
  if (branches.length === 0) return null;

  return (
    <section className="py-12">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="mb-6">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Where to find us</p>
          <h2 className="text-2xl font-bold text-foreground">Our Locations</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((branch) => {
            const location = [branch.city, branch.state, branch.country].filter(Boolean).join(", ");
            return (
              <div
                key={branch.id}
                className={`bg-card border rounded-2xl p-5 transition-all hover:shadow-md ${
                  branch.is_primary ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
                }`}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground leading-snug">{branch.name}</h3>
                      {branch.is_primary && <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Head Office</Badge>}
                    </div>
                  </div>
                </div>
                {location && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />{location}
                  </p>
                )}
                {branch.address && <p className="text-xs text-muted-foreground mt-1 pl-5">{branch.address}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
