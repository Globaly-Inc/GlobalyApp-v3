"use client";

import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "./section-card";
import { DEGREE_LABEL, type CourseDetail } from "../../../search/types";

const TEST_ICON: Record<string, string> = { IELTS: "🎓", TOEFL: "📝", PTE: "💻" };

export function CourseEntryRequirementsCard({
  eligibility, englishRequirements,
}: Readonly<{ eligibility: CourseDetail["eligibility"]; englishRequirements: CourseDetail["englishRequirements"] }>) {
  const applicableOptions = useMemo(
    () => [...new Set(eligibility.map((e) => e.applicable_to))],
    [eligibility],
  );
  const [active, setActive] = useState(applicableOptions[0] ?? "international");
  const requirement = eligibility.find((e) => e.applicable_to === active) ?? eligibility[0];

  if (eligibility.length === 0 && englishRequirements.length === 0) {
    return (
      <SectionCard icon={ShieldCheck} title="Entry Requirements">
        <p className="text-sm text-muted-foreground italic">No entry requirements listed yet.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard icon={ShieldCheck} title="Entry Requirements">
      {applicableOptions.length > 1 && (
        <div className="flex rounded-md border border-border p-0.5 mb-4 text-sm">
          {applicableOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setActive(option)}
              className={`flex-1 rounded px-3 py-1.5 capitalize transition-colors ${
                active === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {requirement && (
        <div className="mb-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Academic</p>
          <p className="text-sm text-foreground">
            Min. degree: <span className="font-medium">{DEGREE_LABEL[requirement.min_degree_level ?? ""] ?? requirement.min_degree_level ?? "Not set"}</span>
          </p>
          {requirement.min_score_percent && (
            <p className="text-sm text-muted-foreground mt-0.5">Min. score: {requirement.min_score_percent}%</p>
          )}
        </div>
      )}

      {englishRequirements.length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Language Tests</p>
          <div className="flex flex-wrap gap-2">
            {englishRequirements.map((req) => (
              <Badge key={req.id} variant="outline" className="gap-1">
                <span>{TEST_ICON[req.test_type_name ?? ""] ?? "🌐"}</span>
                {req.test_type_name}{req.overall_score ? ` ${req.overall_score}` : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
