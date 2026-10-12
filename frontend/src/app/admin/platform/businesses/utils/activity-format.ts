import {
  Activity, BadgeCheck, BookOpen, Building2, CalendarDays, Contact, DollarSign, GraduationCap, Handshake,
  Layers, ListChecks, Mail, Shield, type LucideIcon,
} from "lucide-react";
import type { ActivityLogEntry } from "../apis/types";

const VERBS: Record<string, string> = {
  CREATED: "Added", ADDED: "Added", UPDATED: "Updated", DELETED: "Deleted", REMOVED: "Removed",
  LINKED: "Linked", INVITED: "Invited", RESENT: "Resent", CANCELLED: "Cancelled", SENT: "Sent",
  PUBLISHED: "Published", UNPUBLISHED: "Unpublished", UPLOADED: "Uploaded", APPROVED: "Approved",
};

// Most specific first: SERVICE_FEE must match "fee", not "service".
const AREAS: [string, string, LucideIcon][] = [
  ["SERVICE_FEE", "fee", DollarSign],
  ["SERVICE_INTAKE", "intake", CalendarDays],
  ["SERVICE_ELIGIBILITY", "eligibility requirement", ListChecks],
  ["SERVICE_STUDY_OPTION", "study option", Layers],
  ["SERVICE_STUDY_UNIT", "study unit", BookOpen],
  ["SERVICE_ACCREDITATION", "accreditation", BadgeCheck],
  ["SERVICE_FIELDS", "custom fields", ListChecks],
  ["SERVICE_MEDIA", "service media", BookOpen],
  ["SERVICE", "service", GraduationCap],
  ["BRANCH", "branch", Building2],
  ["CONTACT", "contact", Contact],
  ["PARTNER", "partner", Handshake],
  ["RELATION", "partner", Handshake],
  ["MEMBER", "team member", Mail],
  ["INVITE", "invitation", Mail],
  ["ROLE", "role", Shield],
  ["CLAIM_REQUEST", "claim request", Mail],
];

/** Detail keys that identify the record rather than describe the change. */
const ID_KEYS = new Set(["business_id", "institution_id", "service_id", "service_name", "branch_id", "contact_id", "member_id", "relation_id", "invitation_id", "fields", "name"]);

const humanize = (key: string) => key.replace(/_id$/, "").replaceAll("_", " ");

export type ActivityView = { icon: LucideIcon; title: string; target: string | null; changes: string[] };

/** "INSTITUTION_SERVICE_FEE_UPDATED" + details → "Updated fee" on <course>, changed: amount, currency. */
export function describeActivity(a: ActivityLogEntry): ActivityView {
  const action = a.action.replace(/^(BUSINESS|INSTITUTION)_/, "");
  const status = action.match(/^STATUS_(\w+)$/);
  if (status) return { icon: BadgeCheck, title: `Marked ${status[1]!.toLowerCase()}`, target: null, changes: [] };

  const words = action.split("_");
  const verb = VERBS[words.at(-1) ?? ""];
  const area = AREAS.find(([prefix]) => action.startsWith(prefix));
  const details = a.details ?? {};
  const fields = Array.isArray(details.fields)
    ? (details.fields as string[])
    : action === "UPDATED" ? Object.keys(details).filter((k) => !ID_KEYS.has(k)) : [];

  let title: string;
  if (area && verb) title = `${verb} ${area[1]}`;
  else if (verb) title = `${verb} profile`; // PUBLISHED, UPDATED, DELETED on the org itself
  else title = words.join(" ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

  return {
    icon: area?.[2] ?? (verb ? Building2 : Activity),
    title,
    target: a.target ?? null,
    // Only an update's field list is a change — a create lists every field it was given.
    changes: verb === "Updated" || action.endsWith("FIELDS_UPDATED") ? fields.map(humanize) : [],
  };
}

/** "Today" / "Yesterday" / "Mon, 6 Oct 2026" — the day headers in the list. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
