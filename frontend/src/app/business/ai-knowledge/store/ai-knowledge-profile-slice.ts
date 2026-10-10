// The Knowledge Rack's configuration half — voice, behaviour, data-collection rules.
//
// Its own slice beside the memory and review ones for the same reason those are separate: saving
// a voice setting must not disturb a filter the memory list has open, and vice versa.

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiKnowledgeApi } from "../apis";
import type { PatchRackProfileInput, RackProfile } from "../apis/types";

export const fetchRackProfile = createAsyncThunk("aiKnowledgeProfile/fetch", () =>
  aiKnowledgeApi.getProfile(),
);

export const saveRackProfile = createAsyncThunk(
  "aiKnowledgeProfile/save",
  async (patch: PatchRackProfileInput, { dispatch, rejectWithValue }) => {
    try {
      return await aiKnowledgeApi.updateProfile(patch);
    } catch (err) {
      // Re-read on a conflict so the editor shows the version it now has to merge against,
      // rather than leaving a stale draft on screen beside an error about it.
      dispatch(reloadAfterConflict());
      return rejectWithValue(err instanceof Error ? err.message : "Couldn't save that.");
    }
  },
);

/** The re-read a conflicting save triggers. Separate thunk so it cannot be mistaken for the
 *  mount fetch and reset `status` under the form. */
export const reloadAfterConflict = createAsyncThunk("aiKnowledgeProfile/reload", () =>
  aiKnowledgeApi.getProfile(),
);

type AiKnowledgeProfileState = {
  profile: RackProfile | null;
  /** False while the institution is still on the defaults — the page says so. */
  configured: boolean;
  version: number;
  status: "idle" | "loading" | "failed";
  saveStatus: "idle" | "loading" | "failed";
  /** Set after a successful save so the form can confirm without a toast library. */
  savedAt: string | null;
  error: string | null;
};

const initialState: AiKnowledgeProfileState = {
  profile: null,
  configured: false,
  version: 0,
  status: "idle",
  saveStatus: "idle",
  savedAt: null,
  error: null,
};

const aiKnowledgeProfileSlice = createSlice({
  name: "aiKnowledgeProfile",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchRackProfile.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchRackProfile.fulfilled, (state, action) => {
        state.status = "idle";
        state.profile = action.payload.profile;
        state.configured = action.payload.configured;
        state.version = action.payload.version;
      })
      .addCase(fetchRackProfile.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Couldn't load your counsellor's settings.";
      })
      .addCase(saveRackProfile.pending, (state) => {
        state.saveStatus = "loading";
        state.error = null;
      })
      .addCase(saveRackProfile.fulfilled, (state, action) => {
        state.saveStatus = "idle";
        // The server's own row, not the patch — it is the authority on what the merge produced.
        state.profile = action.payload.profile;
        state.configured = action.payload.configured;
        state.version = action.payload.version;
        state.savedAt = new Date().toISOString();
      })
      .addCase(saveRackProfile.rejected, (state, action) => {
        state.saveStatus = "failed";
        state.error = action.error.message ?? "Couldn't save that.";
      })
      // A 409 means someone else saved while this editor was open. The thunk re-reads, and this
      // lands their version in the store — so the form remounts on the new `version` and the
      // person sees what they are now editing against instead of a stale draft.
      .addCase(reloadAfterConflict.fulfilled, (state, action) => {
        state.profile = action.payload.profile;
        state.configured = action.payload.configured;
        state.version = action.payload.version;
      });
  },
});

export const aiKnowledgeProfileReducer = aiKnowledgeProfileSlice.reducer;
