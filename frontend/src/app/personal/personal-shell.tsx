"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Coins,
  Bell,
  Sparkles,
  ChevronDown,
  User as UserIcon,
  Building2,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AiLauncher } from "@/components/ai-widget/ai-launcher";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "./store/profile-slice";
import { PortalSidebar } from "@/components/portal-sidebar";
import { NAV_ITEMS } from "./const";
import { PersonalMobileNav } from "./components/personal-mobile-nav";

const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

/** Routes that render edge-to-edge under the header instead of inside SHELL_WIDTH. */
const FULL_BLEED_ROUTES = ["/personal/ai", "/personal/messages"] as const;

export function PersonalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { user } = useAuthState();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const portalTarget = !mounted
    ? null
    : profile?.user_category === "business" || profile?.user_category === "institution"
      ? { label: "Business Portal", icon: Building2, href: "/business/profile" }
      : { label: "Switch to Business", icon: Building2, href: "/business/onboarding" };

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
    router.push("/auth/sign-in");
  };

  if (mounted && status === "loading" && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  const initial = mounted ? profile?.first_name?.[0]?.toUpperCase() ?? "U" : "U";
  const avatarPhotoUrl = mounted ? profile?.photo_url : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center">
          <div className="flex h-16 shrink-0 items-center px-3 sm:px-4 md:w-20 md:justify-center md:px-0">
            <Link href="/" className="flex shrink-0 items-center">
              <Image
                src="/globaly-red-icon.png"
                alt="Globaly"
                width={283}
                height={283}
                className="size-9 rounded-[10px]"
                priority
              />
            </Link>
          </div>
          <span className="hidden md:block h-10 w-px shrink-0 bg-border" aria-hidden />
          <span className="hidden md:inline-flex items-center gap-1.5 pl-4 text-sm font-medium text-foreground">
            <UserIcon className="h-4 w-4" />
            Personal
          </span>

          <div className="flex items-center gap-2 ml-auto pr-3 sm:pr-4 md:pr-6">
            <Link
              href="/personal/notifications"
              className="hidden md:inline-flex relative items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
            </Link>
            <Link
              href="/personal/ai"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 h-8 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Counsellor
            </Link>
            <Link
              href="/personal/credits"
              className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 h-8 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Coins className="h-3.5 w-3.5" />
              Credits
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2 hover:bg-muted cursor-pointer"
                    type="button"
                    aria-label="Account menu"
                  />
                }
              >
                <Avatar className="size-7">
                  {avatarPhotoUrl && <AvatarImage src={avatarPhotoUrl} alt={profile?.first_name} />}
                  <AvatarFallback>{initial}</AvatarFallback>
                </Avatar>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuItem className="cursor-pointer px-2 py-2" onClick={() => router.push("/personal/profile")}>
                  My Profile
                </DropdownMenuItem>
                {/* {portalTarget && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer px-3 py-2.5" onClick={() => router.push(portalTarget.href)}>
                      {portalTarget.label}
                    </DropdownMenuItem>
                  </>
                )} */}
                <DropdownMenuItem className="cursor-pointer px-3 py-2.5" onClick={() => router.push("/personal/portal")}>
                  Personal Portal
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer px-3 py-2.5" onClick={() => router.push("/business/portal")}>
                  Business Portal
                </DropdownMenuItem>
                {user?.is_admin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer px-3 py-2.5" onClick={() => router.push("/admin/overview")}>
                      Super Admin
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer px-3 py-2.5" variant="destructive" onClick={handleSignOut}>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <PortalSidebar groups={NAV_ITEMS} />
        <main
          className={cn(
            "min-w-0 flex-1 overflow-x-clip",
            isFullBleed ? "" : "py-4 md:py-6 pb-24 md:pb-6",
          )}
        >
          {isFullBleed ? children : <div className={SHELL_WIDTH}>{children}</div>}
        </main>
      </div>

      <PersonalMobileNav portalTarget={portalTarget} onSignOut={handleSignOut} />
      <AiLauncher />
    </div>
  );
}
