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
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Second-level nav, rendered as the sidebar's submenu column when this module is the active one. */
  items?: { label: string; icon: LucideIcon; href: string }[];
};

/** Shared by the desktop rail, its submenu column, and the mobile drawer, so the three can't drift apart. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: Home, href: "/personal/portal" },
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

/**
 * Prefix match, not equality: Earn owns sub-routes (/personal/earn/services and its pages), and an equality
 * check would leave the item dark the moment you opened one.
 */
export const isNavActive = (pathname: string | null, href: string) =>
  pathname === href || !!pathname?.startsWith(`${href}/`);
