import { OnboardingSetupView } from "@/app/invite/onboarding-setup-view";

// Reached from sign-in once the invited code is entered — see use-onboarding-invite.ts's goToSetup.
export default function OnboardingSetupPage() {
  return <OnboardingSetupView />;
}
