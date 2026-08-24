import { z } from "zod";

export const CreateProgramSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  commission_type: z.enum(["flat", "percentage"]),
  commission_value: z.number().positive(),
  currency: z.string().length(3).default("USD"),
});
export type CreateProgramInput = z.infer<typeof CreateProgramSchema>;

export const UpdateProgramSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullish(),
  commission_type: z.enum(["flat", "percentage"]).optional(),
  commission_value: z.number().positive().optional(),
  status: z.enum(["draft", "active", "paused", "closed"]).optional(),
});
export type UpdateProgramInput = z.infer<typeof UpdateProgramSchema>;

export const ProgramIdParamSchema = z.object({ programId: z.coerce.number().int().positive() });

export const ApplyToProgramSchema = z.object({
  note: z.string().max(2000).nullish(),
});
export type ApplyToProgramInput = z.infer<typeof ApplyToProgramSchema>;

export const ApplicationIdParamSchema = z.object({
  programId: z.coerce.number().int().positive(),
  applicationId: z.coerce.number().int().positive(),
});

export const AmbassadorIdParamSchema = z.object({ ambassadorId: z.coerce.number().int().positive() });

export const ReviewApplicationSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).nullish(),
});
export type ReviewApplicationInput = z.infer<typeof ReviewApplicationSchema>;
