export type AcceptAgentInviteParams = {
  token: string;
  org_id: string;
};

export type AcceptAgentInviteResult = {
  message: string;
  org_id: string;
  agent: { id: number; role: string };
};

/** The claimant's own name — a promoted listing has none until this point, so it is required. */
export type AcceptClaimParams = {
  token: string;
  first_name: string;
  last_name: string;
};

export type AcceptBusinessClaimResult = {
  email: string | null;
  business_name: string;
};

export type AcceptInstitutionClaimResult = {
  email: string | null;
  institution_name: string;
};

export type AcceptInstitutionMemberInviteResult = {
  message: string;
  org_id: string;
};

export type OnboardingInviteType = "institution" | "business";

export type OnboardingInviteParams = {
  token: string;
  type: OnboardingInviteType;
};

/** Accepting needs the code mailed to the invited address: nothing is created without it. */
export type AcceptOnboardingInviteParams = OnboardingInviteParams & { otp: string };

/** Who the link is for. Read-only — looking does not spend the invite. */
export type OnboardingInviteLookup = {
  email: string;
  org_name: string;
  type: OnboardingInviteType;
};

/** No session on purpose — the ordinary /auth/verify-otp call mints it against the new account. */
export type AcceptOnboardingInviteResult = {
  email: string;
  type: OnboardingInviteType;
};
