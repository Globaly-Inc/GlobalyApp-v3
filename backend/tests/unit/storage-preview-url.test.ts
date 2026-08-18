// resolvePreviewUrl is the shared "preview this image" chokepoint: geo, businesses,
// blog and every other module route their stored image columns through it.
//
// Gate 3 found it 500-ing `GET /api/v3/countries/:slug` and `/api/v3/cities/:slug`
// on 191 of 198 migrated countries and 338 cities. The cause is not the geo read:
// V1's image columns hold ABSOLUTE external URLs (pexels, unsplash, supabase), and
// signing one as if it were a GCS object throws. A read endpoint must never 500
// because a picture could not be signed.
//
// No GCS mocking here on purpose. The unit env leaves GCS_BUCKET_NAME unset, which
// is exactly the "signing is not going to work" condition the fail-soft path exists
// for — and it makes the test run anywhere, which is what the unit project is for.

import { describe, expect, it } from "vitest";

import { isConfigured, resolvePreviewUrl, toStoragePath } from "../../src/shared/storage/storageService.js";

describe("resolvePreviewUrl", () => {
  it("has no bucket configured, which is what makes the signing path fail here", () => {
    expect(isConfigured()).toBe(false);
  });

  it.each([
    "https://images.pexels.com/photos/2325446/pexels-photo-2325446.jpeg",
    "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be",
    "http://legacy.example.com/hero.png",
  ])("hands back the absolute external URL %s untouched", async (url) => {
    // A V1 hero_image_url is already a URL a browser can fetch. It is not a storage
    // path, so there is nothing to sign — signing it is what produced the 500.
    await expect(resolvePreviewUrl(url)).resolves.toBe(url);
  });

  it("keeps the query string of an external URL, because it is part of the image", async () => {
    // Unsplash/supabase render params live in the query. toStoragePath() strips the
    // query before looking for a bucket marker, so the passthrough must return the
    // ORIGINAL value rather than the stripped one.
    const url = "https://images.unsplash.com/photo-1523482580672?w=1600&auto=format&fit=crop";
    await expect(resolvePreviewUrl(url)).resolves.toBe(url);
  });

  it("still treats a GCS public URL as a storage object, not as an external URL", async () => {
    // The passthrough must not swallow the legacy case toStoragePath() exists for:
    // this IS a bucket object, so it goes to the signer (which, unconfigured, fails
    // soft to null) instead of being echoed back as a permanent public link.
    const gcs = "https://storage.googleapis.com/globaly-bucket/public/countries/1/hero/x.jpg";
    expect(toStoragePath(gcs)).toBe("public/countries/1/hero/x.jpg");
    await expect(resolvePreviewUrl(gcs)).resolves.toBeNull();
  });

  it("fails soft to null when a relative storage path cannot be signed", async () => {
    // Same convention as the marketplace cover_url helper: one unsignable image
    // degrades that image, never the whole response.
    await expect(resolvePreviewUrl("public/countries/1/hero/1722945600123-a3f2.jpg")).resolves.toBeNull();
  });

  it.each([null, undefined, ""])("resolves %s to null", async (value) => {
    await expect(resolvePreviewUrl(value)).resolves.toBeNull();
  });

  it("rejects a script-bearing scheme instead of echoing it into an <img src>", async () => {
    // isWebUrl's allowlist is closed for a reason (see shared/url.ts): the resolved
    // value is rendered straight into the page. A javascript:/data: value is not a
    // web URL, so it must fall through to the storage path and fail soft.
    await expect(resolvePreviewUrl("javascript:alert(1)")).resolves.toBeNull();
    await expect(resolvePreviewUrl("data:text/html,<script>alert(1)</script>")).resolves.toBeNull();
  });
});
