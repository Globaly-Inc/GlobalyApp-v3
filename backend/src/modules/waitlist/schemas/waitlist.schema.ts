import { z } from "zod";

export const REGISTRANT_TYPES = ["student", "institution", "service_provider", "other"] as const;

export const RegisterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  type: z.enum(REGISTRANT_TYPES),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
