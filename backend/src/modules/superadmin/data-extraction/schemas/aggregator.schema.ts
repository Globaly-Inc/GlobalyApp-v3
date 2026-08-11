// Zod schema for aggregator extraction request.

import { z } from "zod";

export const AggregatorExtractSchema = z.object({
  url: z.string().url(),
});

export type AggregatorExtractInput = z.infer<typeof AggregatorExtractSchema>;
