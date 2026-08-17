"use client";

import { LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type SignupWallProps = {
  fingerprintHash?: string;
};

export function SignupWall({ fingerprintHash }: SignupWallProps) {
  const params = fingerprintHash ? `?fp=${fingerprintHash}` : "";

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 max-w-sm rounded-xl border bg-card p-6 text-center shadow-lg">
        <h3 className="text-lg font-semibold">Create a free account to continue</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign up to get 10 free credits and save your conversation history.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button render={<Link href={`/auth/sign-up${params}`} />}>
            <UserPlus className="h-4 w-4" />
            Sign Up
          </Button>
          <Button variant="outline" render={<Link href={`/auth/sign-in${params}`} />}>
            <LogIn className="h-4 w-4" />
            Log In
          </Button>
        </div>
      </div>
    </div>
  );
}
