// Shared framework types used across core plugins and modules.

import type { Knex } from "knex";

/** JWT claims decoded from the access token */
export interface AuthClaims {
  sub: string;
  type: "admin" | "student" | "agent";
  role?: string;     // admin: super_admin|admin|data_admin|moderator, agent: owner|admin|member
  orgId?: string;    // business id (agents only)
  email: string;
}

/** Business record from the globalyapp db */
export interface BusinessRecord {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
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
  is_published: boolean;
  onboarding_completed: boolean;
  agreed_to_t_and_c: boolean;
  db_name: string;
  db_username: string;
  db_password: string;
  account_status: number;
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
    db: Knex;          // per-business DB (set for agent routes only)
  }
}
