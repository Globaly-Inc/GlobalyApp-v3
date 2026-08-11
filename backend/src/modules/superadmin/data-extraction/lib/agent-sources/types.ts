// Shared types for the pluggable agent-source detection layer.
// Each provider returns rows in the same shape that the pipeline
// inserts into `extraction_agents` / `extraction_agent_locations`.

export interface AgentLocation {
  external_id: string | null;
  is_head_office: boolean;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postcode: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
}

export interface AgentRow {
  name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  /** Provenance of `website`: 'source' | 'derived_from_email' | etc. */
  website_source?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  address?: string | null;
  /** Original logo URL on the source site. After enrichment this may be the rehosted public URL. */
  logo_url?: string | null;
  /** Storage path once rehosted (GCS). */
  logo_storage_path?: string | null;
  /** Original third-party logo URL preserved when we rehost. */
  logo_source_url?: string | null;
  external_id?: string | null;
  location_count?: number;
  locations?: AgentLocation[];
}

export interface ProviderDetection {
  providerId: string;
  providerName: string;
  /** Resolved URL the provider will hit (iframe URL, API URL, etc.). */
  resolvedUrl: string;
  /** Free-form metadata persisted to extraction_memory for next-run caching. */
  meta?: Record<string, unknown>;
}

export interface ProviderResult {
  agents: AgentRow[];
  rawCount: number;
  sourceUrl: string;
  /** Extra fields persisted to extraction_memory for "smarter next time". */
  meta?: Record<string, unknown>;
}

export interface AgentSourceProvider {
  id: string;
  name: string;
  /** Quick check from seed URL only (and optional already-fetched HTML). */
  detect(seedUrl: string, html?: string | null): ProviderDetection | null;
  /** Execute the provider against a positive detection. */
  fetch(detection: ProviderDetection): Promise<ProviderResult | null>;
}
