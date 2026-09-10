import {
  Home,
  Compass,
  Coins,
  GraduationCap,
  MessageSquare,
  Inbox,
  FolderOpen,
  UserPlus,
  Users,
} from "lucide-react";
import type { PortalNavGroup } from "@/components/portal-sidebar";
import { AlyOrbIcon } from "@/components/aly-orb-icon";

/**
 * Where the portal opens: every "Personal Portal" switch — the marketing navbar, the admin and business
 * shells, the admin org switcher, the post-join CTA — lands here, as does the bare `/personal` root.
 *
 * It is Ask Aly rather than Socials because the assistant is the portal's front door: the first thing a
 * user wants on arriving is to ask for something, not to read a feed. Keep this a constant rather than the
 * literal repeated across five features — the whole point is that they move together.
 *
 * Note this is the *landing* route only. `NAV_ITEMS` still lists Socials at `/personal/portal`, and the
 * mobile bottom bar still tabs to it; nothing about the nav itself changes.
 */
export const PERSONAL_PORTAL_HOME = "/personal/ai";

/** Shared by the desktop rail, its submenu column, and the mobile drawer, so the three can't drift apart. */
// `href` is required here (unlike PortalNavGroup, where it can fall back to the first item), because the
// mobile drawer links every top-level entry directly.
export const NAV_ITEMS: (PortalNavGroup & { href: string })[] = [
  { label: "Ask Aly", icon: AlyOrbIcon, href: "/personal/ai" },
  { label: "Socials", icon: Home, href: "/personal/portal" },
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
