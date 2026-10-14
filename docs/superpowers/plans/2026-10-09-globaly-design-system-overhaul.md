# Globaly design system overhaul: GlobalyApp + GlobalyAI

Date: 2026-10-09 · Status: **awaiting approval** · Mockups: https://claude.ai/artifact/HMyAfuonMbcK1HJwLkeSEq

Replicate the GlobalyOS-V2 design system in `frontend/` (GlobalyApp) and `globalyai-website/` (GlobalyAI). The work covers tokens, components and page layouts, and fixes the dark mode and visual bugs found in the audit. No backend changes.

Source of truth: `GlobalyOS-V2/apps/web`. Specifically `src/index.css` and `tailwind.config.ts` (app tokens), `src/components/ui/*` (component classes), `src/components/Layout.tsx` and `layout/AppSidebar.tsx` (shell), and `src/styles/site*.css` (marketing and auth). The GlobalyOS-V2 screenshots `globalyos-landing.png` and `globalyos-blog.png` are out of date (serif and indigo), so the CSS is authoritative.

---

## 1. Decisions

The defaults below are applied in the mockups. Items marked **[confirm]** need your yes or no.

| # | Decision | Default | |
|---|---|---|---|
| D1 | Brand accent | Graphite `#404553` (`225 13% 29%`) replaces navy `#012E8A` in both apps. The tenant `primaryColor` override (`theme_settings` cookie) still works, but in light mode only. GlobalyAI keeps azure only on the Aly orb and Aly's chat bubbles. | **[confirm]** |
| D2 | Dark mode scope | All logged-in portal pages get full dark mode (personal, business, admin, AI chat, messages). GlobalyAI **keeps** its existing dark mode and toggle, recoloured to GlobalyOS-V2's dark tokens. GlobalyApp's public pages stay light, as they are today. | decided 2026-10-09 |
| D3 | **Public sites: reskin only** (user direction, 2026-10-09) | GlobalyApp's public pages (`(web)`, auth, invite, join) and all of GlobalyAI keep their current layouts, sections and copy. Only fonts, colours and icons change. The portals get the full GlobalyOS-V2 app language (tokens, components, shell, page layouts). | decided |
| D4 | Root font size | 15px applies only inside the portals, via `html:has([data-shell="portal"]) { font-size: 15px }`, for parity with GlobalyOS-V2. Public pages keep 16px, so nothing on them reflows. | |
| D5 | Fonts | Geist (body), Space Grotesk (headings, weight forced to 500) and Geist Mono via `next/font`. Drops Inter, Fraunces, Plus Jakarta, Nunito and JetBrains Mono. Tenant heading-font override kept via `--heading-font`. | |
| D6 | Primitive library | **Keep Base UI** (`@base-ui/react`) and port GlobalyOS-V2's *class strings*, not its Radix components. Remap `data-[state=open]` to `data-[open]`, `data-[starting-style]` and `data-[ending-style]`. | |
| D7 | 3D icons | Use GlobalyOS-V2's 3D clay icon style for the sidebar rail, mobile nav and marketing objects. **Done:** 17 education icons were generated with Higgsfield, styled from GlobalyOS-V2 references. Another 9 are reused from GlobalyOS-V2 (home, chat, settings, help, people, globe, shield, calendar, files). Set and mapping: `~/GlobalyHub/ai-outputs/globaly-3d-icons/`. Lucide line icons stay for buttons, menus, inputs and empty states, as in GlobalyOS-V2. | |
| D8 | Sharing site CSS | Copy one scoped `site.css` into each app. No shared package for two consumers; revisit if a third appears. | |
| D9 | Out of scope | Backend/API, copy rewrites, new features, the iOS `GlobalyApp/` Xcode project, and building out the 25 placeholder pages. Placeholders get a restyled `ComingSoon` component only. | |

---

## 2. Target design system (summary)

**App language** (port of `index.css` and `ui/*`):
- **Surfaces.** Ground `0 0% 99%`, white cards, hairline borders `216 8% 90%`, whisper shadows (`.04/.06/.10` slate).
- **Primary.** Graphite. Hover fills use `--accent` = `--primary-light` (a neutral tint), never a saturated colour.
- **Colour tokens.** Status tokens are `success/warning/info/destructive`, all AA in both themes. `chart-1..8` is categorical. `priority-*` and `sidebar-*` are included.
- **Type.** 15px root, body 1.6 line-height. PageHeader h1 is 22.5px Space Grotesk 500. Controls are 2.5rem (37.5px) tall.
- **Focus rings.** Inset for fields, offset for buttons.
- **Shell.**
  - Sticky 4rem header with a skip link.
  - 5rem icon rail plus a 200px contextual submenu.
  - `main#main-content`, `px-3 md:px-8`.
  - Mobile: a bottom tab bar plus a "More" sheet, used by **all three** portals.
- **Page rhythm.** Every page starts with `PageHeader` (h1, subtitle, small right-aligned actions, hairline under it), then `PageBody space-y-6`.
- **States.** Skeletons rather than spinners. `EmptyState` uses a single lucide icon in a `primary-light` disc.

**Site language** (port of `site.css`):
- **Palette.** Ground `#FCFCFC`, band `#F3F5F8`, ink `#1E293B`, accent `#404553`.
- **Type.** Body 18px Geist. Headings Space Grotesk 500 at -0.03em. Hero display up to 82px.
- **Layout.** 1200px `.wrap`, 120px sections alternating with `.band`.
- **Shapes.** 28px panels, 20–24px cards, pill buttons and inputs (44/52px).
- **Hero.** Dark field `#1E2333` with floating objects and a typewriter headline.
- **Reusable blocks.** Deep-dive `.dd` rows with a `.stage` product mock, `<details>` FAQ, band CTA, band footer.
- **Motion.** `cubic-bezier(.16,1,.3,1)`, all disabled under reduced motion.

Full token and class reference: `GlobalyOS-V2/apps/web/src/index.css` and `src/styles/site.css`.

---

## 3. Sub-project 1: Foundation (GlobalyApp `frontend/`)

Goal: every existing page picks up the new look through tokens and primitives alone, with no page edits.

### P1.0 Test harness (S)
- Add `@playwright/test` (dev dependency) and `playwright.config.ts` with projects for `1280` and `390` widths, each in `light` and `dark`.
- Add `src/app/dev/visual/[screen]/page.tsx`, a harness that renders primitives and shells. It is gated with `notFound()` in production.
- Add `tests/token-contrast.ts`, a `node:assert` script in the same style as the existing `tests/*.ts`. It checks:
  - status text on the background, and foreground on the solid colour, are at least 4.5:1 in both themes;
  - `chart-N` text is at least 4.5:1.
- Add scripts `test`, `test:visual` and `test:visual:update` to `package.json`.

### P1.1 Tokens and fonts (M)
- **Rewrite `src/app/globals.css`.**
  - `:root` and `.dark` are copied verbatim from GlobalyOS-V2 `index.css` as HSL triplets.
  - `@theme inline` maps `--color-*: hsl(var(--*))` for every token (including `success`, `warning`, `info`, `chart-1..8`, `priority-*`, `ai` and `sidebar-*`), plus the radius `sm/md/lg`, shadows `sm/md/lg/edge-r/edge-t` and `--spacing-header: 4rem`.
  - `@custom-variant dark (&:where(.dark, .dark *))`. This fixes the current selector, which never matches the `.dark` element itself.
  - Base layer: 15px html, body, the h1–h4 rule with forced weight 500, `svg.lucide { stroke-width: 1.75 }`, the 44px coarse-pointer floor, global reduced motion, and the faint resting underline on text links.
  - Delete the raw-triple brand tokens (`--gold`, `--navy`, `--purple-*`, `--primary-bright`) and their marketing utilities (`.btn-gold`, `.gradient-text`, `.hero-*`, `.ai-ring`). Their callers move to site classes in P2.2.
- **Update `src/app/layout.tsx`.** Load Geist, Geist Mono and Space Grotesk through `next/font`, and drop Inter and Fraunces. Set `themeColor` per scheme.

### P1.2 Dark mode plumbing (S)
- Mount the `next-themes` `ThemeProvider` (`attribute="class" defaultTheme="light" enableSystem={false}`) in the root layout, and add `suppressHydrationWarning` on `<html>`.
- Remove the cookie-driven `dark` class and update `theme-toggle.tsx` to use `setTheme`.
- Change the tenant override: emit `--primary` through a `<style>:root:not(.dark){--primary:…}</style>` tag instead of an inline style on `<html>`. This fixes the dark-mode primary that currently never applies.
- `ui/sonner.tsx` then follows the app theme, because the provider now exists.

### P1.3 Restyle the existing 26 primitives (M)
Apply GlobalyOS-V2's class strings (see the reference §5) to the Base UI parts, changing as little as possible:
- **`button`.** Sizes become default h-10, sm h-9, lg h-11, icon h-10 w-10. This fixes `lg` currently being smaller than default. Keep `xs`/`icon-sm` as aliases so call sites don't break.
- **`badge`.** Add `success`, `warning` and `info` variants as tinted pills (`bg-success/15 text-success`).
- **`card`.** Use a `border` instead of `ring-1`. CardTitle becomes `text-lg` Space Grotesk.
- **`input`, `textarea`, `select`.** Add the `FOCUS_RING` inset ring and `READ_ONLY_FIELD`. Add `focus.ts` and `read-only.ts`.
- **`dialog`.**
  - Overlay `bg-black/80`.
  - Add a `size` prop: sm/md/lg/xl/full.
  - Add `DialogShell`, `DialogStickyHeader`, `DialogBody` and `DialogStickyFooter`.
- **`sheet`.** Use the same overlay as dialog. This fixes the black/40 vs black/10 mismatch.
- **`dropdown-menu`, `popover`, `tooltip`, `checkbox`, `switch`, `avatar`, `skeleton`, `accordion`, `progress`, `slider`, `pagination`, `calendar`, `date-picker`, `phone-input`, `input-otp`, `separator`, `label`.** Token and class alignment only.
- Update `AGENTS.md` to match: the Select trigger is h-10, not h-8.

### P1.4 Add missing primitives (M)
These are the primitives that pages need today: `tabs` (segmented), `table` (neutral `bg-muted/60` header, `numeric` cells), `alert`, `alert-dialog` and `ConfirmDialog`, `breadcrumb`, `empty-state`, `page-header`, `page-body`, `list-skeleton` and `card-skeleton`, `radio-group`, `scroll-area`, `toggle` and `toggle-group`, `collapsible`, and `sticky-save-bar`. All are on Base UI.

Skipped until a page needs them: `chart`, `carousel`, `resizable`, `command`, `hover-card`, `drawer`, `form`.

### P1.4b 3D icon assets (S)
- Copy `ai-outputs/globaly-3d-icons/rail/*.webp` (96px, shown at 24px) into `frontend/public/rail/`, and `objects/*.webp` (480px) into `frontend/public/objects/` and `globalyai-website/public/objects/`.
- Add `src/components/rail-glyph.tsx` as a port of GlobalyOS-V2's `RailGlyph`: a 3D image with a lucide fallback.
- Add a `glyph` field to each portal's `nav-config` entries.

### P1.5 Guard rails (S)
- Port the `no-raw-palette` and `no-hex-colour` rules from `GlobalyOS-V2/apps/web/eslint-local-rules.mjs` into `frontend/eslint.config.mjs`. A baseline file (`.eslint-baseline.json`) lets the 307 existing violations pass while blocking new ones. The count ratchets down in P2.5.
- Add a `node:assert` script that fails on arbitrary `rounded-[…]` or `shadow-[…]` in `src/components/ui`.

**Done when:** the visual harness shows every primitive matching the "Design system" artboards in both themes, `yarn build` and `yarn lint` pass, and the existing pages render with the new tokens without any page edits.

---

## 4. Sub-project 2: GlobalyApp page overhaul

### P2.1 One portal shell (M)
- **Replace** `personal/personal-shell.tsx`, `business/business-shell.tsx` and `admin/admin-shell.tsx` with one `src/components/portal-shell/` made of `PortalShell`, `PortalHeader`, `PortalRail`, `PortalSubmenu`, `PortalMobileNav` and `PortalMoreSheet`.
- **Inputs.** Each portal passes its own `nav-config` and header slot (BusinessSwitcher, AdminPortalSwitcher, Credits pill).
- **Desktop layout.**
  - Header h-16, `bg-card/95` with blur, z-40 everywhere.
  - Avatar menu: Profile, Settings, Dark mode switch, Sign out.
  - Rail w-20, active item `bg-primary-light text-primary`.
  - 200px submenu with a 2px active bar.
  - Skip link to a focusable `main#main-content`.
- **Mobile.** Bottom tab bar for all three portals, which fixes **business having no mobile navigation**. The More sheet includes the dark mode switch.
- **Content width.** `max-w-7xl` is opt-in per page, as in GlobalyOS-V2. Admin tables use the full width.
- **Fixes:** the hardcoded red bell dot (now driven by data), the admin raw `<img>` avatar, the mismatched header z-index and blur, and the logo `rounded-[10px]`.

### P2.2 Public pages reskin: fonts, colours, icons only (M)
No layout, section or copy changes. Every `(web)` page (A1–A5, 27 routes) keeps its JSX structure. The change happens in these places:
- **Tokens:** these come for free from P1.1. `--primary` becomes graphite, `bg-primary/5` bands become `#F3F5F8`, and status colours become tokens.
- **Brand utilities in `globals.css`:** keep the class names and change only their colours.

| Class | Today | After |
|---|---|---|
| `--navy` | navy | `#1E2333` (footer and mobile menu) |
| `--purple-dark` | purple | graphite (buttons) and `#1E2333` (CTA band) |
| `.btn-gold` | aqua | white pill with graphite text |
| `.gradient-text` | blue-to-aqua gradient | solid graphite with a soft underline |
| `.highlight-text` | accent tint | `#ECEDF1` marker |
| `.ai-ring` and `.ai-gradient-text` | cyan/violet | graphite/silver |
| `--gold`, `--primary-bright`, `--purple-deep` | brand hues | graphite equivalents |

- **Hardcoded colours on public pages:**
  - `text-amber-300` on the hero's typed word becomes white. Brushed gold `#E3C27A` is the option to compare on the mockup.
  - `slate-*` in the search bar becomes tokens.
  - Arbitrary `hsl(...)` values become tokens.
  - These are the top files from the audit: `pricing-*`, `footer`, `navbar`, `home/page`, `for-students`, `country-hero`.
- **Fonts:** Fraunces becomes Space Grotesk for headings (weight 500; hero h1 600), and Inter becomes Geist. Font sizes stay as they are.
- **Icons:**
  - Decorative icons in tinted wells become 3D objects at the same slot size. Examples: the home stats row (Institutions, Courses, Counselors, Countries, Cities) and the feature cards on the audience pages.
  - Inline lucide icons keep their shapes and get the global 1.75 stroke.
- **Media:** videos and photos are untouched.
- **Mockup:** the "GlobalyApp public (reskin)" canvas page has the spec board, plus `/home` at desktop and 390px.

### P2.3 Auth, invite and onboarding (S)
- **Auth, invite and join (9 routes):** reskin only. The current centred-card layouts stay, and the tokens and fonts from P1.1 apply. A shared `AuthCard` component can replace the 9 copy-pasted wrappers, but only if it renders the same layout.
- **Onboarding wizards:** `/personal/onboarding` and `/business/onboarding` are portal pages, so they follow GlobalyOS-V2's wizard: fixed header with phase pills, a centred step card, and the transition.

### P2.4 Portal pages, in waves by page type (L)
Each wave adopts `PageHeader`, `PageBody` and the new primitives, and removes hand-rolled versions.

| Wave | Type | Count | Pattern | Notes |
|---|---|---|---|---|
| W1 | C2 Data list | 42 | PageHeader, sticky filter strip, `Table` in `border rounded-lg`, pagination footer | Replaces 19 raw `<table>`s and 5 hand-rolled tab bars, which become `ui/tabs` |
| W2 | C4 Create/edit form | 21 | PageHeader with back button, sectioned Card forms (`md:grid-cols-2`), StickySaveBar | Splits the files over 300 lines (`service-form-view` 523, `institution-service-form-view` 578) |
| W3 | C3 Detail with tabs | 9 | PageHeader (back, badges, actions), header card, `Tabs`, read-mode definition grid | |
| W4 | C1 Dashboard | 15 | Greeting hero card (`--gradient-primary`), stat cards, 2/3 + 1/3 grid | Dedupes the weather and world-clock widgets into `src/components/`. **`/business/portal` keeps exactly the content it shows today**; see the mockup. That content is the hero with its setup-progress capsule, start-extraction card, chat widget activity, recent enquiries, setup checklist, quick actions and "Need a hand?". Only the visual design changes. |
| W5 | C5 Settings, C9 Billing, C8 Notifications | 9 + 13 + 3 | Sectioned settings Cards with StickySaveBar; credits balance plus ledger table; notification feed | Many of these are placeholders, so they get the restyled `ComingSoon` |
| W6 | C6 Messages, C7 AI chat, C11 Editor, C12 Preview/embed | 2 + 2 + 2 + 3 | GlobalyOS-V2 chat layout (`w-72` list, flat message rows, rounded-xl composer); AI chat with an Aly composer; editor with toolbar and side panel | `components/chat` is shared, so it is restyled once |

Full route list per type: §8.

### P2.5 Colour and type sweep (M)
- Replace the 527 raw palette usages with tokens. Emerald becomes `success`, amber becomes `warning`, blue becomes `info`, and red becomes `destructive`. `bg-white` becomes `bg-card`, and so on.
- Ratchet the lint baseline down to 0.
- Map the 212 `text-[10px]`/`text-[11px]` occurrences onto the scale (`text-xs`). Rail labels are the only exception that keeps `text-[10px]`, as in GlobalyOS-V2.

### P2.6 Bug list (S)
Fix the 20 audit items that the steps above don't already cover. Examples: double padding on `/admin/settings/integrations`, the `themeColor` mismatch, and the duplicate `weather-widget`.

**Done when:** Playwright visual baselines exist for one route of each type at 1280 and 390 in light and dark, lint has zero raw-palette or hex violations, and a manual QA pass at 390, 768 and 1280 finds no regressions.

---

## 5. Sub-project 3: GlobalyAI (`globalyai-website/`)

### P3.0 Delete dead code (S)
- **CSS:** `globals.css` lines 129–258 and 347–986, plus `.v6-bloom`, `.v6-float` and `.v6-sheen`.
- **Components:** `v6/ask.tsx`, the `Gap`, `Answer`, `HowItWorks` and `Control` sections, and the dead parts of `site/primitives.tsx`.
- **Assets:** 5 unused fonts, 5 unused images, and unused `lib/imagery.ts` exports. The aurora video stays (P3.2).
- None of this is visible; it is removed only because it is unreachable.

### P3.1 Fonts (S)
- Plus Jakarta becomes Space Grotesk (headings, weight 500; hero h1 600), and the body uses Geist.
- Drop the five unused font families from `layout.tsx`.

### P3.2 Colours (M)
Only the `.v6` and `.v6[data-theme="dark"]` token blocks in `globals.css` and the hardcoded hex in components change. Layout, sections and copy stay as they are.

| Token or element | Today | After |
|---|---|---|
| `--primary` | `#012e8a` | `#404553` |
| `--primary-bright` (icons, labels) | `#2f6be0` | `#404553` |
| `--accent` | `#19c6e6` | removed |
| `.v6-gradient` and `.v6-gradient-text` | brand gradient | solid foreground (headline words) or muted-foreground (the second half of headlines) |
| CTA | gradient pill | solid graphite pill, which passes AA |
| Pastel `.v6-tint-*` cards | five pastel colours | two alternating neutrals, `#F3F5F8` and `#ECEDF1` |
| Problem/solution row hues (`--fig`) | five hues | one graphite |
| `--muted-foreground` | `#737C93` | `#545D6E`, which fixes the AA failure |
| Mock chips | `#28c840` | `ok` `#107A48` on `#E7F5EE` |
| Aurora video | blue/aqua | same clip with CSS `filter: grayscale(1)` and lower `--aurora-strength` |
| Dark mode (**kept**) | daily.dev palette | GlobalyOS-V2 dark tokens: bg `#101217`, card `#16181D`, border `#292C33`, CTA a light pill with dark text |

Aly keeps its azure orb and an azure tint on its chat bubbles.

### P3.3 Icons (S)
- The `v6-icon-well` squares in Features (7) and Institutions (5) become 3D objects: files, database, moon, globe, chat, target, shield, clock, funnel, compass and chart. The moon, target, clock and funnel were generated for this.
- The Learning hub keeps its lucide Brain, recoloured.
- Other lucide icons get stroke 1.75.
- The logo needs a graphite wordmark (light) and a white wordmark (dark) to replace the navy PNG and its CSS invert. **Asset needed from you.**

**Done when:** visual baselines exist at 1280 and 390 in light and dark, and Lighthouse accessibility is 100.

---

## 6. Delivery
- **Branches.** One branch per sub-project off `staging` (`design-foundation`, `design-globalyapp-pages`, `design-globalyai`), with one PR per phase. Sub-project 2 depends on 1. Sub-project 3 is independent and can run in parallel.
- **Screenshots.** Every PR attaches before and after shots for the page types it touches, in light and dark.
- **Order:** P1.0–P1.5, then P2.1, then P2.2 and P2.3 in parallel with W1, then W2–W6, then P2.5 and P2.6. P3 runs at any point.
- **Sizing:** S = under a day, M = 1–3 days, L = 3–6 days for one engineer. Sub-project 1 is about 1.5 weeks. Sub-project 2 is about 3 weeks, shorter now that public pages are reskin-only. Sub-project 3 is about 3 days.

## 7. Risks
| Risk | Mitigation |
|---|---|
| The 15px root shrinks every rem-sized element, and some fixed-height layouts may clip | The visual harness plus a QA pass at 3 widths. Pages with `h-[…px]` are reviewed in W1–W6 |
| Removing navy, Fraunces and the tenant look changes the brand for existing tenants | D1 keeps the tenant `primaryColor` override in light mode. Confirm D1 before P1.1 |
| Differences between Base UI and Radix (data attributes, portals) | P1.3 ports classes, not components. The harness covers open, closed and disabled states |
| 140 pages with no existing tests | Waves by page type. Shared primitives first means most pages change without edits |
| Reskin-only public pages keep some non-GlobalyOS patterns (videos, glass, rounded-2xl cards) | Intended (D3). Only fonts, colours and icons change there |

## 8. Route → page type inventory (140 routes)

From the audit. `(ph)` = placeholder page; X1 = redirect only.

- **A1 Landing (6):** `/`, `/home`, `/for-students`, `/for-institutions`, `/for-agents`
- **A2 Content (7):** `/privacy`, `/terms`, `/cookies`, `/blog`, `/blog/[id]`, `/guides`, `/guides/[slug]`
- **A3 Directory (5):** `/search`, `/services`, `/compare`, `/personal/explore`, `/personal/explore/compare`
- **A4 Entity profile (8):** `/institution/[slug]`, `/course/[slug]`, `/country/[slug]`, `/city/[countrySlug]/[citySlug]`, `/business/[subdomain]`, `/service/[serviceId]`, `/visa-service/[slug]`, `/scholarships/[slug]`
- **A5 Pricing (1):** `/pricing`
- **B1 Auth (9):** `/auth/sign-in`, `/auth/sign-up`, `/auth/role-select`, `/auth/accept-invite`, `/invite/agent/accept`, `/invite/business/accept`, `/invite/institution/accept`, `/invite/institution-member/accept`, `/join`
- **B2 Onboarding (2):** `/personal/onboarding`, `/business/onboarding`
- **C1 Dashboard (15):**
  - personal: `/personal/portal`, `/personal/learning` (ph), `/personal/earn/referrals`, `/personal/earn/ambassadors` (ph)
  - business: `/business/portal`, `/business/social`, `/business/lms` (ph), `/business/scribe` (ph), `/business/marketing` (ph)
  - admin: `/admin/portal`, `/admin/overview`, `/admin/marketing/seo`
- **C2 Data list (42):**
  - personal: `/personal/enquiries`, `/personal/earn/services`
  - business: `/business/enquiries`, `/business/ai-widget`, `/business/marketing/{ads,ambassadors,events,representations}` (ph)
  - admin platform: `/admin/platform/{businesses,categories,countries,users}`
  - admin data: `/admin/data/{all-extractions,agentcis-import,ai-knowledge,ai-memory,mara-agents,visas}`
  - admin marketing: `/admin/marketing/{blog,guides,subscribers,ads(ph)}`
  - admin monitoring: `/admin/monitoring/{enquiries,scholarships,other-services,ambassador-programs,events,jobs,moderation,training}`
  - admin revenue: `/admin/revenue/subscriptions/{subscribers,coupons,referrals}` (ph)
- **C3 Detail (9):** `/personal/enquiries/[id]`, `/personal/earn/services/orders/[orderId]`, `/business/profile`, `/business/profile/[businessId]`, `/business/enquiries/[distributionId]/student`, `/admin/platform/businesses/[id]`, `/admin/data/all-extractions/[id]`
- **C4 Form (21):**
  - personal: `/personal/earn/services/new`, `/personal/earn/services/[serviceId]/edit`
  - business: `/business/profile/[businessId]/services/add`, `/business/profile/[businessId]/services/[serviceId]/edit`
  - admin businesses: `/admin/platform/businesses/add`, `/admin/platform/businesses/[id]/services/{add,[serviceId]/edit}`
  - admin institutions: `/admin/platform/institutions/[id]/services/{add,[serviceId]/edit}`
  - admin categories: `/admin/platform/categories/{business,service,other-service}/{new,[id]}`
  - admin countries: `/admin/platform/countries/{new,[id]/edit}`
- **C5 Settings (9):**
  - personal: `/personal/profile`
  - business: `/business/settings` (ph), `/business/settings/ai-embed`, `/business/settings/integrations` (ph)
  - admin: `/admin/profile`, `/admin/settings/integrations`, `/admin/platform/feature-flags`
  - other: `/theme-setup`
- **C6 Messages (2):** `/personal/messages`, `/business/messages`
- **C7 AI chat (2):** `/ai`, `/personal/ai`
- **C8 Notifications / feed (3):** `/personal/notifications` (ph), `/business/notifications` (ph), `/admin/monitoring/monitoring-logs`
- **C9 Credits / billing (13):**
  - personal: `/personal/credits` (ph), `/personal/earn/services/payment-success`
  - business: `/business/credits` (ph), `/business/settings/{subscription,credits,application-charges}` (ph)
  - admin: `/admin/revenue/subscriptions`, `/admin/revenue/subscriptions/credits`, `/admin/revenue/subscriptions/{plans,application-charges}` (ph)
- **C11 Rich editor (2):** `/admin/marketing/blog/new`, `/admin/marketing/blog/[id]/edit`
- **C12 Preview / embed (3):** `/embed/[key]`, `/admin/platform/businesses/[id]/services/[serviceId]/preview`, `/admin/platform/institutions/[id]/services/[serviceId]/preview`
- **X1 Redirect (4):** `/scholarships`, `/personal`, `/personal/earn`, `/admin` (no UI)

## 9. Mockups (canvas pages)
1. **Foundation:** design system sheet in light and dark (tokens, type, every primitive).
2. **Portal:** Dashboard (light and dark), Data list (light and dark), Detail with tabs, Form, Settings, Credits/billing, Notifications, Placeholder.
3. **Full-screen and mobile:** Messages, AI chat, Blog editor, Mobile list, Mobile dashboard.
4. **GlobalyApp public (reskin):** reskin spec board (every old-to-new font, colour and icon mapping for both sites), plus `/home` with its current layout reskinned, at desktop and 390px.
5. **GlobalyAI (reskin):** the current page reskinned, in light, dark and mobile.
6. **Superseded redesigns:** the earlier layout redesigns, kept only for reference. They are not planned.

Every portal artboard has a **Theme** tweak, so any screen can be switched between light and dark.
