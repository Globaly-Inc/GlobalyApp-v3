# Persona photos

Face photos for the marketing-page mockups. The components use `AvatarImage`, which falls back to
the person's initials for as long as a photo is missing, so a gap here never breaks a page.

Every persona photo now lives in the public GCS bucket and is referenced from
[lib/public-assets.ts](../../src/lib/public-assets.ts) rather than from this folder — the bucket is
where the marketing assets are maintained, so a repo copy would be a second version of the truth.
Nothing is served out of this directory any more; it stays only for this note.

| `PEOPLE_PHOTOS` key | Persona | Used by |
| --- | --- | --- |
| `sofiaAlmeida` | Prospective student, Brazil | [profile-builder-mockup.tsx](../../src/app/(web)/components/mockups/profile-builder-mockup.tsx) |
| `elenaMoreau` | STEM Programs Advisor, London UK | [verified-professionals-mockup.tsx](../../src/app/(web)/components/mockups/verified-professionals-mockup.tsx) |
| `priyaSharma` | Senior Education Counselor, Sydney AU | same |
| `danielOkoye` | Visa & Admissions Expert, Toronto CA | same |

To add one: upload a square crop, 256×256 or larger, to the bucket as `photos/<file>`, then add a
key to `PEOPLE_PHOTOS`. Use photos you have the rights to — real students/counselors with their
consent, or licensed stock. The persona name should suit the face in the photo; the same student
appears across the signup, enquiry and profile mockups, so renaming means renaming in all three.
