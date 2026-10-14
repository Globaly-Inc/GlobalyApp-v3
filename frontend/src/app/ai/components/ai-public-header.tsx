"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { Button } from "@/components/ui/button";
import { ICON } from "@/lib/public-assets";

export function AiPublicHeader() {
  const { user, initializing } = useAuthState();

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-16 items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src={ICON.src}
            alt="GlobalyAI"
            width={ICON.width}
            height={ICON.height}
            className="size-9 rounded-lg"
            priority
          />
        </Link>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Counsellor
        </span>

        {!initializing && (
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Button variant="outline" size="sm" render={<Link href="/personal/ai" />}>
                My Sessions
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" render={<Link href={`/auth/sign-in?redirect=${encodeURIComponent("/personal/ai")}`} />}>
                  Sign in
                </Button>
                <Button size="sm" render={<Link href={`/auth/sign-up?redirect=${encodeURIComponent("/personal/ai")}`} />}>
                  Sign up free
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
