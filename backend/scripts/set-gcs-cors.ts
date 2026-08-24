/**
 * Reads, and optionally sets, the CORS policy on the storage bucket.
 *
 *   npm run gcs:cors          # show the bucket's current CORS policy
 *   npm run gcs:cors -- apply # write the policy below
 *
 * Why this exists rather than `gcloud storage buckets update --cors-file=...`: the gcloud
 * CLI is a separate install with its own auth, while this uses the exact service-account
 * key the app already runs on (GCS_KEY_FILE), so "the app can write it" and "the app can
 * read the file" cannot disagree.
 *
 * The policy matters because the browser FETCHES stored files directly — pdf.js reads a
 * PDF with fetch(), and a cross-origin fetch without CORS headers fails as
 * "Failed to fetch". `<img src>` and `<iframe src>` are exempt, which is why images from
 * this same bucket render fine while PDFs do not.
 */

import "dotenv/config";
import { Storage } from "@google-cloud/storage";

/** Every origin the browser loads the app from. A missing entry = broken fetches there. */
const ORIGINS = [
  "http://localhost:3001",
  "http://localhost:3000",
  ...(process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

const POLICY = [
  {
    origin: [...new Set(ORIGINS)],
    method: ["GET", "HEAD"],
    // Content-Range/Accept-Ranges are only needed if a client re-enables byte-range
    // requests; the chat PDF viewer disables them, but listing them costs nothing and
    // avoids a second round of this for whatever reads files next.
    responseHeader: ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) throw new Error("GCS_BUCKET_NAME is not set in .env");

  const storage = new Storage({
    projectId: process.env.GCS_PROJECT_ID,
    ...(process.env.GCS_KEY_FILE ? { keyFilename: process.env.GCS_KEY_FILE } : {}),
  });
  const bucket = storage.bucket(bucketName);

  const apply = process.argv.includes("apply");

  if (apply) {
    console.log(`Setting CORS on gs://${bucketName} for:\n  ${POLICY[0]!.origin.join("\n  ")}`);
    await bucket.setCorsConfiguration(POLICY);
    console.log("✓ applied");
  }

  const [metadata] = await bucket.getMetadata();
  const current = metadata.cors ?? [];
  console.log(`\nCurrent CORS on gs://${bucketName}:`);
  console.log(current.length === 0 ? "  (none — browser fetches WILL fail)" : JSON.stringify(current, null, 2));

  if (!apply && current.length === 0) {
    console.log("\nRun `npm run gcs:cors -- apply` to set it.");
  }
}

main().catch((err) => {
  console.error("\n✗ Failed:", err instanceof Error ? err.message : err);
  // A 403 here means the service account lacks storage.buckets.update — the bucket's
  // IAM, not the code. `roles/storage.admin` on the bucket is enough.
  process.exit(1);
});
