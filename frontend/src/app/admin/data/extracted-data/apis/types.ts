import type { ExtractionStatus } from "../../all-extractions/apis/types";

export type ExtractedJob = {
  id: string;
  institution_name: string | null;
  institution_url: string;
  status: ExtractionStatus;
  courses_extracted: number;
  verification_score: number;
  verification_total: number;
  created_at: string;
  updated_at: string;
};
