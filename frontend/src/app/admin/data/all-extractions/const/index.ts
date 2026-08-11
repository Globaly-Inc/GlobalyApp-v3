import type { LucideIcon } from "lucide-react";
import {
  Clock,
  ListOrdered,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  Pause,
} from "lucide-react";
import type { ExtractionStatus } from "../apis/types";

export type StatusConfig = { label: string; icon: LucideIcon; className: string; spin?: boolean };

// Ported from V2's ExtractionDashboard.tsx statusConfig — one entry per real status value.
export const STATUS_CONFIG: Record<ExtractionStatus, StatusConfig> = {
  pending: { label: "Pending", icon: Clock, className: "bg-muted text-muted-foreground" },
  mapping: { label: "Mapping", icon: ListOrdered, className: "bg-blue-100 text-blue-700" },
  scraping: { label: "Scraping", icon: Loader2, className: "bg-amber-100 text-amber-700", spin: true },
  extracting: { label: "Extracting", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true },
  processing: { label: "Processing", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true },
  verifying: { label: "Verifying", icon: Loader2, className: "bg-purple-100 text-purple-700", spin: true },
  review: { label: "Pending Review", icon: AlertCircle, className: "bg-orange-100 text-orange-700" },
  verified: { label: "Approved", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  approved: { label: "Approved", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  done: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  exported: { label: "Published", icon: ShieldCheck, className: "bg-green-100 text-green-800" },
  pushed: { label: "Published", icon: ShieldCheck, className: "bg-green-100 text-green-800" },
  declined: { label: "Declined", icon: XCircle, className: "bg-red-100 text-red-700" },
  failed: { label: "Failed", icon: AlertCircle, className: "bg-red-100 text-red-700" },
  stalled: { label: "Stalled", icon: AlertCircle, className: "bg-red-100 text-red-700" },
  paused: { label: "Paused", icon: Pause, className: "bg-gray-100 text-gray-600" },
};

export const ACTIVE_STATUSES: ExtractionStatus[] = ["mapping", "scraping", "extracting", "processing", "verifying"];
export const PUBLISHABLE_STATUSES: ExtractionStatus[] = ["review", "verified", "done", "approved"];
export const PAUSABLE_STATUSES: ExtractionStatus[] = ["scraping", "extracting"];
export const FINISHED_STATUSES: ExtractionStatus[] = ["done", "completed", "approved", "verified", "exported", "pushed"];

export const SOURCE_TYPE_OPTIONS = [
  { value: "institution", label: "Institution Website" },
];

export type SortOrder = "newest" | "oldest" | "name_asc" | "name_desc";

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name A → Z" },
  { value: "name_desc", label: "Name Z → A" },
];
