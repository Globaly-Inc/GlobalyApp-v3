"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useAuthState } from "@/app/auth/store/auth-slice";

export function AiPublicHeader() {
  const { user, initializing } = useAuthState();

  return (
    <header className="sticky top-0 z-40 h-16 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-16 items-center gap-3 px-4">
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
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Counsellor
        </span>

        {!initializing && (
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link
                href="/personal/ai"
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
              >
                My Sessions
              </Link>
            ) : (
              <>
                <Link
                  href={`/auth/sign-in?redirect=${encodeURIComponent("/ai")}`}
                  className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  href={`/auth/sign-up?redirect=${encodeURIComponent("/ai")}`}
                  className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign up free
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
