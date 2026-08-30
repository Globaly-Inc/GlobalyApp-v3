import {
  Home,
  Compass,
  Coins,
  GraduationCap,
  MessageSquare,
  Inbox,
  FolderOpen,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { PortalNavGroup } from "@/components/portal-sidebar";

/** Shared by the desktop rail, its submenu column, and the mobile drawer, so the three can't drift apart. */
// `href` is required here (unlike PortalNavGroup, where it can fall back to the first item), because the
// mobile drawer links every top-level entry directly.
export const NAV_ITEMS: (PortalNavGroup & { href: string })[] = [
  { label: "Home", icon: Home, href: "/personal/portal" },
  { label: "AI Counsellor", icon: Sparkles, href: "/personal/ai" },
  // ponytail: no `?tab=` here — the view defaults to Courses. The rail tile therefore dims once the
  // user switches tab, because isPortalNavActive compares `tab` explicitly (business profile needs
  // that). Fixing the highlight properly means teaching the matcher which paths have tab siblings.
  { label: "Explore", icon: Compass, href: "/personal/explore" },
  {
    label: "Earn",
    icon: Coins,
    href: "/personal/earn",
    items: [
      { label: "My Services", icon: FolderOpen, href: "/personal/earn/services" },
      { label: "Ambassadors", icon: Users, href: "/personal/earn/ambassadors" },
      { label: "Referrals", icon: UserPlus, href: "/personal/earn/referrals" },
    ],
  },
  { label: "Learning", icon: GraduationCap, href: "/personal/learning" },
  { label: "Enquiries", icon: Inbox, href: "/personal/enquiries" },
  { label: "Messages", icon: MessageSquare, href: "/personal/messages" },
];
