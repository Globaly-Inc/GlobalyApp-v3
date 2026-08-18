// Zod schema for aggregator extraction request.

import { z } from "zod";
import { webUrl } from "../../../../shared/url.js";

export const AggregatorExtractSchema = z.object({
  url: webUrl(),
});

export type AggregatorExtractInput = z.infer<typeof AggregatorExtractSchema>;
