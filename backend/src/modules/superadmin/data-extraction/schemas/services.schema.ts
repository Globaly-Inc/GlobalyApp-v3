// Zod schemas for service category extraction endpoints.

import { z } from "zod";

export const SERVICE_TYPES = [
  "accommodation", "insurance", "banking", "visa_services",
  "test_preparation", "career_services", "translation", "transport",
] as const;

export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TABLE_MAP: Record<ServiceType, string> = {
  accommodation: "extraction_accommodation",
  insurance: "extraction_insurance",
  banking: "extraction_banking",
  visa_services: "extraction_visa_services",
  test_preparation: "extraction_test_preparation",
  career_services: "extraction_career_services",
  translation: "extraction_translation",
  transport: "extraction_transport",
};

export const ServiceTypeParamSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
});

export const ServiceItemParamSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  id: z.string().uuid(),
});

export const ServiceListQuerySchema = z.object({
  status: z.string().optional(),
  job_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export const ServicePromoteSchema = z.object({
  department_business_id: z.string().uuid().optional(),
});

export const ServiceExtractSchema = z.object({
  source_url: z.string().url(),
  guidance_notes: z.string().optional(),
  max_items: z.number().int().min(1).max(500).optional(),
});
