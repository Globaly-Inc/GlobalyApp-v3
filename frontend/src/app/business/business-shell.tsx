"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, LogOut, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { logout } from "@/app/auth/store/auth-slice";
import { fetchMyProfile } from "@/app/business/store/business-onboarding-slice";

export function BusinessShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { profile, status, error } = useAppSelector((state) => state.businessOnboarding);

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

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initial = profile?.business_name?.[0]?.toUpperCase() ?? "B";

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="h-16 border-b border-border bg-background flex items-center justify-between px-4 md:px-6">
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
            <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/profile")}>
              <Building2 /> My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" onClick={() => router.push(portalTarget.href)}>
              <portalTarget.icon /> {portalTarget.label}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer" variant="destructive" onClick={handleSignOut}>
              <LogOut /> Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 md:py-6">{children}</main>
    </div>
  );
}
