// Zod schemas for promote endpoint.

import { z } from "zod";

export const PromoteJobParamSchema = z.object({
  jobId: z.string().uuid(),
});
