export type VisaExtractionStatus = "pending" | "promoted" | "discarded";

export type VisaExtraction = {
  id: string;
  subclass_code: string | null;
  name: string | null;
  country_code: string | null;
  category: string | null;
  visa_stream: string | null;
  confidence_score: number | null;
  status: VisaExtractionStatus;
  source_url: string | null;
  duration_months: number | null;
  is_permanent: boolean | null;
  application_fee_amount: number | null;
  application_fee_currency: string | null;
  processing_time_min_days: number | null;
  processing_time_max_days: number | null;
  description: string | null;
  created_at: string;
};
