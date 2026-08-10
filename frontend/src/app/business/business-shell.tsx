"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, User as UserIcon, LogOut, Loader2 } from "lucide-react";
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
import { fetchFullProfile } from "@/app/personal/store/profile-slice";

export function BusinessShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { profile, status } = useAppSelector((state) => state.profile);

  const portalTarget =
    profile?.user_category === "business"
      ? { label: "Business Portal", icon: Building2, href: "/business/portal" }
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
              {profile?.photo_url && <AvatarImage src={profile.photo_url} alt={profile.first_name} />}
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={() => router.push("/business/profile")}>
              <Building2 /> My Profile
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
      </header>

      <main className="flex-1 px-3 sm:px-4 md:px-6 py-4 md:py-6">{children}</main>
    </div>
  );
}
