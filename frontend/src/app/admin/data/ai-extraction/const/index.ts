import type { LucideIcon } from "lucide-react";
import {
  Globe,
  Sparkles,
  ListOrdered,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import type { PipelineProgress } from "../apis/types";
import type { ExtractionStatus } from "../../all-extractions/apis/types";

// Re-export STATUS_CONFIG and helpers from all-extractions — same data, no duplication.
export {
  STATUS_CONFIG,
  PAUSABLE_STATUSES,
  ACTIVE_STATUSES,
} from "../../all-extractions/const";

export const PIPELINE_STAGES: { key: keyof PipelineProgress; label: string; icon: LucideIcon }[] = [
  { key: "mapping", label: "Site Mapping", icon: Globe },
  { key: "intelligence", label: "Site Intelligence", icon: Sparkles },
  { key: "scraping", label: "Course Discovery", icon: ListOrdered },
  { key: "extracting", label: "Data Extraction", icon: Loader2 },
  { key: "verifying", label: "Verification", icon: CheckCircle2 },
];

// Statuses that mean the job is still "in-progress" for this module.
export const AI_ONGOING_STATUSES: ExtractionStatus[] = [
  "pending", "mapping", "scraping", "extracting", "verifying",
  "review", "failed", "paused", "stalled",
];
