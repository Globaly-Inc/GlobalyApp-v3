// Wire shapes for the public MARA agent directory — V1's search_mara_agents /
// get_mara_agent_detail RPC rows verbatim (globaly-app/src/hooks/usePublicMaraAgents.ts).
//
// Note what is NOT here: email, phone, office address. The directory publishes a
// registration record, not a way to contact somebody, and the backend table does
// not carry those columns at all.

export interface MaraAgentItem {
  business_id: number;
  business_name: string | null;
  business_slug: string | null;
  marn: string;
  registration_status: string | null;
  expiry_date: string | null;
  office_state: string | null;
  office_city: string | null;
  languages_spoken: string[] | null;
  practice_areas: string[] | null;
}

export interface MaraAgentDetail extends MaraAgentItem {
  registration_date: string | null;
  office_country: string | null;
  source_url: string | null;
}
