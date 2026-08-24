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

const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

export function PersonalShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.profile);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const portalTarget = !mounted
    ? null
    : profile?.user_category === "business"
      ? { label: "Business Portal", icon: Building2, href: "/business/profile" }
      : { label: "Switch to Business", icon: Building2, href: "/business/onboarding" };

  useEffect(() => {
    if (!profile) dispatch(fetchFullProfile());
  }, []);

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
