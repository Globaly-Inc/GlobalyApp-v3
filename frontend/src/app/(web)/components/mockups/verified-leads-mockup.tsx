import { MockupFrame } from "./mockup-frame";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, GraduationCap, Globe2, Sparkles } from "lucide-react";

const LEADS = [
  { name: "Aanya S.", course: "MSc Computer Science", country: "🇨🇦 Canada", score: 96 },
  { name: "Diego R.", course: "MBA · Finance", country: "🇬🇧 UK", score: 91 },
  { name: "Mei L.", course: "BSc Data Science", country: "🇦🇺 Australia", score: 88 },
];

/** Verified lead quality mockup — shows a course-matched lead with eligibility badges and match score. */
export function VerifiedLeadsMockup() {
  return (
    <MockupFrame label="business portal / verified leads">
      <div className="space-y-3">
        <div className="flex items-center justify-between animate-fade-in" style={{ animationDelay: "0ms", animationFillMode: "both" }}>
          <h3 className="text-sm font-semibold text-foreground">Course-matched leads</h3>
          <Badge variant="secondary" className="gap-1 text-[10px]">
            <Sparkles className="h-3 w-3 text-primary" /> Eligibility verified
          </Badge>
        </div>

        {LEADS.map((lead, i) => (
          <Card key={lead.name} className="p-3 animate-fade-in" style={{ animationDelay: `${150 + i * 150}ms`, animationFillMode: "both" }}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{lead.name}</p>
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" />{lead.course}</span>
                  <span className="flex items-center gap-1"><Globe2 className="h-3 w-3" />{lead.country}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold text-primary leading-none">{lead.score}%</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">match</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </MockupFrame>
  );
}
