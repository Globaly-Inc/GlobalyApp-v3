import Link from "next/link";
import { Building2, GraduationCap, MapPin } from "lucide-react";
import type { SearchBusiness } from "../types";

export function InstitutionCard({ institution }: Readonly<{ institution: SearchBusiness }>) {
  const location = [institution.city, institution.country_name].filter(Boolean).join(", ");
  const courseCount = institution.course_count ?? 0;

  return (
    <div className="group relative bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/40 transition-all overflow-hidden">
      {institution.slug && (
        <Link href={`/institution/${institution.slug}`} className="absolute inset-0 z-0" aria-label={institution.business_name} />
      )}
      <div className="flex flex-col sm:flex-row pointer-events-none">
        <div className="flex-1 min-w-0 p-4">
          <div className="flex gap-3">
            <div className="w-14 h-14 rounded-lg border border-border bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
              {institution.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={institution.logo_url} alt={institution.business_name} className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors leading-snug text-[15px] line-clamp-2">
                {institution.business_name}
              </h3>
              {location && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {location}
                </p>
              )}
            </div>
          </div>

          {institution.description && (
            <p className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground truncate">{institution.description}</p>
          )}
        </div>

        {courseCount > 0 && (
          <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 p-5 flex sm:flex-col justify-center">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-xs text-foreground">
                <span className="font-semibold">{courseCount}</span>{" "}
                <span className="text-muted-foreground">Course{courseCount === 1 ? "" : "s"}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
