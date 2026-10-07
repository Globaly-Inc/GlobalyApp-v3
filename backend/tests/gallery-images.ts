/**
 * gallery-images — which homepage photos may become an institution's public cover and Media.
 * Pure: markdown / HTML / model picks in, URLs out.
 *
 * What this guards:
 *   - a person's own photo (staff/faculty/student profile, headshot) is never picked, by path or alt,
 *   - another site's image (an ad, a tracker) is never picked; the institution's own subdomains and
 *     known image CDNs are,
 *   - a signed or token-gated link is never picked,
 *   - thumbnails (?w=150, WordPress -150x150.jpg) are skipped,
 *   - the model can only choose from the candidates it was shown, and only campus kinds survive,
 *   - the page's og:image becomes the cover when it passes the same guard,
 *   - an admin-cleared cover ("") or gallery ([]) is never refilled,
 *   - at most 10 photos are kept.
 *
 * Run: npm run test:gallery-images
 */
import {
  chooseOverviewMedia, imageCandidates, isPublicCampusPhoto, mediaPatch, metaImages, pickGalleryImages, MAX_GALLERY_IMAGES,
} from "../src/modules/superadmin/data-extraction/lib/gallery-images.js";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`}`);
}

// ── The original fallback cases (kept from the first version of this check) ──
const kuMd = `
![KU logo](/images/ku-logo.png)
[![Campus](https://ku.edu.np/uploads/campus.jpg)](https://ku.edu.np/about)
![](icons/search.svg)
![Library](uploads/library.webp "Central library")
![Campus again](https://ku.edu.np/uploads/campus.jpg)
![Students](https://cdn.ku.edu.np/students.png?w=1200)
![Graduation](https://ku.edu.np/grad.jpg)
`;
eq(pickGalleryImages(kuMd, "https://ku.edu.np/", "https://ku.edu.np/images/ku-logo.png"), [
  "https://ku.edu.np/uploads/campus.jpg",
  "https://ku.edu.np/uploads/library.webp",
  "https://cdn.ku.edu.np/students.png?w=1200",
  "https://ku.edu.np/grad.jpg",
], "fallback: logo, icon and repeats skipped, relative made absolute, own CDN kept");
eq(pickGalleryImages("no images here", "https://x.com/", null), [], "no images → none");
eq(pickGalleryImages("![a](data:image/png;base64,AAAA)", "https://x.com/", null), [], "data: URI → none");

const SITE = "https://www.uni.edu/";

// ── The guard ──
eq(isPublicCampusPhoto("https://www.uni.edu/images/library-hall.jpg", "Library hall", SITE), true, "own campus photo kept");
eq(isPublicCampusPhoto("https://cdn.uni.edu/img/quad.jpg", "", SITE), true, "own subdomain kept");
eq(isPublicCampusPhoto("https://d1abc.cloudfront.net/quad.jpg", "", SITE), true, "known image CDN kept");
eq(isPublicCampusPhoto("https://www.uni.edu/staff/jane-doe.jpg", "", SITE), false, "headshot by path rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/img/p123.jpg", "Headshot of Prof. Smith", SITE), false, "headshot by alt rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/student-profiles/ana.jpg", "", SITE), false, "student profile rejected");
eq(isPublicCampusPhoto("https://ads.example.com/banner.jpg", "", SITE), false, "off-site ad rejected");
eq(isPublicCampusPhoto("https://www.facebook.com/tr?id=1", "", SITE), false, "tracking pixel rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/a.jpg?X-Amz-Signature=abc&X-Amz-Expires=60", "", SITE), false, "signed S3 URL rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/a.jpg?token=xyz", "", SITE), false, "token URL rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/a.jpg?w=150", "", SITE), false, "?w= thumbnail rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/wp-content/uploads/campus-150x150.jpg", "", SITE), false, "WordPress thumbnail rejected");
eq(isPublicCampusPhoto("https://www.uni.edu/wp-content/uploads/campus-1600x900.jpg", "", SITE), true, "WordPress full size kept");
eq(isPublicCampusPhoto("https://www.uni.edu/logo.png", "", SITE), false, "logo still rejected");

// ── Candidates and the fallback pick ──
const md = [
  "![Campus at dusk](/images/campus.jpg)",
  "![Dean](/faculty/dean.jpg)",
  "![](https://ads.example.com/promo.jpg)",
  "![Lab](https://www.uni.edu/img/lab.jpg)",
  "![Campus at dusk](/images/campus.jpg)",
].join("\n");
eq(imageCandidates(md, SITE, null), [
  { url: "https://www.uni.edu/images/campus.jpg", alt: "Campus at dusk" },
  { url: "https://www.uni.edu/img/lab.jpg", alt: "Lab" },
], "candidates: absolute, guarded, deduped, in page order");
const many = Array.from({ length: 15 }, (_, i) => `![](/img/photo-${i}.jpg)`).join("\n");
eq(pickGalleryImages(many, SITE, null).length, MAX_GALLERY_IMAGES, "fallback keeps at most 10");

// ── The model's picks ──
const candidates = imageCandidates(md, SITE, null);
const media = chooseOverviewMedia(candidates, {
  cover_url: "https://www.uni.edu/img/lab.jpg",
  media_images: [
    { url: "https://www.uni.edu/images/campus.jpg", kind: "campus" },
    { url: "https://www.uni.edu/img/lab.jpg", kind: "portrait" },
    { url: "https://elsewhere.com/invented.jpg", kind: "campus" },
  ],
}, [], SITE);
eq(media.gallery, ["https://www.uni.edu/images/campus.jpg"], "only candidate URLs of campus kinds survive");
eq(media.cover, "https://www.uni.edu/images/campus.jpg", "a cover the model classified as a portrait is refused — first photo instead");
eq(chooseOverviewMedia(candidates, { cover_url: "https://www.uni.edu/img/lab.jpg", media_images: [] }, [], SITE).cover,
  "https://www.uni.edu/img/lab.jpg", "model cover used when it is an unrejected candidate");
eq(chooseOverviewMedia(candidates, { media_images: [{ url: "https://www.uni.edu/img/lab.jpg", kind: "advert" }] },
  ["https://www.uni.edu/img/lab.jpg"], SITE).cover, null, "an og:image the model called an advert is not the cover");
const rejectedAll = chooseOverviewMedia(candidates, { media_images: candidates.map((c) => ({ url: c.url, kind: "portrait" })) }, [], SITE);
eq([rejectedAll.gallery, rejectedAll.classified], [[], true], "every candidate rejected → empty, but classified");
eq(mediaPatch({ cover_url: null, gallery_images: null }, { cover: null, gallery: [], classified: true }),
  { gallery_images: [] }, "a classified empty gallery is stored as [] so nothing refills it");
eq(chooseOverviewMedia([], {}, [], SITE).classified, false, "no candidates → not classified (fallback may run)");
eq(isPublicCampusPhoto("https://www.uni.edu/images/photo%zz.jpg", "", SITE), false, "malformed %-escape skipped, not thrown");
eq(imageCandidates("![](/images/photo%zz.jpg)\n![](/images/ok.jpg)", SITE, null).map((c) => c.url),
  ["https://www.uni.edu/images/ok.jpg"], "one malformed link doesn't stop the others");
const manyCands = Array.from({ length: 15 }, (_, i) => ({ url: `https://www.uni.edu/img/photo-${i}.jpg`, alt: "" }));
eq(chooseOverviewMedia(manyCands, { media_images: manyCands.map((c) => ({ url: c.url, kind: "building" })) }, [], SITE).gallery.length,
  MAX_GALLERY_IMAGES, "model picks capped at 10");

// ── Cover from og:image ──
const html = `<head><meta property="og:image" content="https://www.uni.edu/share/hero.jpg"><meta name="twitter:image" content="/tw.jpg"></head>`;
eq(metaImages(html, SITE), ["https://www.uni.edu/share/hero.jpg", "https://www.uni.edu/tw.jpg"], "og:image and twitter:image read");
eq(chooseOverviewMedia(candidates, {}, metaImages(html, SITE), SITE).cover, "https://www.uni.edu/share/hero.jpg", "og:image chosen as cover");
eq(chooseOverviewMedia(candidates, {}, ["https://www.uni.edu/brand/logo.png"], SITE).cover, null, "a logo og:image is not a cover");

// ── Never refill an admin's decision ──
eq(mediaPatch({ cover_url: "", gallery_images: null }, { cover: "https://www.uni.edu/c.jpg", gallery: ["https://www.uni.edu/g.jpg"] }),
  { gallery_images: ["https://www.uni.edu/g.jpg"] }, "admin-cleared cover not refilled");
eq(mediaPatch({ cover_url: null, gallery_images: [] }, { cover: null, gallery: ["https://www.uni.edu/g.jpg"] }),
  { cover_url: "https://www.uni.edu/g.jpg" }, "admin-cleared gallery not refilled");
eq(mediaPatch({ cover_url: null, gallery_images: null }, { cover: null, gallery: null }), {}, "nothing picked, nothing written");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
