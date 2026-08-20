import { ApiError } from "@/lib/api/http";
import type { RegisterParams } from "./types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ponytail: module-level Set, not a DB — fine for a mock that only needs to survive one session.
const registered = new Set<string>();

export const comingSoonMockApi = {
  register: async ({ name, email, type }: RegisterParams): Promise<void> => {
    console.log("[mock] POST /waitlist", { name, email, type });
    await delay(500);
    const key = `${email.trim().toLowerCase()}:${type}`;
    if (registered.has(key)) {
      throw new ApiError(`You're already registered as ${type}.`, "CONFLICT");
    }
    registered.add(key);
  },
};
