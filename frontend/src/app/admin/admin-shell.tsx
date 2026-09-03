"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout, useAuthState } from "@/app/auth/store/auth-slice";
import { fetchMe } from "./store/admin-slice";
import { ROLE_DISPLAY } from "./consts";
import { getVisibleNavGroups, isNavPathActive } from "./nav-config";
import { AdminMobileNav } from "./components/admin-mobile-nav";
import { AdminPortalSwitcher } from "./components/admin-portal-switcher";
import { PortalSidebar } from "@/components/portal-sidebar";

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { me, status, error } = useAppSelector((state) => state.admin);
  const { user: authUser, initializing } = useAuthState();
  const isAdmin = authUser?.is_admin === true;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!initializing && !isAdmin) {
      router.replace("/");
    }
  }, [initializing, isAdmin, router]);

  const fetchedMeRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || fetchedMeRef.current) return;
    fetchedMeRef.current = true;
    dispatch(fetchMe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);
  useEffect(() => {
    if (!isAdmin || authUser?.role !== "data_admin") return;
    if (!isNavPathActive(pathname, "/admin/overview")) return;
    const firstVisibleHref = getVisibleNavGroups(authUser.role)[0]?.items[0]?.href;
    if (firstVisibleHref) router.replace(firstVisibleHref);
  }, [isAdmin, authUser?.role, pathname, router]);

  const handleSignOut = () => {
    dispatch(logout());
    router.push("/auth/sign-in");
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  if (mounted && status === "failed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <p className="text-sm text-muted-foreground">
          {error ?? "Failed to load admin profile."}
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Sign out
        </button>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = me.email?.charAt(0).toUpperCase() ?? "A";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Full-width bar above the rail, matching the personal and business portals: the mark sits over the
          rail (hence the w-20 box), navigation lives in the sidebar, and this keeps identity only. */}
      <header className="sticky top-0 z-50 h-16 w-full border-b border-border bg-card/95 backdrop-blur-md supports-backdrop-filter:bg-card/60 flex items-center justify-between pr-4 md:pr-6">
        <div className="flex items-center min-w-0">
          <div className="flex h-16 shrink-0 items-center px-4 md:w-20 md:justify-center md:px-0">
            <Link href="/" className="flex items-center shrink-0">
              <Image src="/globaly-red-icon.png" alt="Globaly" width={283} height={283} className="size-9 rounded-[10px]" />
            </Link>
          </div>
          {/* ~60% of the bar's height: it marks the rail's edge without reading as a second border. */}
          <span className="hidden md:block h-10 w-px shrink-0 bg-border" aria-hidden />
          <div className="ml-3 md:ml-4 shrink-0">
            <AdminPortalSwitcher
              roleLabel={ROLE_DISPLAY[me.role]}
              isSuperAdmin={me.role === "super_admin"}
              businesses={authUser.businesses}
              institutions={authUser.institutions}
              activeOrgId={authUser.orgId}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <AdminMobileNav />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-border px-1.5 py-1 text-foreground hover:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
                />
              }
            >
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center overflow-hidden shrink-0",
                  me.photo_url ? "bg-transparent" : "bg-primary",
                )}
              >
                {me.photo_url ? (
                  <img src={me.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="text-primary-foreground text-xs font-semibold">{initial}</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-md">
              <DropdownMenuItem
                className="cursor-pointer px-1.5 py-1.5 flex items-center gap-2"
                onClick={() => router.push("/admin/profile")}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center overflow-hidden shrink-0",
                    me.photo_url ? "bg-transparent" : "bg-primary",
                  )}
                >
                  {me.photo_url ? (
                    <img src={me.photo_url} alt="" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span className="text-primary-foreground! text-xs font-semibold">{initial}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{me.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{me.email}</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={() => router.push("/personal/portal")}>
                Personal Portal
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={() => router.push("/business/portal")}>
                Business Portal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" onClick={() => router.push("/admin/overview")}>
                Super Admin
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer px-1.5 py-1.5" variant="destructive" onClick={handleSignOut}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-1">
        <PortalSidebar groups={getVisibleNavGroups(authUser.role)} />

        <main className="min-w-0 flex-1 px-3 sm:px-4 md:px-6 py-4 md:py-6">{children}</main>
      </div>
    </div>
  );
}
