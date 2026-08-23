// Shared framework types used across core plugins and modules.

import type { Knex } from "knex";

/** JWT claims decoded from the access token */
export interface AuthClaims {
  sub: string;
  type: "admin" | "platform_user";
  role?: string;     // admin role: super_admin|admin|data_admin|moderator
  /**
   * Tenant schema_name — a business's or an institution's. Both are orgs with their own
   * uuid schema, so they share one context concept and one `req.db`.
   */
  orgId?: string;
  /**
   * Which table orgId points at. ABSENT MEANS BUSINESS: tokens issued before institution
   * context existed carry no orgType and must keep resolving as businesses until they expire.
   */
  orgType?: "business" | "institution";
  /** business: owner|admin|manager|counsellor|member — institution: owner|member */
  orgRole?: string;
  email: string;
}

/** Institution record from the globalyapp db — the institution-side twin of BusinessRecord. */
export interface InstitutionRecord {
  id: number;
  platform_user_id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  schema_name: string;
  subdomain: string;
  institution_name: string;
  institution_type: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  status: string;
  /** 0 = not activated, 1 = activated. Same contract as businesses.account_status. */
  account_status: number;
  is_published: boolean;
  onboarding_completed: boolean;
  claim_status: string;
  claim_token: string | null;
  claim_token_expires_at: Date | null;
  /** Extraction provenance — the catalog is read through this, never copied. */
  source_job_id: string | null;
  /** NULL until the tenant schema exists; promoted listings get one on claim. */
  schema_provisioned_at: Date | null;
  meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

/** Business record from the globalyapp db */
export interface BusinessRecord {
  id: string;
  owner_id: number;
  email: string | null;
  phone: string | null;
  subdomain: string;
  business_name: string;
  business_type: string | null;
  business_category_id: number | null;
  company_size: string | null;
  legal_business_name: string | null;
  business_registration_number: string | null;
  registration_licenses: Record<string, unknown> | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  website: string | null;
  country_id: number | null;
  state: string | null;
  city: string | null;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  linkedin_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  twitter_url: string | null;
  youtube_url: string | null;
  whatsapp_url: string | null;
  gallery_images: string[] | null;
  video_urls: string[] | null;
  status: string;
  verified_at: Date | null;
  claim_status: string;
  claim_token: string | null;
  claim_token_expires_at: Date | null;
  is_published: boolean;
  onboarding_completed: boolean;
  agreed_to_t_and_c: boolean;
  schema_name: string;
  account_status: number;
  /** Extraction provenance — set when this listing was promoted from an extraction job. */
  source_job_id: string | null;
  source_agent_id: string | null;
  /** NULL until the tenant schema exists; promoted listings get one on claim. */
  schema_provisioned_at: Date | null;
  subscription_id: string | null;
  customer_id: string | null;
  payment_currency: string | null;
  currency: string | null;
  plan_code: string | null;
  meta: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// Fastify type augmentation
declare module "fastify" {
  interface FastifyRequest {
    auth: AuthClaims;
    /** The tenant schema, whichever kind of org is in context. Set by tenant.plugin. */
    db: Knex;
    // Business context only — left undefined when orgType is "institution", so a business
    // route entered with an institution token fails on a missing business rather than
    // silently operating on the wrong tenant. requireBusinessContext rejects it first.
    business?: BusinessRecord;
    businessId: number; // numeric businesses.id (auth.orgId is its schema_name)
    // Institution context only.
    institution?: InstitutionRecord;
    institutionId: number; // numeric institutions.id
  }
}
