import Link from "next/link";
import { GraduationCap, MapPin, Calendar, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicScholarship } from "../types";

export function ScholarshipCard({ scholarship: s }: Readonly<{ scholarship: PublicScholarship }>) {
  return (
    <Link
      href={`/scholarships/${s.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-card p-5 hover:shadow-lg transition-all duration-200"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <GraduationCap className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
            {s.title}
          </h2>
          {s.provider_name && <p className="text-sm text-muted-foreground mt-0.5">{s.provider_name}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-sm text-muted-foreground">
        {s.country && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {s.city ? `${s.city}, ${s.country}` : s.country}
          </span>
        )}
        {s.deadline && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            Deadline {new Date(s.deadline).toLocaleDateString()}
          </span>
        )}
        {s.coverage_amount && (
          <span className="flex items-center gap-1">
            <Award className="h-3.5 w-3.5" />
            {s.coverage_currency} {Number(s.coverage_amount).toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {s.basis && <Badge variant="outline" className="capitalize">{s.basis}</Badge>}
        <Badge variant="secondary" className="capitalize">{s.coverage_type.replace(/_/g, " ")}</Badge>
        {s.degree_levels.slice(0, 3).map((d) => (
          <Badge key={d} variant="outline" className="capitalize">{d.replace(/_/g, " ")}</Badge>
        ))}
      </div>
    </Link>
  );
}
