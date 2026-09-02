import Link from "next/link";
import { Award, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Money } from "../../components/money";
import { BASIS_LABEL, type SearchScholarship } from "../types";

export function ScholarshipSearchCard({ scholarship: s }: Readonly<{ scholarship: SearchScholarship }>) {
  const location = [s.city, s.country].filter(Boolean).join(", ");
  const award = s.coverage_amount != null
    ? <Money amount={s.coverage_amount} currency={s.coverage_currency} />
    : s.coverage_type.replace(/_/g, " ");

  return (
    <div className="bg-card border border-border rounded-xl hover:shadow-md transition-shadow overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 min-w-0 flex items-start gap-3 py-3.5 px-4">
          <div className="w-12 h-12 rounded-lg border border-border bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Award className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground leading-snug text-[15px] line-clamp-1">{s.title}</h3>
              {s.is_featured && (
                <Badge className="gap-1 shrink-0 bg-amber-500/15 text-amber-600 hover:bg-amber-500/15">
                  <Star className="h-3 w-3 fill-current" /> Featured
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {s.provider_name}{s.provider_name && location ? " · " : ""}{location}
            </p>
            {s.basis && <p className="text-xs font-medium text-primary/90 truncate">{BASIS_LABEL[s.basis] ?? s.basis}</p>}
          </div>
        </div>

        <div className="w-full sm:w-44 sm:flex-shrink-0 border-t sm:border-t-0 sm:border-l border-border bg-muted/30 px-4 py-3 flex flex-col justify-center gap-2">
          <p className="text-sm font-bold text-primary leading-tight whitespace-nowrap capitalize">{award}</p>
          {s.deadline && <p className="text-xs text-muted-foreground">Deadline {new Date(s.deadline).toLocaleDateString()}</p>}
          <Link href={`/scholarships/${s.slug}`}>
            <Button size="sm" className="w-full text-xs h-9">View & Apply</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
