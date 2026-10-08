"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/hooks";
import { fetchMe, verifySignInOtp } from "@/app/auth/store/auth-slice";
import { INVITE_SOURCE, SETUP_HANDOFF_KEY, type SetupHandoff } from "@/app/auth/use-onboarding-invite";
import { ICON } from "@/lib/public-assets";
import { inviteApi } from "./apis";

const SUPPORT_EMAIL = "support@globalyapp.com";
const PORTAL = "/business/portal";

/** Read once and cleared: the code is a bearer credential and this page is its only consumer. */
function takeHandoff(): SetupHandoff | null {
  try {
    const raw = sessionStorage.getItem(SETUP_HANDOFF_KEY);
    sessionStorage.removeItem(SETUP_HANDOFF_KEY);
    return raw ? (JSON.parse(raw) as SetupHandoff) : null;
  } catch {
    return null;
  }
}

type Step = { label: string; detail?: string; state: "done" | "doing" | "waiting"; bar?: boolean };

function StepMark({ state }: Readonly<{ state: Step["state"] }>) {
  if (state === "done") {
    return (
      <span className="flex size-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "doing") return <span aria-hidden className="size-6 animate-spin rounded-full border-[3px] border-primary border-t-transparent" />;
  return <span aria-hidden className="size-6 rounded-full border-2 border-muted-foreground/30" />;
}

function Timeline({ steps }: Readonly<{ steps: Step[] }>) {
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.label} className="flex gap-3">
            <span className="flex shrink-0 flex-col items-center">
              <StepMark state={step.state} />
              {!last && <span aria-hidden className="min-h-4 w-0.5 flex-1 bg-border" />}
            </span>
            <span className={last ? "min-w-0 flex-1" : "min-w-0 flex-1 pb-3.5"}>
              <span className={`block text-sm font-medium ${step.state === "doing" ? "text-primary" : ""}`}>{step.label}</span>
              {step.detail && <span className="block text-xs text-muted-foreground">{step.detail}</span>}
              {step.bar && (
                <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-primary/15">
                  <span className="block h-full w-2/5 animate-pulse rounded-full bg-primary" />
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Where the invitation is actually spent. The code typed on sign-in is the proof: this page sends
 * it with the token, which creates the account and the org, then signs them in with that same code
 * through the ordinary verify-otp call. A failure leaves nothing half-made — the invite is released
 * on the way out, so the whole thing can be run again.
 */
export function OnboardingSetupView({ orgName }: Readonly<{ orgName?: string }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [failed, setFailed] = useState<string | null>(null);
  /** The address the invite was for, known once accept answers — it names whose account this is. */
  const [account, setAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [retryHref, setRetryHref] = useState("/auth/sign-in");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const handoff = takeHandoff();
    // No code in hand: a reload, or someone who arrived here directly. Sign-in is where it starts.
    if (!handoff) {
      router.replace("/auth/sign-in");
      return;
    }
    const { token, type, otp } = handoff;
    setRetryHref(`/auth/sign-in?source=${INVITE_SOURCE}&token=${encodeURIComponent(token)}&type=${type}`);
    inviteApi
      .acceptOnboardingInvite({ token, type, otp })
      .then(async ({ email }) => {
        setAccount(email);
        const outcome = await dispatch(verifySignInOtp({ email, otp }));
        if (verifySignInOtp.rejected.match(outcome)) {
          // The account exists now, so this is not a dead end — an ordinary sign-in away.
          router.replace(`/auth/sign-in?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(PORTAL)}`);
          return;
        }
        await dispatch(fetchMe());
        // Signed in and built. They leave on the button, not on a timer — same reason the welcome
        // splash lost its countdown: a screen that reads itself away is a screen nobody read.
        setReady(true);
      })
      .catch((err: Error) => setFailed(err.message || "We couldn't finish setting you up."));
  }, [dispatch, router]);

  const steps: Step[] = [
    { label: "Your account", detail: account ?? "Verified with the code we emailed you", state: "done" },
    {
      label: "Your portal",
      detail: failed ? "Stopped before anything was created" : undefined,
      state: failed ? "waiting" : ready ? "done" : "doing",
      bar: !failed && !ready,
    },
    { label: "You, as its owner", detail: "You can invite the rest of your team later", state: ready ? "done" : "waiting" },
  ];

  return (
    <div className="flex min-h-screen flex-col items-center bg-background">
      <div className="w-full bg-gradient-to-b from-primary/10 to-background px-6 py-9 text-center">
        <Image src={ICON.src} alt="" width={ICON.width} height={ICON.height} className="mx-auto h-16 w-16 rounded-2xl shadow-lg" priority />
        <h1 className="mt-3.5 font-heading text-2xl font-semibold text-primary">Welcome to GlobalyApp</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          You&apos;re on the platform. We&apos;re building{" "}
          {orgName ? <strong className="font-semibold text-foreground">{orgName}</strong> : "your organisation"}&apos;s portal now.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-4 px-6 py-6">
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-base font-semibold">Setting up your portal</h2>
          <p role="status" className="mt-0.5 mb-5 text-sm text-muted-foreground">
            {failed
              ? "Nothing was half-created, so it is safe to try again."
              : ready
                ? "Done — your portal is ready when you are."
                : "About ten seconds. Please keep this tab open."}
          </p>
          <Timeline steps={steps} />

          {ready && (
            <Button className="mt-5 h-12 w-full cursor-pointer gap-2 text-base" onClick={() => router.replace(PORTAL)}>
              Go to your portal
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>

        {failed && (
          <div className="flex items-start gap-3 rounded-2xl border bg-card p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <TriangleAlert className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-2.5">
              <div>
                <p className="text-sm font-medium">We couldn&apos;t finish setting you up</p>
                <p className="text-xs text-muted-foreground">{failed}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {/* A spent code can't be replayed, so trying again means asking for a fresh one —
                    which is why this goes back with the invitation, not to a bare sign-in. If the
                    invite itself is what lapsed, that page's lookup sends them on to ask for a new link. */}
                <Button size="sm" className="h-8 cursor-pointer gap-1.5" onClick={() => router.replace(retryHref)}>
                  Try again
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Button>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-muted"
                >
                  Email support
                </a>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Something not right? Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary hover:underline">{SUPPORT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}
