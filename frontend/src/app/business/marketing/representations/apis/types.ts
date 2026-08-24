export type RepresentationStatus = "pending" | "active" | "rejected" | "expired";

export type RepresentationPartner = {
  id: number;
  business_name: string;
  logo_url: string | null;
  city: string | null;
};

export type Representation = {
  id: string;
  status: RepresentationStatus;
  regions: string[];
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  my_role: "agent" | "institution";
  can_respond: boolean;
  partner: RepresentationPartner;
};

export type RepresentationTarget = {
  id: number;
  business_name: string;
  logo_url: string | null;
  city: string | null;
};

export type RepresentationInviteInput = {
  target_business_id: number;
  regions?: string[];
  notes?: string | null;
};
