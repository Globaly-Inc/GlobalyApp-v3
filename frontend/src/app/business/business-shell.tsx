"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, Building2, LogOut, Loader2, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { ensureBusinessContext } from "@/lib/api/http";
import { getSelectedOrgId, saveSelectedOrgId } from "@/lib/session";
import { authApi } from "@/app/auth/apis";
import type { AuthMeBusiness } from "@/app/auth/apis";
import { logout } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";
import { cn } from "@/lib/utils";

const SHELL_WIDTH = "mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6";

export function BusinessShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { profile, status, error } = useAppSelector((state) => state.businessOnboarding);

  // Tenant-scoped endpoints 403 without an `orgId` claim, and login never issues
  // one. Establish it here rather than in each page, so children can fetch
  // freely — and hold them back until it resolves, or their mount-time fetch
  // races the switch and 403s.
  const [contextReady, setContextReady] = useState(false);
  const [businesses, setBusinesses] = useState<AuthMeBusiness[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    ensureBusinessContext()
      .catch(() => false)
      .then(() => (active ? authApi.listMyBusinesses().catch(() => []) : []))
      .then((list) => {
        if (!active) return;
        setBusinesses(list);
        setActiveOrgId(getSelectedOrgId() ?? [...list].sort((a, b) => a.id - b.id)[0]?.org_id ?? null);
      })
      .finally(() => {
        if (active) setContextReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // A full reload is the honest way to re-switch: every slice already holds data
  // fetched under the previous business, and there is no cross-slice reset.
  const handleSwitchBusiness = async (orgId: string) => {
    if (orgId === activeOrgId) return;
    saveSelectedOrgId(orgId);
    await ensureBusinessContext(true);
    window.location.reload();
  };

  const portalTarget = { label: "Business Portal", icon: Building2, href: "/business/portal" };

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    dispatch(fetchMyProfile());
  }, [dispatch]);

  const handleSignOut = () => {
    dispatch(logout());
    router.push("/auth/sign-in");
  };

  if (status === "failed" && !profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-center px-4">
        <p className="text-sm text-muted-foreground">
          {error ?? "Failed to load your business profile."}
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

  if (!contextReady || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = profile?.business_name?.[0]?.toUpperCase() ?? "B";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="h-16 border-b border-border bg-background">
        <div className={cn(SHELL_WIDTH, "flex h-16 items-center justify-between")}>
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center">
              <Image src="/globaly-logo.png" alt="Globaly" width={753} height={157} className="h-7 w-auto" />
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />
              Business
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-muted cursor-pointer" type="button" />
              }
            >
              <Avatar className="size-8">
                {profile?.logo_url && <AvatarImage src={profile.logo_url} alt={profile.business_name} />}
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {businesses.length > 1 && (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Acting as</DropdownMenuLabel>
                  {businesses.map((b) => (
                    <DropdownMenuItem
                      key={b.org_id}
                      className="cursor-pointer"
                      onClick={() => handleSwitchBusiness(b.org_id)}
                    >
                      {b.org_id === activeOrgId ? <Check /> : <span className="size-4" />}
                      {b.business_name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/profile")}>
                <Building2 /> My Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(portalTarget.href)}>
                <portalTarget.icon /> {portalTarget.label}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/ai-widget")}>
                <Bot /> AI Widget
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
                <LogOut /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="flex-1 py-4 md:py-6">
        <div className={SHELL_WIDTH}>{children}</div>
      </main>
    </div>
  );
}
