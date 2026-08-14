import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  LayoutDashboard,
  Building2,
  Users,
  Layers,
  Globe,
  Settings,
  Database,
  FileCheck,
  Upload,
  Sparkles,
  Brain,
  Bot,
  Shield,
  Flag,
  Inbox,
  GraduationCap,
  CalendarDays,
  Briefcase,
  Handshake,
  FileText,
  BookMarked,
  Coins,
  CreditCard,
  Megaphone,
} from "lucide-react";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface AdminNavGroup {
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    icon: BarChart3,
    label: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard", href: "/admin/overview" }],
  },
  {
    icon: Building2,
    label: "Platform",
    items: [
      { icon: Building2, label: "Businesses", href: "/admin/platform/businesses" },
      { icon: Users, label: "Users", href: "/admin/platform/users" },
      { icon: Layers, label: "Categories", href: "/admin/platform/categories" },
      { icon: Globe, label: "Countries", href: "/admin/platform/countries" },
      { icon: Settings, label: "Feature flags", href: "/admin/platform/feature-flags" },
    ],
  },
  {
    icon: Database,
    label: "Data",
    items: [
      { icon: FileCheck, label: "All Extractions", href: "/admin/data/all-extractions" },
      { icon: Upload, label: "AgentCIS Import", href: "/admin/data/agentcis-import" },
      { icon: Brain, label: "AI Memory", href: "/admin/data/ai-memory" },
      { icon: Bot, label: "AI Knowledge", href: "/admin/data/ai-knowledge" },
      { icon: Sparkles, label: "Visas", href: "/admin/data/visas" },
      { icon: Sparkles, label: "MARA Agents", href: "/admin/data/mara-agents" },
    ],
  },
  {
    icon: Shield,
    label: "Monitoring",
    items: [
      { icon: Flag, label: "Moderation", href: "/admin/monitoring/moderation" },
      { icon: Inbox, label: "Enquiries", href: "/admin/monitoring/enquiries" },
      { icon: GraduationCap, label: "Training", href: "/admin/monitoring/training" },
      { icon: CalendarDays, label: "Events", href: "/admin/monitoring/events" },
      { icon: Briefcase, label: "Jobs", href: "/admin/monitoring/jobs" },
      { icon: Handshake, label: "Ambassadors", href: "/admin/monitoring/ambassador-programs" },
      { icon: GraduationCap, label: "Scholarships", href: "/admin/monitoring/scholarships" },
      { icon: FileText, label: "Logs", href: "/admin/monitoring/monitoring-logs" },
    ],
  },
  {
    icon: BookMarked,
    label: "Marketing",
    items: [
      { icon: BookMarked, label: "Blog", href: "/admin/marketing/blog" },
      { icon: Megaphone, label: "Ads", href: "/admin/marketing/ads" },
    ],
  },
  {
    icon: Coins,
    label: "Revenue",
    items: [
      { icon: CreditCard, label: "Credits", href: "/admin/revenue/subscriptions/credits" },
      { icon: CreditCard, label: "Subscriptions", href: "/admin/revenue/subscriptions" },
    ],
  },
];

export function getVisibleNavGroups(role: string | null | undefined): AdminNavGroup[] {
  if (role === "data_admin") return ADMIN_NAV_GROUPS.filter((g) => g.label === "Data");
  return ADMIN_NAV_GROUPS;
}

/** Exact match, otherwise prefix match (query strings stripped first). */
export function isNavPathActive(pathname: string, href: string): boolean {
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function findActiveGroup(pathname: string): AdminNavGroup | undefined {
  return ADMIN_NAV_GROUPS.find((group) => group.items.some((item) => isNavPathActive(pathname, item.href)));
}
