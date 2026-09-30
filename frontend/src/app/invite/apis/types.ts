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

export type AcceptOnboardingInviteParams = {
  token: string;
  type: OnboardingInviteType;
};

/** No session on purpose — the user signs in with an OTP, so a mail scanner opening the link can't. */
export type AcceptOnboardingInviteResult = {
  email: string;
  type: OnboardingInviteType;
};
