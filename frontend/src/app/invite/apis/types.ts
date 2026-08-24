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
