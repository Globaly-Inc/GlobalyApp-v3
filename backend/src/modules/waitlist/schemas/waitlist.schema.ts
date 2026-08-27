import { z } from "zod";

export const REGISTRANT_TYPES = ["student", "institution", "service_provider", "other", "newsletter"] as const;

export const RegisterSchema = z
  .object({
    name: z.string().trim().max(120).default(""),
    email: z.string().trim().email().max(320),
    type: z.enum(REGISTRANT_TYPES),
  })
  .refine((v) => v.type === "newsletter" || v.name.length > 0, {
    message: "Name is required",
    path: ["name"],
  });

export type RegisterInput = z.infer<typeof RegisterSchema>;
