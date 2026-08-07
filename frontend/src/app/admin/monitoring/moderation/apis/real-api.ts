import { httpGet } from "@/lib/api/http";
import type { ModerationFlag } from "./types";

export const moderationRealApi = {
  getFlags: (): Promise<ModerationFlag[]> => httpGet("/admin/moderation"),
};
