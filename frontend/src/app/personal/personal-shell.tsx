"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Coins, User as UserIcon } from "lucide-react";
// import { AiLauncher } from "@/components/ai-widget/ai-launcher";
import { AlyOrbIcon } from "@/components/aly-orb-icon";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "./store/profile-slice";
import { PortalShell } from "@/components/portal-shell/portal-shell";
import { PortalHeaderLinks } from "@/components/portal-shell/portal-header";
import { PortalLoading } from "@/components/portal-shell/portal-status";
import { NAV_ITEMS, SHOW_HEADER_EXTRAS, SHOW_PERSONAL_PORTAL } from "./const";
import { SIGN_IN_HREF } from "@/app/auth/const";

/** Routes that render edge-to-edge under the header (PortalShell `width="full"`). */
const FULL_BLEED_ROUTES = ["/personal/ai", "/personal/messages"] as const;

export function PersonalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { user } = useAuthState();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isBusinessAccount = profile?.user_category === "business" || profile?.user_category === "institution";
  const myProfileHref = isBusinessAccount ? "/business/profile" : "/personal/profile";

  useEffect(() => {
    if (!profile) dispatch(fetchFullProfile());
  }, []);

  // ponytail: onboarding gate removed for now — an un-onboarded user goes straight to the portal instead of
  // being redirected to /personal/onboarding. The route and its view are untouched and still reachable
  // directly, so restoring the gate is re-adding this effect:
  //
  //   useEffect(() => {
  //     if (!profile || pathname?.startsWith("/personal/onboarding")) return;   // loop guard is required:
  //     if (!profile.onboarding_completed) router.replace("/personal/onboarding");  // onboarding-view pushes
  //   }, [profile, pathname, router]);                                              // to /personal/profile
  //
  // Profile completion still gates enquiries — that is a separate, server-side check and is unaffected.

  // App surfaces, not pages in the content column: they own the whole space under the
  // header and do their own bottom-nav math. Chat belongs here for the same reason the
  // AI counsellor does — a two-pane, non-scrolling shell of its own.
  const isFullBleed = FULL_BLEED_ROUTES.some((route) => pathname?.startsWith(route)) ?? false;

  const handleSignOut = () => {
    dispatch(logout());
    router.push(SIGN_IN_HREF);
  };

  if (mounted && status === "loading" && !profile) return <PortalLoading />;

  return (
    <PortalShell
      title="Personal Portal"
      groups={NAV_ITEMS}
      context={
        <span className="hidden items-center gap-1.5 text-sm font-medium text-foreground md:inline-flex">
          <UserIcon className="h-4 w-4" />
          Personal
        </span>
      }
      headerActions={SHOW_HEADER_EXTRAS && <PortalHeaderLinks notificationsHref="/personal/notifications" creditsHref="/personal/credits" />}
      account={{
        name: mounted ? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") : "",
        email: user?.email,
        photoUrl: mounted ? profile?.photo_url : null,
        isAdmin: !!user?.is_admin,
      }}
      onSignOut={handleSignOut}
      width={isFullBleed ? "full" : "default"}
      // Personal Portal hidden for the short release — only the profile is reachable (from the menu).
      showNav={SHOW_PERSONAL_PORTAL}
      // The header pills are desktop-only, so phones reach them from the More sheet.
      moreLinks={[
        { label: "Ask Aly", icon: AlyOrbIcon, href: "/personal/ai" },
        { label: "Credits", icon: Coins, href: "/personal/credits" },
        { label: "My Profile", icon: UserIcon, href: myProfileHref },
      ]}
    >
      {children}
      {/* Ask Aly floating orb — parked for now. */}
      {/* <AiLauncher /> */}
    </PortalShell>
  );
}
