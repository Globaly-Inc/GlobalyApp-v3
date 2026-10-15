import { Database, FileSpreadsheet, Globe, PenLine, Plane, UserPlus, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Where a job's data came from — every row says so, not just spreadsheet imports. Labels match the
// list's Source filter. A crawl has no special source_type (null / "institution" is the default).
const SOURCES: Record<string, { label: string; icon: LucideIcon; variant: "info" | "secondary" }> = {
  spreadsheet: { label: "Spreadsheet", icon: FileSpreadsheet, variant: "info" },
  agentcis: { label: "AgentCIS", icon: Database, variant: "secondary" },
  manual: { label: "Manual", icon: PenLine, variant: "secondary" },
  self_service: { label: "Self-registered", icon: UserPlus, variant: "secondary" },
  // The owner ran the extraction themselves from the business portal (no admin approval step).
  institution_self_service: { label: "Self-service", icon: UserPlus, variant: "secondary" },
  business_self_service: { label: "Self-service", icon: UserPlus, variant: "secondary" },
  visa_service: { label: "Visa", icon: Plane, variant: "secondary" },
};
const WEBSITE = { label: "Website", icon: Globe, variant: "secondary" as const };

export function SourceBadge({ sourceType }: Readonly<{ sourceType?: string | null }>) {
  const source = (sourceType && SOURCES[sourceType]) || WEBSITE;
  return (
    <Badge variant={source.variant}>
      <source.icon /> {source.label}
    </Badge>
  );
}
