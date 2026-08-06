// Zod schemas for extraction queue endpoints.

import { z } from "zod";

export const QueueStatusQuerySchema = z.object({
  status: z.string().optional(),
});

export const QueueUuidParamSchema = z.object({
  id: z.string().uuid(),
});

export const QueueJobParamSchema = z.object({
  id: z.string().uuid(), // job_id
});
