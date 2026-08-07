<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Feature module structure

Every feature lives at its route under `src/app/` and follows this folder shape.
Canonical reference: `src/app/admin/overview/`.

```
src/app/<route>/<feature>/
├── apis/
│   ├── types.ts        # wire types — the API response/request shapes
│   ├── mock-data.ts     # <feature>MockApi — same method names as real, console.log("[mock] ...") + delay(ms)
│   ├── real-api.ts      # <feature>RealApi — httpGet/httpPost/httpPatch/httpDelete from @/lib/api/http
│   └── index.ts          # export const <feature>Api = createApi({ mock, real }) + re-export types
├── store/
│   └── <feature>-slice.ts   # createAsyncThunk(s) calling <feature>Api + createSlice with
│                             # { ...data, status: "idle"|"loading"|"failed", error }
├── const/
│   └── index.ts          # static config (labels, icons, column defs) — may import types/ and apis/types
├── types/
│   └── index.ts          # UI-only types (component props, config shapes) — NOT wire types, those live in apis/types.ts
├── utils/
│   └── index.ts          # pure helper functions specific to this feature
├── components/
│   ├── <feature>-view.tsx   # the main view: dispatches the fetch thunk, composes the smaller pieces
│   └── ...                  # one exported component per file (kebab-case filename, PascalCase export)
├── layout.tsx              # even a pass-through (`return children`) — keeps every feature the same shape
└── page.tsx                 # thin — only renders <FeatureView /> from components/
```

Rules:
- Every one of `apis/`, `store/`, `const/`, `types/`, `utils/`, `components/` is a **folder**, even if it holds a single `index.ts` — don't collapse them into bare files (`consts.ts`, `types.ts`) at the feature root.
- Register the slice's reducer in `src/lib/store.ts` under a distinct state key matching the feature name.
- Default to mock data (`NEXT_PUBLIC_MOCK_DATA`) even when the real backend endpoint doesn't exist yet — `real-api.ts` still assumes the eventual contract.
- Don't add a folder with nothing real to put in it yet — e.g. skip `utils/` if the feature genuinely has no helper logic.
