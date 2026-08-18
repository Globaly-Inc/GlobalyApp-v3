"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Compass,
  Coins,
  GraduationCap,
  Bell,
  Heart,
  MessageSquare,
  Sparkles,
  Menu as MenuIcon,
  ChevronDown,
  User as UserIcon,
  Building2,
  LogOut,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AiLauncher } from "@/components/ai-widget/ai-launcher";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "./store/profile-slice";

/**
 * One width for the whole portal: the bar and the page body share it so the logo lines up with the content
 * instead of hugging the screen edge, and the dashboard stops stretching across ultrawide displays.
 *
 * 1280px matches the app's `.container` cap, but the padding is set here rather than inherited from it —
 * `.container` hardcodes `padding-inline: 2rem`, which is too much on a phone and would fight these classes.
 */
const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

const NAV_ITEMS = [
  { label: "Home", icon: Home, href: "/personal/portal" },
  { label: "Explore", icon: Compass, href: "/personal/explore" },
  { label: "Earn", icon: Coins, href: "/personal/earn" },
  { label: "Learning", icon: GraduationCap, href: "/personal/learning" },
];

export function PersonalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const portalTarget =
    profile?.user_category === "business"
      ? { label: "Business Portal", icon: Building2, href: "/business/profile" }
      : profile?.user_category === "personal"
        ? { label: "Personal Portal", icon: UserIcon, href: "/personal/portal" }
        : null;

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

  const handleSignOut = () => {
    dispatch(logout());
    router.push("/auth/sign-in");
  };

  if (status === "loading" && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  const initial = profile?.first_name?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* The bar spans the viewport (so the border does too) but its contents sit in the same centred
          container as the page body — otherwise the logo hugs the screen edge while the content is inset. */}
      <header className="h-16 border-b border-border bg-background">
        <div className={cn(SHELL_WIDTH, "flex h-16 items-center justify-between")}>
        <div className="flex items-center gap-3">
          {/* The square mark, not the wordmark: the portal header is dense and the icon reads at 36px where
              "Globaly.app" would either dominate the row or shrink past legibility. */}
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
          {/* Plain label, not a pill — the pill competed with the active nav item, which is the only thing in
              this row that should read as selected. */}
          <span className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
            <UserIcon className="h-4 w-4" />
            Personal
          </span>
          <span className="hidden sm:block h-6 w-px shrink-0 bg-border" aria-hidden />
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              // Prefix match, not equality: Earn owns sub-routes (/personal/earn/services and its pages), and
              // an equality check would leave the top-level item dark the moment you opened the module.
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/personal/notifications"
            className="hidden md:inline-flex relative items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
            {/* No unread badge: the notifications table and its count endpoint were removed in review. */}
            <Bell className="h-4.5 w-4.5" />
          </Link>
          <Link
            href="/personal/messages"
            className="hidden md:inline-flex relative items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Messages"
          >
            <MessageSquare className="h-4.5 w-4.5" />
            <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-destructive" />
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
                {profile?.photo_url && <AvatarImage src={profile.photo_url} alt={profile.first_name} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal/profile")}>
                <UserIcon /> My Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal/favorites")}>
                <Heart /> Saved Items
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

      {/* overflow-x-clip lets a page render a full-bleed band (the Earn sub-nav's rule) without the 100vw
          box adding the scrollbar's width to the page as horizontal scroll. `clip` rather than `hidden`:
          it creates no scroll container, so sticky and anchored elements inside still behave. */}
      <main className="flex-1 overflow-x-clip py-4 md:py-6 pb-24 md:pb-6">
        <div className={SHELL_WIDTH}>{children}</div>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-background py-2 pb-[env(safe-area-inset-bottom)] md:hidden">
        <Link
          href="/personal/portal"
          className={cn(
            "flex flex-col items-center gap-0.5 px-4 py-1 text-xs",
            pathname === "/personal/portal" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Home className="h-5 w-5" />
          Home
        </Link>
        <Link
          href="/personal/notifications"
          className={cn(
            "relative flex flex-col items-center gap-0.5 px-4 py-1 text-xs",
            pathname === "/personal/notifications" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Bell className="h-5 w-5" />
          Alerts
        </Link>
        <Link
          href="/personal/profile"
          className={cn(
            "flex flex-col items-center gap-0.5 px-4 py-1 text-xs",
            pathname === "/personal/profile" ? "text-primary" : "text-muted-foreground",
          )}
        >
          <UserIcon className="h-5 w-5" />
          My Profile
        </Link>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex flex-col items-center gap-0.5 px-4 py-1 text-xs text-muted-foreground cursor-pointer"
        >
          <MenuIcon className="h-5 w-5" />
          Menu
        </button>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>Personal Portal</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </Link>
            ))}
            <div className="my-1 h-px bg-border" />
            <Link
              href="/personal/profile"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <UserIcon className="h-4 w-4" /> My Profile
            </Link>
            {portalTarget && (
              <Link
                href={portalTarget.href}
                onClick={() => setDrawerOpen(false)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
              >
                <portalTarget.icon className="h-4 w-4" /> {portalTarget.label}
              </Link>
            )}
          </nav>
          <div className="mt-auto p-2">
            <Button variant="outline" className="w-full justify-start gap-2" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign Out
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      <AiLauncher />
    </div>
  );
}
