export type MaraExtractionStatus = "pending" | "promoted" | "discarded";

export type MaraExtraction = {
  id: string;
  marn: string;
  agent_name: string | null;
  business_name: string | null;
  registration_status: string | null;
  registration_date: string | null;
  expiry_date: string | null;
  languages_spoken: string[] | null;
  practice_areas: string[] | null;
  office_country: string | null;
  office_state: string | null;
  office_city: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  confidence_score: number | null;
  status: MaraExtractionStatus;
  source_url: string | null;
  created_at: string;
};
