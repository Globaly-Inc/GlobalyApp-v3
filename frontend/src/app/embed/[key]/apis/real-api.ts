// Plain fetch throughout — the widget runs on partner sites with no auth
// session, so it must never import the token/refresh HTTP client.

import type { CourseCard } from "@/app/personal/ai/apis/types";
import type { EmbedChatEvent, EmbedPublicConfig, GuestMessageRequest, WireCourseCard } from "./types";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3/ai-chat`;

/** Backend streams cards in prompt format; the shared renderer wants CourseCard. */
function toCourseCard(w: WireCourseCard): CourseCard {
  return {
    id: w.id ?? undefined,
    slug: w.slug ?? null,
    course_name: w.name ?? "",
    institution_name: w.institution ?? "",
    institution_logo_url: w.institution_logo_url ?? null,
    degree_level: w.degree_level ?? "",
    duration: w.duration ?? "",
    annual_tuition_fee: w.fees,
    currency: w.currency ?? "",
    country: w.country ?? "",
    city: w.city ?? null,
    intakes: w.intakes ?? [],
    study_modes: w.study_modes ?? [],
    source_url: w.source_url,
  };
}

export const embedRealApi = {
  resolveConfig: async (key: string): Promise<EmbedPublicConfig> => {
    const res = await fetch(`${BASE_URL}/embed/resolve?key=${encodeURIComponent(key)}`);
    if (!res.ok) throw new Error(res.status === 404 ? "This counsellor is unavailable." : "Failed to load.");
    return res.json();
  },

  /**
   * SSE stream from the public guest endpoint. Named events carry
   * `event:` + `data:` pairs; deltas arrive as data-only OpenAI-format
   * chunks; `data: [DONE]` ends the stream.
   */
  sendMessage: async (
    input: GuestMessageRequest,
    onEvent: (event: EmbedChatEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const res = await fetch(`${BASE_URL}/guest/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error((body as { error?: string } | null)?.error ?? "Something went wrong. Please try again.");
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let eventType = "";

    const emit = (data: string) => {
      if (data === "[DONE]") {
        onEvent({ type: "done" });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // skip malformed events
      }
      if (!eventType) {
        // Data-only line = OpenAI-format delta chunk
        const text = (parsed as { choices?: [{ delta?: { content?: string } }] }).choices?.[0]?.delta?.content;
        if (text) onEvent({ type: "delta", text });
      } else if (eventType === "trace") {
        onEvent({ type: "trace", step: (parsed as { step: string }).step });
      } else if (eventType === "cards") {
        onEvent({ type: "cards", cards: (parsed as WireCourseCard[]).map(toCourseCard) });
      } else if (eventType === "chips") {
        onEvent({ type: "chips", chips: parsed as string[] });
      }
      // session / guest-meta / sources / usage — nothing to render in the widget
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) emit(line.slice(5).trim());
        else if (line === "") eventType = "";
      }
    }
  },
};
