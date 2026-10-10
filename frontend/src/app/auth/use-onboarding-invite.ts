"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inviteApi, type OnboardingInviteType } from "@/app/invite/apis";

/** What the invitation's own button puts in the URL, and what tells sign-in to read the invite. */
export const INVITE_SOURCE = "onboard-invitation";

/** Where the code is handed to the setup page: same tab, read once, cleared on arrival. */
export const SETUP_HANDOFF_KEY = "onboarding-setup";

export type SetupHandoff = { token: string; type: OnboardingInviteType; otp: string };

const INVITE_TYPES: readonly string[] = ["institution", "business"];

/**
 * Sign-in for someone who has no account yet. The invitation row is the authority: it names the
 * inbox, so this page can fill the address in and ask for a code sent there, and nothing is created
 * until that code comes back right — which happens on the setup page, not here.
 *
 * A link that is spent or lapsed goes to /invite/onboarding, whose whole job is explaining that and
 * asking for a new one.
 */
export function useOnboardingInvite(params: URLSearchParams) {
  const router = useRouter();
  const token = params.get("token");
  const type = params.get("type");
  const invited = params.get("source") === INVITE_SOURCE && !!token && !!type && INVITE_TYPES.includes(type);

  const [invite, setInvite] = useState<{ email: string; orgName: string } | null>(null);
  const looked = useRef(false);

  useEffect(() => {
    if (!invited || looked.current) return;
    looked.current = true;
    inviteApi
      .lookupOnboardingInvite({ token: token as string, type: type as OnboardingInviteType })
      .then(({ email, org_name }) => setInvite({ email, orgName: org_name }))
      // Spent, cancelled, expired or unknown: that page explains each one and can ask for a new link.
      .catch(() => router.replace(`/invite/onboarding?token=${encodeURIComponent(token as string)}&type=${type}`));
  }, [invited, token, type, router]);

  return {
    invited,
    /** Null until the lookup answers; the form waits on it rather than guessing the address. */
    invite,
    sendCode: () => inviteApi.sendOnboardingCode({ token: token as string, type: type as OnboardingInviteType }),
    /** The accounts are created on the setup page, with this code as the proof. */
    goToSetup: (otp: string) => {
      const handoff: SetupHandoff = { token: token as string, type: type as OnboardingInviteType, otp };
      sessionStorage.setItem(SETUP_HANDOFF_KEY, JSON.stringify(handoff));
      router.push("/invite/setup");
    },
  };
}
