import { OnboardingAcceptView } from "@/app/invite/onboarding-accept-view";

// Where invitations sent before the flow moved still land. Today's mail points at
// /auth/sign-in?...&source=onboard-invitation — see onboarding-invitations.service.ts's inviteUrl.
export default function OnboardingInvitePage() {
  return <OnboardingAcceptView />;
}
