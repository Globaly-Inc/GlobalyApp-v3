"use client";

import type { Dispatch, SetStateAction } from "react";
import { embedApi, type EmbedContactPrompt, type EmbedEndPrompt } from "../apis";
import { getFingerprint } from "../utils";

/** The contact, end-of-conversation and rating cards' server calls, moved out of EmbedChatView verbatim. */
export function usePromptActions(
  embedKey: string,
  setContactPrompt: Dispatch<SetStateAction<EmbedContactPrompt | null>>,
  setEndPrompt: Dispatch<SetStateAction<EmbedEndPrompt | null>>,
) {
  const submitContact = async (contactName: string, email: string) => {
    await embedApi.submitContact({
      embed_key: embedKey,
      fingerprint: getFingerprint(),
      action: "submit",
      name: contactName,
      email,
    });
  };

  /** Returns whether a summary was actually queued, so the card only promises a real email. */
  const endConversation = async (): Promise<boolean> => {
    const res = await embedApi.confirmConversationEnd({
      embed_key: embedKey,
      fingerprint: getFingerprint(),
      action: "end",
    });
    return res.summary_queued === true;
  };

  const continueConversation = () => {
    // Optimistic, like skipping the contact card: the card goes now and the decision is
    // recorded in the background. A lost post just means the counsellor may offer again
    // sooner than the cooldown intended — not worth blocking the UI on.
    setEndPrompt(null);
    embedApi
      .confirmConversationEnd({ embed_key: embedKey, fingerprint: getFingerprint(), action: "continue" })
      .catch(() => {});
  };

  const rate = (rating: number, comment?: string) => {
    embedApi.submitRating({ embed_key: embedKey, fingerprint: getFingerprint(), rating, comment });
  };

  const skipContact = () => {
    // Optimistic: the card goes now and the decline is recorded in the background. If the
    // post fails the visitor simply gets asked again later, which is the same thing a
    // decline eventually leads to anyway — not worth blocking the UI on.
    setContactPrompt(null);
    embedApi
      .submitContact({ embed_key: embedKey, fingerprint: getFingerprint(), action: "skip" })
      .catch(() => {});
  };

  return { submitContact, endConversation, continueConversation, rate, skipContact };
}
