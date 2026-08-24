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
  LogOut,
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
import { logout } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "./store/profile-slice";
import { PortalSidebar } from "@/components/portal-sidebar";
import { NAV_ITEMS } from "./const";
import { PersonalMobileNav } from "./components/personal-mobile-nav";

/**
 * One width for the page body, centred in the space left of the sidebar so the dashboard stops
 * stretching across ultrawide displays.
 *
 * 1280px matches the app's `.container` cap, but the padding is set here rather than inherited from it —
 * `.container` hardcodes `padding-inline: 2rem`, which is too much on a phone and would fight these classes.
 */
const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

export function PersonalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.profile);
  // Next's router cache can rehydrate a previously-rendered page's HTML (e.g. after a back/forward
  // navigation) against a client Redux store that has since moved on — `status`/`profile` in that cached
  // HTML can genuinely disagree with the live store, causing a real hydration mismatch. Gate on `mounted`
  // so the very first client render always matches whatever HTML is being hydrated against, then swap to
  // the live values once mounted.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A personal-only account has nowhere to go from here but onboarding — pointing this at
  // "/personal/portal" (the page this shell already renders) was a dead link.
  const portalTarget = !mounted
    ? null
    : profile?.user_category === "business"
      ? { label: "Business Portal", icon: Building2, href: "/business/profile" }
      : { label: "Switch to Business", icon: Building2, href: "/business/onboarding" };

  useEffect(() => {
    if (!profile) dispatch(fetchFullProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const isFullBleed = pathname?.startsWith("/personal/ai") ?? false;

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
  // Same reasoning as the `mounted`-gated loading branch above: anything derived from `profile` must
  // fall back to the profile-less shape until mounted, or it can disagree with cached/hydrated HTML.
  const initial = mounted ? profile?.first_name?.[0]?.toUpperCase() ?? "U" : "U";
  const avatarPhotoUrl = mounted ? profile?.photo_url : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Full-width bar above the sidebar, as in GlobalyOS: the mark sits over the rail, and the sidebar
          starts below the bar. Navigation lives in the sidebar, so this keeps only the utility cluster. */}
      <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex h-16 items-center">
          {/* The logo box is exactly the rail's width (w-20), so the divider that follows it lands on the
              same axis as the rail's right border below. Below `md` there is no rail, so it reverts to
              plain page padding and no divider. */}
          <div className="flex h-16 shrink-0 items-center px-3 sm:px-4 md:w-20 md:justify-center md:px-0">
            {/* The square mark, not the wordmark: it reads at 36px where "Globaly.app" would either dominate
                the row or shrink past legibility. */}
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
          {/* ~60% of the bar's height rather than a full-height rule: it marks the rail's edge without
              reading as a second border stacked on the header's own. */}
          <span className="hidden md:block h-10 w-px shrink-0 bg-border" aria-hidden />
          {/* The rail is icons only, so the portal-context label lives here — plain, not a pill, so it
              doesn't read as a selected nav item. */}
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
              {/* No unread badge: the notifications table and its count endpoint were removed in review. */}
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
              {/* Bordered, with a chevron: without them the bare avatar gave no affordance that it opens a
                  menu, and it sat flush against the credits pill with no visual boundary. */}
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
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal/profile")}>
                  <UserIcon /> My Profile
                </DropdownMenuItem>
                {portalTarget && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(portalTarget.href)}>
                      <portalTarget.icon /> {portalTarget.label}
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
                  <LogOut /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <PortalSidebar groups={NAV_ITEMS} />

        {/* overflow-x-clip lets a page render a full-bleed band without the 100vw box adding the scrollbar's
            width to the page as horizontal scroll. `clip` rather than `hidden`: it creates no scroll
            container, so sticky and anchored elements inside still behave. */}
        <main
          className={cn(
            "min-w-0 flex-1 overflow-x-clip",
            // The AI counsellor is a full-bleed app surface, not a page in the portal's content
            // column — it owns the whole space under the header and does its own bottom-nav math.
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
