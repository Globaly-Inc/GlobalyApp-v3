"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X, Sparkles, ChevronDown, User as UserIcon, ShieldCheck, LogOut, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ensureBusinessContext } from "@/lib/api/http";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchFullProfile } from "@/app/personal/store/profile-slice";
import type { AuthUser } from "@/app/auth/apis/types";
import { NAV_LINKS } from "../const/index";

/** Where a signed-in user's own profile lives. */
function profileHref(user: AuthUser | null): string {
  if (!user) return "/";
  if (user.type === "admin") return "/admin/overview";
  if (user.user_category === "business" || user.user_category === "institution") return "/business/profile";
  return "/personal/profile";
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { user, initializing } = useAuthState();
  const profile = useAppSelector((state) => state.profile.profile);

  // getMe() returns only email/type/role/user_category — no name or photo — so the avatar needs the profile.
  // Fetched only for a signed-in platform user: an admin has no /platform-users/me row, and a signed-out
  // visitor to the marketing site should never trigger an authenticated request. The thunk already
  // short-circuits while one is in flight, and it populates the same slice the portal reads, so walking from
  // here into /personal costs nothing extra.
  useEffect(() => {
    if (user?.type === "platform_user" && !profile) dispatch(fetchFullProfile());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.type]);

  const handleSignOut = () => {
    dispatch(logout());
    router.push("/auth/sign-in");
  };

  const initial = (profile?.first_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center px-3 sm:px-4 gap-1">
        <Link href="/" className="flex items-center flex-shrink-0">
          <Image src="/globaly-logo.png" alt="Globaly.ai" width={753} height={157} className="h-8 w-auto" priority />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex flex-1 justify-start ml-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-2 text-sm font-medium transition-colors rounded-md",
                pathname === link.href
                  ? "text-primary bg-primary/10"
                  : "text-foreground/70 hover:text-foreground hover:bg-muted",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          <Link
            href="/ai"
            className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 h-8 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            aria-label="Open AI Counsellor"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Counsellor</span>
          </Link>

          {!initializing && (
            user ? (
              // The same profile badge as the portal shell, so signing in doesn't change what the account
              // control looks like between the marketing site and the app. No credits pill here — there is no
              // credits balance in V3 to put in it.
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
                    {profile?.photo_url && <AvatarImage src={profile.photo_url} alt={profile.first_name} />}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(profileHref(user))}>
                    <UserIcon /> My Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Every signed-in user gets the Personal Portal, with no type gate: its shell gates on
                      authentication, not on a category, and an admin is still a person with a profile. This
                      used to require type === "platform_user", which hid it from admins entirely. */}
                  <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal/portal")}>
                    <UserIcon /> Personal Portal
                  </DropdownMenuItem>
                  {/* Business Portal appears whenever the user is a member of at least one business.
                      getMe() returns `businesses` (auth.service.ts getMe -> listUserBusinesses), so the
                      membership is already in hand — the previous comment here claimed `type` was the only
                      populated field, which was stale, and the entry was missing altogether.

                      Entering needs an ORG-SCOPED token, not just a route change: ensureBusinessContext()
                      reads the memberships, picks the user's selected org (or the lowest id), and calls
                      /auth/switch-account. Navigating without it lands on a 403. */}
                  {(user.businesses?.length ?? 0) > 0 && (
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={async () => {
                        if (await ensureBusinessContext()) router.push("/business/portal");
                        else toast.error("Could not open the Business Portal", {
                          description: "Your business membership could not be confirmed. Please sign in again.",
                        });
                      }}
                    >
                      <Building2 /> Business Portal
                    </DropdownMenuItem>
                  )}
                  {user.type === "admin" && (
                    <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/admin/overview")}>
                      <ShieldCheck /> Super Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
                    <LogOut /> Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="hidden h-10 sm:inline-flex text-foreground/70 hover:text-foreground hover:bg-muted"
                  nativeButton={false}
                  render={<Link href="/auth/sign-in" />}
                >
                  Sign In
                </Button>
                <Button
                  className="btn-gold h-10 rounded-full px-5"
                  nativeButton={false}
                  render={<Link href="/auth/sign-up" />}
                >
                  Get Started
                </Button>
              </>
            )
          )}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="h-10 w-10 lg:hidden text-foreground hover:bg-muted" />}
            >
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="right" showCloseButton={false} className="bg-[hsl(var(--navy))] text-white border-white/10 w-72 p-6">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex items-center justify-between mb-6">
                <Link href="/" onClick={() => setMobileOpen(false)}>
                  <Image src="/globaly-logo-white.png" alt="Globaly.ai" width={776} height={188} className="h-7 w-auto" />
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileOpen(false)}
                  className="h-10 w-10 text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="mt-4 flex flex-col gap-2">
                  {!initializing && (
                    user ? (
                      // The drawer replaces the dropdown below lg, so it offers the same destinations rather
                      // than a single "Dashboard" whose target was never well defined.
                      <>
                        {/* One button per destination the user actually has, not an either/or. This was
                            `admin ? "Super Admin" : "Personal Portal"`, which gave an admin no way to reach
                            their own Personal Portal and offered nobody the Business Portal. */}
                        <Button
                          className="btn-gold h-10"
                          nativeButton={false}
                          render={<Link href="/personal/portal" onClick={() => setMobileOpen(false)} />}
                        >
                          Personal Portal
                        </Button>
                        {(user.businesses?.length ?? 0) > 0 && (
                          <Button
                            variant="outline"
                            className="h-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                            onClick={async () => {
                              // Same org-scoped-token requirement as the dropdown: switch first, then navigate.
                              if (await ensureBusinessContext()) {
                                setMobileOpen(false);
                                router.push("/business/portal");
                              } else {
                                toast.error("Could not open the Business Portal", {
                                  description: "Your business membership could not be confirmed. Please sign in again.",
                                });
                              }
                            }}
                          >
                            Business Portal
                          </Button>
                        )}
                        {user.type === "admin" && (
                          <Button
                            variant="outline"
                            className="h-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                            nativeButton={false}
                            render={<Link href="/admin/overview" onClick={() => setMobileOpen(false)} />}
                          >
                            Super Admin
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="h-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                          nativeButton={false}
                          render={<Link href={profileHref(user)} onClick={() => setMobileOpen(false)} />}
                        >
                          My Profile
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          className="h-10 bg-transparent border-white/40 text-white hover:bg-white/10 hover:text-white"
                          nativeButton={false}
                          render={<Link href="/auth/sign-in" onClick={() => setMobileOpen(false)} />}
                        >
                          Sign In
                        </Button>
                        <Button
                          className="btn-gold h-10"
                          nativeButton={false}
                          render={<Link href="/auth/sign-up" onClick={() => setMobileOpen(false)} />}
                        >
                          Get Started
                        </Button>
                      </>
                    )
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
