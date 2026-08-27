import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { blogApi } from "../apis";
import type { BlogKeyword, BlogKeywordInput, BlogPost, GenerationInput, GenerationJob } from "../apis/types";

// ponytail: single unpaginated fetch + client-side filtering, same technique V2 uses at this
// volume (its own code notes this is fine until the table grows — move to server-side
// filtering/pagination if the post count ever approaches the 100-row cap below).
const ALL_POSTS_LIMIT = 100;

export const fetchPosts = createAsyncThunk(
  "marketingBlog/fetchPosts",
  async () => (await blogApi.getPosts({ limit: ALL_POSTS_LIMIT })).data,
);

export const fetchKeywords = createAsyncThunk(
  "marketingBlog/fetchKeywords",
  () => blogApi.getKeywords(),
);

export const removePost = createAsyncThunk(
  "marketingBlog/removePost",
  async (id: number, { dispatch }) => {
    await blogApi.deletePost(id);
    await dispatch(fetchPosts());
  },
);

export const saveKeyword = createAsyncThunk(
  "marketingBlog/saveKeyword",
  // `id === null` is only ever dispatched from the add-form, which always supplies every field.
  async ({ id, input }: { id: number | null; input: Partial<BlogKeywordInput> }, { dispatch }) => {
    await (id ? blogApi.updateKeyword(id, input) : blogApi.createKeyword(input as BlogKeywordInput));
    await dispatch(fetchKeywords());
  },
);

export const removeKeyword = createAsyncThunk(
  "marketingBlog/removeKeyword",
  async (id: number, { dispatch }) => {
    await blogApi.deleteKeyword(id);
    await dispatch(fetchKeywords());
  },
);

export const startGeneration = createAsyncThunk(
  "marketingBlog/startGeneration",
  (input: GenerationInput) => blogApi.createGeneration(input),
);

export const pollGenerationStatus = createAsyncThunk(
  "marketingBlog/pollGenerationStatus",
  (ids: number[]) => blogApi.getGenerationStatus(ids),
);

type BlogState = {
  posts: BlogPost[];
  keywords: BlogKeyword[];
  status: "idle" | "loading" | "failed";
  error: string | null;
  generationJobs: GenerationJob[];
};

const initialState: BlogState = {
  posts: [],
  keywords: [],
  status: "idle",
  error: null,
  generationJobs: [],
};

const blogSlice = createSlice({
  name: "marketingBlog",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPosts.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchPosts.fulfilled, (state, action) => {
        state.status = "idle";
        state.posts = action.payload;
      })
      .addCase(fetchPosts.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load blog posts.";
      })
      .addCase(fetchKeywords.fulfilled, (state, action) => {
        state.keywords = action.payload;
      })
      .addCase(startGeneration.fulfilled, (state, action) => {
        state.generationJobs = action.payload.jobIds.map((id) => ({ id, status: "pending" as const, error: null, blog_post_id: null }));
      })
      .addCase(pollGenerationStatus.fulfilled, (state, action) => {
        state.generationJobs = action.payload;
      });
  },
});

export const blogReducer = blogSlice.reducer;
