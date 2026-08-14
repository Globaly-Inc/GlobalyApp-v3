import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { aiMemoryApi } from "../apis";
import type { Lesson } from "../apis/types";

export const fetchLessons = createAsyncThunk("dataAiMemory/fetch", () => aiMemoryApi.getLessons());

export const toggleLesson = createAsyncThunk(
  "dataAiMemory/toggle",
  async ({ id, isActive }: { id: string; isActive: boolean }) => {
    await aiMemoryApi.toggleLesson(id, isActive);
    return { id, isActive };
  },
);

export const deleteLesson = createAsyncThunk("dataAiMemory/delete", async (id: string) => {
  await aiMemoryApi.deleteLesson(id);
  return id;
});

type AiMemoryState = {
  lessons: Lesson[];
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: AiMemoryState = { lessons: [], status: "idle", error: null };

const aiMemorySlice = createSlice({
  name: "dataAiMemory",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLessons.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchLessons.fulfilled, (state, action) => {
        state.status = "idle";
        state.lessons = action.payload;
      })
      .addCase(fetchLessons.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load lessons.";
      })
      .addCase(toggleLesson.fulfilled, (state, action) => {
        const { id, isActive } = action.payload;
        state.lessons = state.lessons.map((l) => (l.id === id ? { ...l, is_active: isActive } : l));
      })
      .addCase(deleteLesson.fulfilled, (state, action) => {
        state.lessons = state.lessons.filter((l) => l.id !== action.payload);
      });
  },
});

export const aiMemoryReducer = aiMemorySlice.reducer;
