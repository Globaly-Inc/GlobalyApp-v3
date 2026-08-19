import { CheckCircle2, AlertCircle, GraduationCap } from "lucide-react";
import { MockupBadge, MockupCard, MockupFrame, MockupProgress } from "./mockup-frame";

const CHECKS = [
  { label: "Academic score (GPA 3.6)", status: "pass" },
  { label: "English proficiency (IELTS 7.0)", status: "pass" },
  { label: "Budget range USD 25K–35K", status: "pass" },
  { label: "Work experience (preferred)", status: "warn" },
] as const;

export function EligibilityCheckerMockup() {
  return (
    <MockupFrame label="globaly.app / eligibility">
      <div className="space-y-4">
        <MockupCard
          className="p-3 flex items-center gap-3 animate-fade-in"
          style={{ animationDelay: "0ms", animationFillMode: "both" }}
        >
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">MSc Computer Science</div>
            <div className="text-xs text-muted-foreground truncate">University of Toronto</div>
          </div>
          <MockupBadge className="bg-emerald-100 text-emerald-700 text-[10px]">92% match</MockupBadge>
        </MockupCard>

        <div className="space-y-1.5 animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Eligibility score</span>
            <span className="font-semibold text-foreground">92%</span>
          </div>
          <MockupProgress value={92} className="h-2" />
        </div>

        <div className="space-y-2">
          {CHECKS.map((c, i) => (
            <div
              key={c.label}
              className="flex items-center gap-2 text-xs animate-fade-in"
              style={{ animationDelay: `${240 + i * 110}ms`, animationFillMode: "both" }}
            >
              {c.status === "pass" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              )}
              <span className="text-foreground">{c.label}</span>
            </div>
          ))}
        </div>
      </div>
    </MockupFrame>
  );
}
