# GlobalyAI — website

The public marketing site for **GlobalyAI**, hosted on its own domain and
deployed independently of GlobalyApp-v3.

This is variation 6 from the `Globalyai` design repo, extracted verbatim and
served at `/`. Nothing in the design was changed: every source file, style and
asset is a byte-for-byte copy of the finalized variation.

## Where it came from

Cloned from `D:\Globalyhub\Globalyai` on 24 Sep 2026. `src/app/page.tsx` is
`src/app/variation6/page.tsx` from that repo, unmodified — the only change is
the route it sits on, so the finalized variation is the site root rather than
one page among six.

Carried over with it, all unmodified:

| Path | What it is |
| --- | --- |
| `src/components/v6/` | The variation's own components |
| `src/components/site/` | `aly-orb`, `primitives`, `typewriter-word` — shared pieces v6 uses |
| `src/components/demo/` | `film-stage` and its two children, behind the product film |
| `src/hooks/` | `use-reveal`, `use-timeline` |
| `src/lib/` | `site`, `faqs`, `imagery`, `utils` |
| `src/app/layout.tsx`, `globals.css`, `icon.png` | The app shell, fonts, metadata and JSON-LD |
| `public/` | Logo, orb, favicon source, OG image, photography |

`globals.css` is the full stylesheet from the design repo, so it still carries
the rules for variations 2–5 alongside `.v6`. `layout.tsx` likewise still loads
all six font families. Both were kept intact so the page renders identically to
the version that was signed off; trimming them is a safe follow-up, not a
prerequisite for launch.

## Run it

```bash
npm install
npm run dev        # http://localhost:3002
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3002 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (next/core-web-vitals + typescript) |
| `npm run typecheck` | `tsc --noEmit` |

## Before this goes live

- **`siteConfig.url`** in `src/lib/site.ts` is `https://globalyai.com`. It feeds
  the canonical URL, OG tags and JSON-LD — point it at the real domain.
- **The privacy section** states commitments as terms that go into the
  agreement and data processing addendum. No certification is claimed anywhere
  (no SOC 2, ISO 27001, FERPA or GDPR). Worth a legal read before publishing.
- **The embed script tag** in the Integration section is a deliberate
  placeholder. Fill it in once the embed endpoint exists.
- **The motion clips** are not in the repo. They are served from the public
  GCS bucket named by `MOTION_CDN` in `src/lib/imagery.ts`, which
  `next.config.ts` allows `next/image` to read. That bucket has to stay
  public and reachable from production, and the two settings move together.
