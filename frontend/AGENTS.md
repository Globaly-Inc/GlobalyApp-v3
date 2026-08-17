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
- Mocks are opt-in: they only run when `NEXT_PUBLIC_MOCK_DATA=true`, and a red "MOCK DATA" badge is shown while they are. The real API is the default everywhere else, so write `real-api.ts` against the actual Fastify route (verify it in `backend/src/modules/**/*.routes.ts`).
- If the endpoint genuinely doesn't exist yet, `real-api.ts` still assumes the eventual contract — but add it to `scripts/api-contract-allowlist.json` with the wave that builds it, or `yarn check:api-contract` fails.
- Don't add a folder with nothing real to put in it yet — e.g. skip `utils/` if the feature genuinely has no helper logic.

# Component reuse

Before writing a new component, check whether it already exists as a shared component under
`src/components/` (imported as `@/components/...` — e.g. `@/components/ui/button`,
`@/components/combobox`, `@/components/field-error`). If a matching component already
exists there, reuse it instead of writing a new one.

If no match exists, decide where the new component belongs:
- **Reusable across features** (generic UI with no feature-specific data or business logic —
  buttons, dialogs, form fields, pickers): create it under `src/components/` so other features
  can import it via `@/components/...`.
- **Specific to one feature** (renders that feature's data, dispatches that feature's thunks,
  or otherwise has no use outside it): create it inside that feature's own `components/` folder
  per the structure above, not in `src/components/`.

Don't duplicate a component that already exists in either location under a new name.

# Prefer Combobox over Select

When building any dropdown-list field (category pickers, country pickers, status
pickers, anything selecting one value from a list), default to `@/components/combobox`
(`Combobox`) instead of `@/components/ui/select` (`Select`). Combobox is searchable,
supports an optional per-option `icon` (e.g. a flag), and keeps a consistent `h-10`
trigger height and visual style across the app — `Select`'s trigger defaults to `h-8`
and has no search, which reads as inconsistent next to `Combobox` and `Input` fields
in the same form.

Reach for `Select` only when there's a specific reason `Combobox` doesn't fit (e.g. a
tiny fixed enum rendered inline at a non-standard size, like the `h-8`/`w-[130px]`
sharing-scope picker in `frontend/src/app/admin/platform/businesses/components/link-branch-dialog.tsx`).
Reference for the default pattern: the category/country/phone-code Comboboxes in
`frontend/src/app/admin/platform/businesses/components/business-header-dialog.tsx`.

# Combobox layout

Never wrap a `<Combobox>` (or any field containing it) in a `space-y-*` container.
`space-y-*` applies margin via a sibling selector to EVERY child, including the
invisible `position: fixed` focus-guard `<span>` elements base-ui inserts into
the DOM when the Combobox's popover opens. Inside a `Dialog` (which has a CSS
`transform` on it for centering), those guards visually collapse to zero size,
but their `space-y` margin still inflates the parent's height by ~8px, pushing
every field below it down the moment the dropdown opens/closes — the "gap
appears below the combobox" bug.

Always use `flex flex-col gap-*` for any wrapper div that contains a
`Combobox`, matching `frontend/src/app/personal/profile/personal-details-dialog.tsx`.
Flex `gap` only spaces actual flex-participating boxes, so the out-of-flow
guard spans are ignored.


# Double-fetch on mount (React Strict Mode)

Dev mode double-invokes effects, so a bare `useEffect(() => { dispatch(fetchX()) }, [dispatch])`
fires the request twice on every mount — this has caused repeated duplicate-network-call bugs.

Every `<feature>-view.tsx` that dispatches a fetch-on-mount thunk MUST guard it with a ref:

```tsx
const fetchedRef = useRef(false);
useEffect(() => {
  if (fetchedRef.current) return;
  fetchedRef.current = true;
  dispatch(fetchX());
}, [dispatch]);
```

Reference: `frontend/src/app/admin/platform/categories/components/categories-view.tsx`.
Apply this to every new `-view.tsx` with a mount-time fetch, not just the ones that hit it in testing.


# max Line of code
keep max 300 lines of code
create components to manage line of codes in files 