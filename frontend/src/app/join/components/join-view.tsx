"use client";

// /join?ref=CODE — the referral landing page. This route did not exist in V2, which is why every
// shared link resolved to a 404 and no referral could ever complete.
//
// Attribution is only PROVISIONAL here. An anonymous visitor has no identity to check a code against,
// so the authoritative self-referral and related-party checks happen server-side once the account is
// activated. Nothing on this page is a security boundary.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { getAccessToken } from "@/lib/session";
import { buildReferralLink, captureRefTokenIfAbsent } from "@/lib/referral-token";
import { cn } from "@/lib/utils";
import { referralsApi } from "@/app/personal/earn/referrals/apis";
import { resolveInvite } from "../store/join-slice";

export function JoinView() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("ref");

  const dispatch = useAppDispatch();
  const { lookup, status } = useAppSelector((s) => s.join);

  /** "self" once we know the signed-in viewer owns this code. */
  const [relationship, setRelationship] = useState<"unknown" | "self" | "signed-in-other">("unknown");

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current || !code) return;
    fetchedRef.current = true;
    dispatch(resolveInvite(code));
  }, [dispatch, code]);

  // Detect "this is my own link" WITHOUT widening the public lookup response.
  //
  // The lookup deliberately exposes no owner id, and it does not need to: we already have the code
  // string from the URL, and a signed-in viewer can fetch their own from the authenticated endpoint.
  // So this is a case-insensitive comparison of two codes — no id, and never any parsing of the
  // opaque ref_token.
  useEffect(() => {
    if (!code || !getAccessToken()) return;
    let cancelled = false;
    referralsApi
      .getMyReferrals()
      .then((mine) => {
        if (cancelled) return;
        setRelationship(
          mine.code && mine.code.toLowerCase() === code.toLowerCase() ? "self" : "signed-in-other",
        );
      })
      .catch(() => {
        /* not signed in after all, or the call failed — fall through to the anonymous path */
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Capture, first-touch. Only for a visitor we have no reason to reject: a signed-in viewer already
  // has an account, so a code cannot apply to them either way.
  useEffect(() => {
    if (status !== "ready" || !lookup || relationship !== "unknown" || getAccessToken()) return;
    captureRefTokenIfAbsent(lookup.ref_token);
  }, [status, lookup, relationship]);

  const goToSignUp = () => router.push("/auth/sign-up");

  const copyOwnLink = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(buildReferralLink(code));
      toast.success("Link copied!", { description: "Now share it with someone else." });
    } catch {
      toast.error("Could not copy", { description: "Select and copy the link from your referrals page." });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image src="/globalyapp-logo.png" alt="Globalyapp" width={727} height={157} className="h-10 w-auto" />
          </Link>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            {!code || status === "invalid" ? (
              // A bad code never blocks sign-up — it is explained plainly and the journey continues.
              <>
                <h1 className="text-xl font-bold text-foreground">We couldn&apos;t find that invite link</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  The link may have expired or been mistyped. You can still create your account.
                </p>
                <Button className="mt-6 w-full cursor-pointer" onClick={goToSignUp}>
                  Create your account
                </Button>
              </>
            ) : status === "loading" || status === "idle" ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : relationship === "self" ? (
              // Presentation only — the server discards a self-referral regardless, so defeating this
              // gains nothing. Neutral, and it hands them the useful action instead.
              <>
                <h1 className="text-xl font-bold text-foreground">This is your own referral link</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Share it with someone else instead.
                </p>
                <div className="mt-6 flex flex-col gap-2">
                  <Button className="w-full cursor-pointer" onClick={copyOwnLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy link
                  </Button>
                  <Link
                    href="/personal/earn/referrals"
                    className={cn(buttonVariants({ variant: "outline" }), "w-full cursor-pointer")}
                  >
                    Go to my referrals
                  </Link>
                </div>
              </>
            ) : relationship === "signed-in-other" ? (
              // Stated plainly rather than silently discarded, which is what V2 would have done.
              <>
                <h1 className="text-xl font-bold text-foreground">
                  You&apos;re already signed in
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  An invite link only applies to a brand new account, so this one won&apos;t change
                  anything on yours.
                </p>
                <Link
                  href="/personal/portal"
                  className={cn(buttonVariants(), "mt-6 w-full cursor-pointer")}
                >
                  Continue to Globaly
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {lookup?.referrer_type === "business" ? "You've been invited by" : "Your friend"}
                </p>
                <h1 className="mt-1 text-2xl font-bold text-foreground">{lookup?.display_name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">has invited you to join Globaly</p>

                <Button className="mt-6 w-full cursor-pointer" onClick={goToSignUp}>
                  Create your account
                </Button>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/auth/sign-in" className="font-medium text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
