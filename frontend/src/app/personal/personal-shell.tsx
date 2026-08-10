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
  MessageSquare,
  Sparkles,
  Menu as MenuIcon,
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
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "./store/profile-slice";

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
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center">
            <Image src="/globaly-logo.png" alt="Globaly" width={753} height={157} className="h-7 w-auto" />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" />
            Personal
          </span>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
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
            className="hidden md:inline-flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Notifications"
          >
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
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted cursor-pointer" type="button" />
              }
            >
              <Avatar className="size-8">
                {profile?.photo_url && <AvatarImage src={profile.photo_url} alt={profile.first_name} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
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
      </header>

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-6">{children}</main>

      <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-background py-2 pb-[env(safe-area-inset-bottom)] md:hidden">
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
    </div>
  );
}
