import { FileText } from "lucide-react";
import { SectionCard } from "./section-card";

export function CourseDescription({ description }: Readonly<{ description: string | null }>) {
  return (
    <SectionCard icon={FileText} title="Description">
      {description ? (
        <p className="text-sm text-muted-foreground whitespace-pre-line">{description}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">No description available.</p>
      )}
    </SectionCard>
  );
}
