import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Settings,
  BookOpen,
  TrendingUp,
  LayoutDashboard,
  Building2,
  Users,
  Layers,
  Globe,
  // Settings,
  Database,
  FileCheck,
  Upload,
  Brain,
  Bot,
  Shield,
  // Flag,
  // Inbox,
  GraduationCap,
  // CalendarDays,
  Briefcase,
  // Handshake,
  // FileText,
  BookMarked,
  Coins,
  CreditCard,
  // Megaphone,
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
      // { icon: Settings, label: "Feature flags", href: "/admin/platform/feature-flags" },
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
    ],
  },
  {
    icon: Shield,
    label: "Monitoring",
    items: [
      // { icon: Flag, label: "Moderation", href: "/admin/monitoring/moderation" },
      // { icon: Inbox, label: "Enquiries", href: "/admin/monitoring/enquiries" },
      // { icon: GraduationCap, label: "Training", href: "/admin/monitoring/training" },
      // { icon: CalendarDays, label: "Events", href: "/admin/monitoring/events" },
      // { icon: Briefcase, label: "Jobs", href: "/admin/monitoring/jobs" },
      // { icon: Handshake, label: "Ambassadors", href: "/admin/monitoring/ambassador-programs" },
      { icon: Briefcase, label: "Other Services", href: "/admin/monitoring/other-services" },
      { icon: GraduationCap, label: "Scholarships", href: "/admin/monitoring/scholarships" },
      // { icon: FileText, label: "Logs", href: "/admin/monitoring/monitoring-logs" },
    ],
  },
  {
    icon: BookMarked,
    label: "Marketing",
    items: [
      { icon: BookMarked, label: "Blogs", href: "/admin/marketing/blog" },
      { icon: BookOpen, label: "Guides", href: "/admin/marketing/guides" },
      { icon: TrendingUp, label: "SEO/AEO", href: "/admin/marketing/seo" },
      { icon: Users, label: "Subscribers", href: "/admin/marketing/subscribers" },
      // { icon: Megaphone, label: "Ads", href: "/admin/marketing/ads" },
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
  {
    icon: Settings,
    label: "Settings",
    items: [{ icon: Settings, label: "Integrations", href: "/admin/settings/integrations" }],
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
