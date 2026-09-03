import { httpPost } from "@/lib/api/http";
import type { RegisterParams } from "./types";

export const comingSoonRealApi = {
  register: ({ name, email, type }: RegisterParams): Promise<void> =>
    httpPost("/waitlist", { name: name.trim(), email: email.trim().toLowerCase(), type }),
};
