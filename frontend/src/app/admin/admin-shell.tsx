"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, ChevronDown, Sparkles, Loader2 } from "lucide-react";
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
import { AdminGroupNav } from "./components/admin-group-nav";
import { AdminSubNav } from "./components/admin-sub-nav";
import { AdminMobileNav } from "./components/admin-mobile-nav";

export function AdminShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { me } = useAppSelector((state) => state.admin);
  const { user: authUser, initializing } = useAuthState();
  const isSuperAdmin = authUser?.type === "admin" && authUser?.role === "super_admin";

  useEffect(() => {
    if (!initializing && !isSuperAdmin) {
      router.replace("/");
    }
  }, [initializing, isSuperAdmin, router]);

  useEffect(() => {
    if (isSuperAdmin) dispatch(fetchMe());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

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

  if (!isSuperAdmin) return null;

  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = me.email?.charAt(0).toUpperCase() ?? "A";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="sticky top-0 z-50 h-16 w-full border-b border-border bg-background/95 backdrop-blur-md flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/admin" className="flex items-center flex-shrink-0">
            <Image src="/globaly-logo.png" alt="Globaly" width={753} height={157} className="h-7 w-auto" />
          </Link>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground flex-shrink-0">
            <ShieldCheck className="h-3.5 w-3.5" />
            {ROLE_DISPLAY[me.role]}
          </span>
          <AdminGroupNav />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/ai"
            className="hidden md:inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 h-8 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
            aria-label="Open AI Counsellor"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Counsellor</span>
          </Link>

          <AdminMobileNav />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-lg border border-border px-1.5 py-1 text-foreground hover:bg-muted focus-visible:ring-0 focus-visible:ring-offset-0 cursor-pointer"
                />
              }
            >
              <div
                className={cn(
                  "h-7 w-7 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0",
                  me.photo_url ? "bg-transparent" : "bg-primary",
                )}
              >
                {me.photo_url ? (
                  <img src={me.photo_url} alt="" className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <span className="text-primary-foreground text-xs font-semibold">{initial}</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/admin/my-profile")}>
                My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/personal")}>
                Personal Portal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AdminSubNav />

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 md:py-6">{children}</main>
    </div>
  );
}
