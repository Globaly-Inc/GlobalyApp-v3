import { Award, Building2, BadgeCheck } from "lucide-react";
import type { BusinessRepresentation } from "../../../search/types";

export function BusinessRepresentationsSection({ representations = [] }: Readonly<{ representations?: BusinessRepresentation[] }>) {
  if (representations.length === 0) return null;

  return (
    <section className="py-12">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="mb-6">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">Trusted partnerships</p>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />Authorized Representative For
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {representations.map((rep) => (
            <div
              key={rep.id}
              className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-11 h-11 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                {rep.partner_business_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={rep.partner_business_logo_url} alt={rep.partner_business_name} className="w-full h-full object-contain p-1" />
                ) : (
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{rep.partner_business_name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <BadgeCheck className="h-3 w-3 text-primary" />Verified partner
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
