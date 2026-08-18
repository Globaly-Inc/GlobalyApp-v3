export type AcceptAgentInviteParams = {
  token: string;
  org_id: string;
};

export type AcceptAgentInviteResult = {
  message: string;
  org_id: string;
  agent: { id: number; role: string };
};

export type AcceptBusinessClaimResult = {
  email: string | null;
  business_name: string;
};
