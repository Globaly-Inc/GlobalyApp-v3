// Wire types for /api/v3/admin/ai-knowledge.

export type KnowledgeCounts = {
  visa: number;
  faqs: number;
  guides: number;
  pending_reviews: number;
};

export type VisaEntry = {
  id: string;
  destination_country: string;
  visa_type: string;
  eligible_nationalities: string[] | null;
  requirements: Record<string, unknown>;
  required_documents: string[] | null;
  processing_time_days: number | null;
  application_fee_usd: number | null;
  work_rights_hours: number | null;
  post_study_visa: string | null;
  common_rejections: string[] | null;
  last_verified_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Faq = {
  id: string;
  question: string;
  answer: string;
  tags: string[] | null;
  active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type CountryGuide = {
  id: string;
  country: string;
  education_system: string | null;
  popular_cities: string[] | null;
  cost_of_living_monthly_usd: Record<string, unknown> | null;
  culture_notes: string | null;
  student_life: string | null;
  climate: string | null;
  last_verified_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type QueueItem = {
  id: string;
  submitted_by: number;
  submitter_type: string;
  data_type: string;
  data_id: string;
  status: "pending" | "verified" | "rejected";
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
};

// ── Knowledge Rack ──

export type CategoryKind =
  | "visa" | "gov_update" | "institution_update" | "scholarship" | "test_provider" | "other";

export type RackCategory = {
  id: string;
  slug: string;
  label: string;
  kind: CategoryKind;
  country_code: string | null;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TrustTier = "gov" | "verified_institution" | "other";
export type CrawlFrequency = "off" | "weekly" | "monthly";

export type CrawlSummary = {
  discovered: number;
  discovery_method: string;
  discovery_error: string | null;
  scraped: number;
  added: number;
  updated: number;
  unchanged: number;
  failed: number;
  /** Absent on runs recorded before chunking shipped. */
  chunks?: number;
  embedded: number;
  max_pages: number;
  finished_at: string;
};

export type RackSource = {
  id: string;
  category_id: string;
  source_type: "url" | "file";
  url: string | null;
  file_name: string | null;
  domain: string;
  title: string | null;
  trust_tier: TrustTier;
  crawl_frequency: CrawlFrequency;
  last_crawled_at: string | null;
  last_status: string | null;
  last_error: string | null;
  doc_count: number;
  active: boolean;
  added_via: "manual" | "ai_discover";
  max_pages: number | null;
  crawl_summary: CrawlSummary | null;
  created_at: string;
  updated_at: string;
};

/** List rows omit `markdown`; only the detail fetch carries the body. */
export type RackDocument = {
  id: string;
  source_id: string;
  category_id: string;
  url: string;
  title: string | null;
  content_hash: string;
  word_count: number;
  chunk_count: number;
  crawled_at: string;
  active: boolean;
  is_embedded: boolean;
  created_at: string;
  updated_at: string;
};

export type RackDocumentDetail = RackDocument & { markdown: string };

export type RackCounts = {
  categories: number;
  sources: number;
  documents: number;
  /** Documents reachable by retrieval — chunked, or still on the legacy whole-page vector. */
  embedded_documents: number;
  embedded_chunks: number;
};

// ── Create / patch payloads ──

export type VisaParams = Partial<Omit<VisaEntry, "id" | "created_at" | "updated_at">>;
export type FaqParams = Partial<Omit<Faq, "id" | "created_at" | "updated_at" | "created_by">>;
export type GuideParams = Partial<Omit<CountryGuide, "id" | "created_at" | "updated_at">>;

export type CategoryParams = {
  slug?: string;
  label?: string;
  kind?: CategoryKind;
  country_code?: string | null;
  description?: string | null;
  active?: boolean;
  sort_order?: number;
};

export type SourceParams = {
  category_id?: string;
  url?: string;
  title?: string | null;
  trust_tier?: TrustTier;
  crawl_frequency?: CrawlFrequency;
  max_pages?: number | null;
  active?: boolean;
};

export type UploadSourceOptions = {
  title?: string;
  trust_tier?: TrustTier;
};

export type UploadSourceResult = {
  source: RackSource;
  document_id: string;
  chunks: number;
  embedded: number;
};
