import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { coursesApi } from "../apis";
import type { Course } from "../apis/types";
import type { RootState } from "@/lib/store";

export const fetchCourses = createAsyncThunk(
  "courses/fetchAll",
  async (page: number = 1) => {
    const list = await coursesApi.listCourses(page, 20);
    return { courses: list.data, meta: list.meta };
  },
  { condition: (_, { getState }) => (getState() as RootState).courses.status !== "loading" },
);

type CoursesMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type CoursesState = {
  items: Course[];
  meta: CoursesMeta;
  status: "idle" | "loading" | "failed";
  error: string | null;
};

const initialState: CoursesState = {
  items: [],
  meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
  status: "idle",
  error: null,
};

const coursesSlice = createSlice({
  name: "courses",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCourses.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchCourses.fulfilled, (state, action) => {
        state.status = "idle";
        state.items = action.payload.courses;
        state.meta = action.payload.meta;
      })
      .addCase(fetchCourses.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load courses";
      });
  },
});

export const coursesReducer = coursesSlice.reducer;
