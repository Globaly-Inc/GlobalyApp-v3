import Link from "next/link";
import { Building2, Globe, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { InstitutionDetail } from "../../../search/types";

export function InstitutionHero({ institution }: Readonly<{ institution: InstitutionDetail }>) {
  const location = [institution.city, institution.country_name].filter(Boolean).join(", ");

  return (
    <section className="bg-linear-to-br from-primary/5 via-background to-primary/10 border-b border-border">
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <p className="text-xs text-muted-foreground mb-4">
          <Link href="/" className="hover:text-primary">Home</Link> /{" "}
          <Link href="/search?tab=institutions" className="hover:text-primary">Institutions</Link> / {institution.business_name}
        </p>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-xl border border-border bg-card shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
              {institution.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={institution.logo_url} alt={institution.business_name} className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="h-7 w-7 text-primary" />
              )}
            </div>
            <div>
              <Badge className="mb-2 bg-primary/10 text-primary border-primary/20 gap-1">
                <Building2 className="h-3 w-3" />Institution
              </Badge>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{institution.business_name}</h1>
              {location && (
                <p className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                  <MapPin className="h-3.5 w-3.5" />{location}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {institution.website && (
              <a href={institution.website} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Globe className="h-3.5 w-3.5" />Website
                </Button>
              </a>
            )}
            <Link href="/auth/sign-up?redirect=/search">
              <Button size="sm">Contact</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
