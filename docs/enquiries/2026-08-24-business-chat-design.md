# Business-side chat + enquiries inbox refresh — design

Date: 2026-08-24
Status: all four phases implemented

## Goal

Give the business side the same chat experience the student side has at `/personal/messages`,
and bring `/business/enquiries` up to the same visual language. Reuse rather than reimplement.

## What the investigation found

Three facts decided the whole design:

1. **The data model is already side-agnostic.** `enquiry_thread_states`, `enquiry_message_stars`
   and `enquiry_message_reactions` are keyed by `user_id → platform_users`, and a business agent
   *is* a `platform_user` (`agents.platform_user_id`). So read cursors, favourites, stars and
   reactions work for business with **no migration**.
2. **The DTO is already side-agnostic.** `EnquiryMessageDto` carries `sender_id`, `sender_name`,
   `sender_avatar`, `is_mine`, `sender_role`, per-viewer `is_starred`, shared `is_pinned`,
   attachments, reply threading and reactions. Nothing needed adding.
3. **Only the membership check differs between sides.** A student proves membership by owning the
   enquiry; a business by being the distribution's business. Everything downstream is identical.

The gap was therefore in the service/route layer only: student had 14 endpoints, business had 2.

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Sequencing | Backend → shared kit → business feature → inbox refresh | Nothing gets built against a contract that might still move |
| Per-thread state | **Per agent**, not per business | Falls out of the existing tables; zero migrations. Costs: a colleague answering doesn't clear your badge — mitigated by the unread rule below |
| Unread definition | Messages **from the student**, after my cursor | A teammate's reply is not mine to action. Mirrors the student's own definition (the other side's messages) |
| `last_message_is_mine` | This agent's own message | A teammate's reply must not render as "You: …" |
| Component reuse | Promote the props-only leaves to `src/components/chat/`; each feature keeps its own containers | Matches `AGENTS.md`'s generic-vs-feature rule without reworking the shipped student containers |
| Messages nav entry | **Ungated** (intended: `enquiries:respond`) | The frontend has no permissions mechanism to gate on — see Phase 3. A view-only agent sees the entry and 403s on the API |

## Phase 1 — backend (implemented)

`messages.service.ts` gained a `Guard` abstraction — a participant check already bound to the
asker — so `edit`, `delete`, `star`, `pin`, `react`, `listReplies` and `sendReply` are each written
once for both sides instead of twice with one line changed. The student-facing exports keep their
exact signatures and order of checks; only the guard is injected.

New business service functions: `listThreadsForBusiness`, `markReadAsBusiness`,
`toggleFavoriteAsBusiness`, `listStarredForBusiness`, `editAsBusiness`, `deleteAsBusiness`,
`listRepliesForBusiness`, `sendReplyAsBusiness`, `toggleReactionAsBusiness`,
`togglePinAsBusiness`, `toggleStarAsBusiness`. `sendAsBusiness` also gained attachment support,
which it previously accepted on the wire and silently dropped.

New repository queries: `listThreadsForBusiness` (counterpart is the student; unread counts the
student's messages) and `listStarredForBusiness` (scoped by `business_id` as well as the star's
`user_id`, so an agent belonging to two businesses can't see one leak into the other). The starred
row carries `student_id` because `sender_role` is derived against it — without it a teammate's
message would be indistinguishable from the student's.

Routes live under `/enquiry-distributions/…` behind
`[requireBusinessContext, requirePermission("enquiries:respond")]`.

### Notable non-obvious details

- `listStarredForBusiness` must be scoped by `business_id`; stars are keyed by user alone.
- `toggleStarAsBusiness` deliberately has no `assertWritable` — a star is a private bookmark and
  stays available on a closed thread, exactly as reading does. Pin and react DO assert it, because
  both change what the other side sees.
- Route shapes `messages/:messageId` and `:id/messages` are unambiguous in find-my-way: static
  segments win at each level, so `POST /enquiry-distributions/<uuid>/messages` and
  `PATCH /enquiry-distributions/messages/<id>` cannot collide.

## Phase 2 — shared chat kit (implemented)

Move the 22 props-only components to a self-contained `src/components/chat/`, with `types.ts`,
`utils.ts`, `markdown.ts`, `emojis.ts`, `draft-store.ts`, `const.ts`. The student feature keeps its
7 containers (`messages-view`, `conversation-view`, `thread-panel`, `unread-view`, `starred-view`,
`forward-message-dialog`, `chat-empty-state`) and only changes imports.

`draft-store` is safe to share: it is keyed by `distribution_id`, which is globally unique, and a
user is only ever one side of any distribution.

Two components needed decoupling rather than just moving: `message-composer` reached for
`messagesApi.uploadAttachment` (now an injected `onUploadAttachment`) and
`forward-message-dialog` read the store directly (now takes `threads` + `onForward`). Both are
what the business side most needed, so leaving them behind would have defeated the exercise.

The slice went the same way. `messages-slice.ts` was 343 lines of reducer logic with nothing
student-specific in it, so it became `createChatSlice({ name, api, selectState })` in the kit and
each feature's store file is now ~40 lines of factory call plus re-exports. The factory also
defines `ChatApi`, the interface both api modules must satisfy — which is what makes them
provably interchangeable.

`conversation-header` had a hardcoded `/personal/enquiries/${id}` link; it now takes
`enquiryHref: string | null` (null hides the item), because the business side files the same
enquiry under its inbox rather than a detail page.

## Phase 3 — `/business/messages` (implemented)

Standard feature folder. Business adaptations:

- Counterpart is the student; sidebar rows show student name + course.
- **Intra-team attribution** — a teammate's message arrives `is_mine: false` with
  `sender_role: "business"`, so the sender name is rendered. This is the one real rendering
  difference from the student side, which collapses all business messages into one identity.
- Closed distributions are read-only (the backend already enforces it).
- `BusinessShell` gained a `FULL_BLEED_ROUTES` list mirroring `PersonalShell`; it had no
  full-bleed concept before. The chat root uses plain height math, **not** the `w-screen` +
  `mx-[calc(50%-50vw)]` trick: that re-centres on the container's centre, which is offset by the
  nav rail, and was the cause of the sidebar-under-rail bug on the student side.
- The height is `h-[calc(100dvh-4rem)]` at every breakpoint, NOT the student's
  `-8rem`/`md:-4rem`. BusinessShell has no mobile bottom nav to clear, so carrying the student's
  extra allowance over would leave a dead 4rem strip under the composer on phones.
- The Messages nav entry is **not** permission-gated. Chat is behind `enquiries:respond`
  server-side, but the frontend has no permissions mechanism at all today — no `permissions` on
  the auth state, no `hasPermission` helper — so building one was out of scope. An agent with
  only `enquiries:view` sees the entry and hits a 403 from the API. Gate it once permissions
  reach the client.

## Phase 4 — enquiries inbox refresh (implemented)

`ENQUIRY_STATUS_STYLES` + `ENQUIRY_STATUS_DOT` now mirror the student side's palette exactly, so
one lifecycle reads identically on both screens, and `EnquiryStatusBadge` is the single place a
status becomes a pill. Cards use the `Card` primitive with the student's initials, an icon'd meta
row (date · intake · N/M unlocked) and the message in its own labelled block.

The seven-across stat grid became `InboxFilters` pills (All / New / In progress / Converted /
Closed) with the same counts. Same information, but a pill is a control — seeing "New 3" and being
unable to click it was the worst of both. Error, empty-list and empty-filter states match the
student side, including the distinction between "no enquiries yet" and "nothing in this filter".

**The inline chat was deleted, not just unlinked.** `distribution-thread.tsx` is gone, and with it
the mini-chat subsystem the enquiries feature was carrying: `fetchDistributionMessages` and
`sendDistributionMessage`, their `messagesByDistribution`/`messagesStatus` state, the
`getMessages`/`sendMessage` api methods on both mock and real, and the mock's thread seeding. That
was a second chat implementation over the same endpoints; keeping it would have guaranteed drift.
The card now deep-links to `/business/messages?thread=<distribution_id>` instead — one place to
read a thread however you reached it, matching the student side's handoff.

## Verification

- `tsc --noEmit` on the backend: clean.
- `tsc --noEmit` on the frontend: clean. `eslint` clean on the kit, both chat features, the
  business shell and the nav const. (`business-shell.tsx` and `personal-shell.tsx` each report one
  pre-existing `react-hooks/set-state-in-effect` on their `setMounted` effect, untouched by this
  work.)
- `src/components/chat/self-check.ts` passes after the extraction — real coverage that the moved
  pure logic (markdown parser, sender grouping, chat serialiser, emoji search, file helpers) still
  behaves.
- `backend/tests/enquiries/messages.ts` gained seven business-side cases (inbox scoping,
  unread-vs-teammate, cross-business isolation, author-only edit/delete, private stars vs shared
  pins, closed-thread read-only, per-agent favourites). Run with `npm run test:enquiry-messages`
  — it needs a live database, so it has **not** been executed yet.
- The business chat has not been exercised against the real API, only against its mock. The mock
  seeds a teammate's message specifically so the intra-team attribution path renders.
