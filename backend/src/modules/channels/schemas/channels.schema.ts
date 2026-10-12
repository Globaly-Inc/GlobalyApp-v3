import { z } from "zod";
import { CHANNELS } from "../consts.js";

export const ChannelParamSchema = z.object({ channel: z.enum(CHANNELS) });
export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const ConnectSchema = z.object({
  /** A path on our own web app (e.g. /business/messages/channels); Zernio returns the browser there. */
  return_path: z.string().min(1).max(200),
  /** Reconnect this existing connection instead of adding a new account. */
  reconnect_id: z.number().int().positive().optional(),
});

export const ConfirmSchema = z.object({
  /** From Zernio's redirect. Optional: without it, every account of this channel in our profile is picked up. */
  account_id: z.string().min(1).max(100).optional(),
});

const bool = z.boolean();
export const AiConfigSchema = z.object({
  ai_mode: z.enum(["auto", "suggest"]),
  ai_config: z.object({
    capabilities: z.object({ answer: bool, programs: bool, collect: bool, recommend: bool, escalate: bool }),
    takeover: bool,
    escalation: z.object({ human: bool, unsure: bool, sensitive: bool }),
  }).strict(),
});

export type AiConfigInput = z.infer<typeof AiConfigSchema>;
