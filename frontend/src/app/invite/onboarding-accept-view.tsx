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

const SUPPORT_EMAIL = "support@globalyapp.com";

type LapsedReason = "expired" | "revoked";

type View =
  | { kind: "checking" }
  | { kind: "done"; message: string; email: string | null }
  | { kind: "lapsed"; reason: LapsedReason }
  | { kind: "error"; message: string };

const LAPSED_ERRORS: Record<string, LapsedReason> = { INVITE_EXPIRED: "expired", INVITE_REVOKED: "revoked" };

const LAPSED_COPY: Record<LapsedReason, { title: string; message: string }> = {
  expired: { title: "This link has expired", message: "Invite links last 72 hours. Ask for a new one and we'll send it to your email." },
  revoked: { title: "This invite was cancelled", message: "This invite is no longer active. Ask us for a new one if you'd still like to join." },
};

function signInUrl(email: string | null) {
  const query = new URLSearchParams({ redirect: "/business/portal" });
  if (email) query.set("email", email);
  return `/auth/sign-in?${query}`;
}

function SupportLine() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Need help? Email{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">{SUPPORT_EMAIL}</a>
    </p>
  );
}

/**
 * Where invitations sent before the flow moved still land, and where a link that cannot be used is
 * explained. A good link is forwarded to sign-in with its token: the account and the portal are
 * created on the setup page afterwards, once the code mailed to that inbox comes back right. This
 * page itself creates nothing, so opening it — recipient or mail scanner — spends nothing.
 */
export function OnboardingAcceptView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const type = searchParams.get("type") as OnboardingInviteType | null;
  const linkInvalid = !token || !type || !INVITE_TYPES.includes(type);
  const [view, setView] = useState<View>({ kind: "checking" });

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current || linkInvalid) return;
    startedRef.current = true;
    inviteApi
      .lookupOnboardingInvite({ token, type })
      .then(() => router.replace(`/auth/sign-in?token=${encodeURIComponent(token)}&type=${type}&source=onboard-invitation`))
      .catch((err: Error) => {
        // 409 = the invite was already used: the account exists, so signing in is all that is left.
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
              {current.kind === "checking" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              {current.kind === "done" && <CheckCircle2 className="h-10 w-10 text-primary" />}
              {current.kind === "lapsed" && <Clock className="h-10 w-10 text-amber-500" />}
              {current.kind === "error" && <XCircle className="h-10 w-10 text-destructive" />}
            </div>
            <CardTitle className="text-2xl">
              {current.kind === "checking" && "Opening your invitation…"}
              {current.kind === "done" && "Your account is already set up"}
              {current.kind === "lapsed" && LAPSED_COPY[current.reason].title}
              {current.kind === "error" && "We couldn't open this invitation"}
            </CardTitle>
            <CardDescription>
              {current.kind === "checking" && "Taking you to sign-in, where we'll email you a code."}
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
