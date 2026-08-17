// Zod schemas for the promote endpoints.

import { z } from "zod";

export const PromoteJobParamSchema = z.object({
  jobId: z.string().uuid(),
});

export const PromoteJobSchema = z
  .object({
    /**
     * Explicit promote target. Omit both and the job is matched against an
     * existing org by website host then exact name, and an unclaimed institution
     * is created when neither matches.
     */
    target_org_type: z.enum(["business", "institution"]).optional(),
    target_org_id: z.coerce.number().int().positive().optional(),

    /** Promoted services are published by default — a promote is an admin act on reviewed data. */
    publish: z.boolean().default(true),

    /** Run the whole transaction and roll it back, to see the real unresolved list first. */
    dry_run: z.boolean().default(false),
  })
  .refine((v) => !!v.target_org_type === !!v.target_org_id, {
    message: "target_org_type and target_org_id must be given together",
  });

export type PromoteJobInput = Partial<z.infer<typeof PromoteJobSchema>>;
