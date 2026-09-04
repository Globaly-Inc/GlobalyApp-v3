# Persona photos

Face photos for the marketing-page mockups. The components use `AvatarImage`, which falls back to
the person's initials for as long as a photo is missing, so a gap here never breaks a page.

Two of these now live in the public GCS bucket and are referenced from
[lib/public-assets.ts](../../src/lib/public-assets.ts) rather than from this folder — the bucket is
where the marketing assets are maintained, so a repo copy would be a second version of the truth.
The other two are still local because the bucket has no copy of them yet; upload them as
`photos/<file>` and move their entries into `PEOPLE_PHOTOS` to finish the job.

| File | Persona | Served from | Used by |
| --- | --- | --- | --- |
| `aanya-sharma.jpg` | Prospective student, India | this folder | [profile-builder-mockup.tsx](../../src/app/(web)/components/mockups/profile-builder-mockup.tsx) |
| `mei-tanaka.jpg` | STEM Programs Advisor, London UK | this folder | [verified-professionals-mockup.tsx](../../src/app/(web)/components/mockups/verified-professionals-mockup.tsx) |
| `priya-sharma.jpg` | Senior Education Counselor, Sydney AU | GCS bucket | same |
| `daniel-okoye.jpg` | Visa & Admissions Expert, Toronto CA | GCS bucket | same |

Square crops, 256×256 or larger. Use photos you have the rights to — real students/counselors
with their consent, or licensed stock. Renaming a persona means renaming its file too.
