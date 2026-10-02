"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/http";
import { LOGO } from "@/lib/public-assets";
import { inviteApi, type OnboardingInviteType } from "./apis";

const INVITE_TYPES: readonly OnboardingInviteType[] = ["institution", "business"];

/** No `?welcome=1`: accepting the invite records the splash as due on the org's onboarding row, so
 *  the portal plays it from server state. A param here is a second source of truth that survives
 *  sharing and reloads, and it had to round-trip through the OTP redirect to arrive at all. */
function signInUrl(email: string | null) {
  const query = new URLSearchParams({ redirect: "/business/portal" });
  if (email) query.set("email", email);
  return `/auth/sign-in?${query}`;
}

const SUPPORT_EMAIL = "support@globalyapp.com";

type LapsedReason = "expired" | "revoked";

type View =
  | { kind: "creating" }
  | { kind: "done"; message: string; email: string | null }
  | { kind: "lapsed"; reason: LapsedReason }
  | { kind: "error"; message: string };

const LAPSED_ERRORS: Record<string, LapsedReason> = { INVITE_EXPIRED: "expired", INVITE_REVOKED: "revoked" };

const LAPSED_COPY: Record<LapsedReason, { title: string; message: string }> = {
  expired: { title: "This link has expired", message: "Invite links last 72 hours. Ask for a new one and we'll send it to your email." },
  revoked: { title: "This invite was cancelled", message: "This invite is no longer active. Ask us for a new one if you'd still like to join." },
};

function SupportLine() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Need help? Email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">{SUPPORT_EMAIL}</a>
    </p>
  );
}

/**
 * Sets the account up as soon as the link opens, then hands off to OTP sign-in. Accepting returns no
 * session, so a mail scanner that opens the link first can only use it up — never get in; the real
 * recipient then lands on "already set up" and signs in with the code sent to their inbox.
 */
export function OnboardingAcceptView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type") as OnboardingInviteType | null;
  const linkInvalid = !token || !type || !INVITE_TYPES.includes(type);
  const noun = type === "business" ? "business" : "institution";
  const [view, setView] = useState<View>({ kind: "creating" });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || linkInvalid) return;
    startedRef.current = true;
    inviteApi
      .acceptOnboardingInvite({ token, type })
      .then(({ email }) => {
        toast.success("Your account is ready", { description: "Sign in with the code we email you." });
        router.replace(signInUrl(email));
      })
      .catch((err: Error) => {
        // 409 = the account already exists (set up earlier, or registered on their own): just sign in.
        if (err instanceof ApiError && err.code === "CONFLICT") {
          const email = (err.details as { email?: string } | undefined)?.email ?? null;
          setView({ kind: "done", message: err.message, email });
          return;
        }
        const reason = err instanceof ApiError && err.code ? LAPSED_ERRORS[err.code] : undefined;
        if (reason) {
          setView({ kind: "lapsed", reason });
          return;
        }
        setView({ kind: "error", message: err.message || "This invite is no longer valid. Ask for a new one." });
      });
  }, [linkInvalid, token, type, router]);

  const current: View = linkInvalid ? { kind: "error", message: "This invite link is missing required information." } : view;

  const [requestState, setRequestState] = useState<"idle" | "sending" | "sent">("idle");
  const requestLink = async () => {
    if (!token || !type) return;
    setRequestState("sending");
    try {
      await inviteApi.requestOnboardingLink({ token, type });
      setRequestState("sent");
    } catch (err) {
      setRequestState("idle");
      toast.error("Couldn't send your request", { description: (err as Error).message || `Email ${SUPPORT_EMAIL} instead.` });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Link href="/">
            <Image src={LOGO.src} alt="Globalyapp" width={LOGO.width} height={LOGO.height} className="h-10 w-auto" />
          </Link>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-2">
              {current.kind === "creating" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              {current.kind === "done" && <CheckCircle2 className="h-10 w-10 text-primary" />}
              {current.kind === "lapsed" && <Clock className="h-10 w-10 text-amber-500" />}
              {current.kind === "error" && <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="text-2xl">
              {current.kind === "creating" && "Setting up your account…"}
              {current.kind === "done" && "Your account is already set up"}
              {current.kind === "lapsed" && LAPSED_COPY[current.reason].title}
              {current.kind === "error" && "We couldn't set you up"}
            </CardTitle>
            <CardDescription>
              {current.kind === "creating" && `We're creating your personal account and your ${noun}'s portal. You'll sign in next.`}
              {current.kind === "lapsed" && LAPSED_COPY[current.reason].message}
              {(current.kind === "done" || current.kind === "error") && current.message}
            </CardDescription>
          </CardHeader>
          {current.kind === "lapsed" && (
            <CardContent className="flex flex-col gap-3">
              {requestState === "sent" ? (
                <p role="status" className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4 shrink-0" /> Request sent. We&apos;ll email you a new link.
                </p>
              ) : (
                <Button className="h-10 w-full cursor-pointer" disabled={requestState === "sending"} onClick={requestLink}>
                  {requestState === "sending" ? "Sending request…" : "Request a new link"}
                </Button>
              )}
              <SupportLine />
            </CardContent>
          )}
          {(current.kind === "done" || current.kind === "error") && (
            <CardContent className="flex flex-col gap-3">
              <Button
                variant={current.kind === "done" ? "default" : "outline"}
                className="h-10 w-full cursor-pointer"
                onClick={() => router.push(signInUrl(current.kind === "done" ? current.email : null))}
              >
                Go to Sign In
              </Button>
              {current.kind === "error" && <SupportLine />}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
