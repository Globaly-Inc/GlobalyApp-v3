"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FOLLOW_UP_CHOICES, INITIATIVE_CHOICES, LANGUAGE_CHOICES, LEAD_CHOICES, LENGTH_CHOICES,
  RECOMMENDATION_CHOICES, SCALE_CHOICES, STYLE_CHOICES, TONE_CHOICES, UNCERTAINTY_CHOICES,
} from "../const";
import type {
  BehaviourProfile, CollectionRules, LearningRules, PatchRackProfileInput, RackProfile, VoiceProfile,
} from "../apis/types";
import { ChoiceRow, ToggleRow } from "./setting-row";
import { CollectionCard } from "./collection-card";

/**
 * The Rack's settings, as one draft saved in one go.
 *
 * State initialises from props at mount, and the caller remounts this on `key={version}` after a
 * save — so there is no reset effect, which this repo's eslint treats as an error and which is
 * the wrong tool anyway.
 */
export function RackProfileForm({
  profile, saving, onSave,
}: Readonly<{
  profile: RackProfile;
  saving: boolean;
  onSave: (patch: Omit<PatchRackProfileInput, "expected_version">) => void;
}>) {
  const [voice, setVoice] = useState<VoiceProfile>(profile.voice);
  const [behaviour, setBehaviour] = useState<BehaviourProfile>(profile.behaviour);
  const [collection, setCollection] = useState<CollectionRules>(profile.collection);
  const [learning, setLearning] = useState<LearningRules>(profile.learning);

  const dirty = JSON.stringify({ voice, behaviour, collection, learning })
    !== JSON.stringify({ voice: profile.voice, behaviour: profile.behaviour, collection: profile.collection, learning: profile.learning });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold">How it sounds</h2>
        <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
          Applied to every reply your widget gives. These beat anything your counsellor has
          picked up about style from conversations.
        </p>
        <ChoiceRow
          label="Tone" options={TONE_CHOICES} value={voice.tone} disabled={saving}
          onChange={(tone) => setVoice({ ...voice, tone: tone as VoiceProfile["tone"] })}
        />
        <ChoiceRow
          label="Reply length" options={LENGTH_CHOICES} value={voice.response_length} disabled={saving}
          onChange={(v) => setVoice({ ...voice, response_length: v as VoiceProfile["response_length"] })}
        />
        <ChoiceRow
          label="Formality" hint="1 is first names and contractions. 5 is titles and no contractions."
          options={SCALE_CHOICES} value={String(voice.formality)} disabled={saving}
          onChange={(v) => setVoice({ ...voice, formality: Number(v) })}
        />
        <ChoiceRow
          label="Warmth" hint="1 is strictly transactional. 5 acknowledges what they are trying to do."
          options={SCALE_CHOICES} value={String(voice.warmth)} disabled={saving}
          onChange={(v) => setVoice({ ...voice, warmth: Number(v) })}
        />
        <ToggleRow
          label="Show course cards"
          hint="Off means courses are described in prose instead."
          checked={voice.use_cards} disabled={saving}
          onChange={(use_cards) => setVoice({ ...voice, use_cards })}
        />
        <ChoiceRow
          label="Reply language"
          hint="English unless you change it. Pick “Match the visitor’s language” to answer in whatever they write in."
          options={LANGUAGE_CHOICES} value={voice.language} disabled={saving}
          onChange={(language) => setVoice({ ...voice, language })}
        />
      </div>

      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold">How it counsels</h2>
        <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
          What your counsellor does when it has a choice — not what it is allowed to claim, which
          never changes.
        </p>
        <ChoiceRow
          label="Approach" options={STYLE_CHOICES} value={behaviour.counselling_style} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, counselling_style: v as BehaviourProfile["counselling_style"] })}
        />
        <ChoiceRow
          label="Follow-up questions" options={FOLLOW_UP_CHOICES} value={behaviour.ask_follow_ups} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, ask_follow_ups: v as BehaviourProfile["ask_follow_ups"] })}
        />
        <ChoiceRow
          label="Explaining a recommendation" options={RECOMMENDATION_CHOICES}
          value={behaviour.explain_recommendations} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, explain_recommendations: v as BehaviourProfile["explain_recommendations"] })}
        />
        <ChoiceRow
          label="When it doesn't know" options={UNCERTAINTY_CHOICES} value={behaviour.uncertainty} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, uncertainty: v as BehaviourProfile["uncertainty"] })}
        />
        <ChoiceRow
          label="Asking for contact details" options={LEAD_CHOICES} value={behaviour.lead_approach} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, lead_approach: v as BehaviourProfile["lead_approach"] })}
        />
        <ChoiceRow
          label="Raising things unprompted" options={INITIATIVE_CHOICES} value={behaviour.initiative} disabled={saving}
          onChange={(v) => setBehaviour({ ...behaviour, initiative: v as BehaviourProfile["initiative"] })}
        />
      </div>

      <CollectionCard
        collection={collection}
        disabled={saving}
        onChange={(next) => setCollection({ ...collection, ...next })}
      />

      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold">Learning</h2>
        <p className="mt-0.5 mb-2 text-xs text-muted-foreground">
          Nothing learned is ever used until you approve it, or until enough separate visitors
          have shown the same thing.
        </p>
        <ToggleRow
          label="Learn from finished conversations"
          hint="Suggests counselling techniques and common concerns for you to review. Never facts, and never anything about an individual."
          checked={learning.auto_learn} disabled={saving}
          onChange={(auto_learn) => setLearning({ ...learning, auto_learn })}
        />
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <Button
          disabled={saving || !dirty}
          onClick={() => onSave({ voice, behaviour, collection, learning })}
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  );
}
