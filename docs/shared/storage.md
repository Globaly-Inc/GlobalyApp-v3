# Shared Storage — Setup & Structure

File storage layer for uploading, downloading, and managing files in Google Cloud Storage (GCS), with metadata tracked in PostgreSQL.

## Directory

```
backend/src/shared/storage/
  storageService.ts    — GCS operations (upload, signed URLs, delete)
  files.repository.ts  — DB CRUD for the uploaded_files metadata table
```

## Environment Variables

| Variable               | Required | Default | Description                              |
| ---------------------- | -------- | ------- | ---------------------------------------- |
| `GCS_BUCKET_NAME`      | Yes      | —       | GCS bucket name                          |
| `GCS_PROJECT_ID`       | No       | —       | GCP project ID (falls back to ADC)       |
| `GCS_KEY_FILE`         | No       | —       | Path to service-account JSON key file    |
| `GCS_SIGNED_URL_EXPIRY`| No       | `3600`  | Signed URL lifetime in seconds           |
| `GCS_MAX_FILE_SIZE_MB` | No       | `10`    | Max upload size in MB                    |

Config is validated via Zod in `backend/src/config.ts` (lines 50-54).

## Database — `uploaded_files` table

Migration: `backend/database/migrations/globalyapp/20260806_001_uploaded_files.ts`

| Column         | Type      | Notes                                              |
| -------------- | --------- | -------------------------------------------------- |
| `id`           | uuid (PK) | Auto-generated (`gen_random_uuid()`)                |
| `uploaded_by`  | integer   | FK → `platform_users.id`, CASCADE delete            |
| `entity_type`  | text      | `platform_user`, `business`, `institution`, `agent` |
| `entity_id`    | text      | UUID of the owning entity                           |
| `category`     | text      | `profile`, `logo`, `cover`, `gallery`, `document`   |
| `original_name`| text      | Original filename from client                       |
| `storage_path` | text      | Relative path in GCS bucket (unique)                |
| `mime_type`    | text      | MIME type                                           |
| `size_bytes`   | bigint    | File size                                           |
| `created_at`   | timestamp | Auto                                                |
| `updated_at`   | timestamp | Auto                                                |

Index: `idx_uploaded_files_entity` on `(entity_type, entity_id)`.

## storageService.ts — API

### Path convention

`buildPath(...segments, originalFilename)` produces a deterministic, unique relative path:

```
<entity-type>/<entity-uuid>/<category>/<timestamp>-<4hex>.<ext>
```

Examples:
- `platform-users/abc-123/profile/1722945600123-a3f2.jpg`
- `businesses/abc-123/logo/1722945600123-b1c4.png`
- `my_biz_db/agents/abc-123/profile/1722945600123-d2e5.jpg`

The same path is stored in `uploaded_files.storage_path` — no bucket prefix, no absolute URL.

### Functions

| Function                | Purpose                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `buildPath(...segments)`| Build relative storage path with unique filename             |
| `validateFile(mime, size, allowedTypes?)` | Throws `BadRequestError` if MIME or size is invalid |
| `uploadFile(path, buffer, mime)` | Upload buffer to GCS, returns `{ storagePath, sizeBytes, mimeType }` |
| `getSignedUploadUrl(path, mime, expiry?)` | Signed PUT URL for direct client-to-GCS upload |
| `getSignedDownloadUrl(path, name?, expiry?)` | Signed GET URL (`Content-Disposition: attachment`) |
| `getSignedViewUrl(path, expiry?)` | Signed GET URL (`Content-Disposition: inline`)     |
| `deleteFile(path)`      | Delete from GCS (no-ops if already gone)                     |
| `isConfigured()`        | `true` if `GCS_BUCKET_NAME` is set                          |

### Allowed MIME types

Images: `jpeg`, `png`, `webp`, `gif`, `svg+xml`
Documents: `pdf`, `doc`, `docx`, `xls`, `xlsx`
Text: `plain`, `csv`

Custom sets can be passed to `validateFile` for module-specific restrictions.

## files.repository.ts — API

Thin Knex wrapper over the `uploaded_files` table:

| Function                              | Description                          |
| ------------------------------------- | ------------------------------------ |
| `insertFile(data)`                    | Insert new record, returns full row  |
| `findFileById(id)`                    | Lookup by UUID                       |
| `findFileByPath(storagePath)`         | Lookup by storage path               |
| `listFilesByEntity(type, id, category?)` | List files for an entity, newest first |
| `deleteFileRecord(id)`               | Delete metadata row                  |

## Module integration

Each module mounts its own `files.routes.ts` that wires auth + ownership checks to the shared storage layer:

| Module           | Route prefix       | File                                                    |
| ---------------- | ------------------ | ------------------------------------------------------- |
| Platform Users   | `/me/files`        | `modules/platform-users/routes/files.routes.ts`         |
| Businesses       | (business-scoped)  | `modules/businesses/routes/files.routes.ts`             |
| Agents           | (agent-scoped)     | `modules/agents/routes/files.routes.ts`                 |

### Typical upload flow

```
Client (multipart POST)
  → files.routes validates auth + ownership
  → storageService.validateFile(mime, size)
  → storageService.buildPath(entityType, entityUuid, category, filename)
  → storageService.uploadFile(path, buffer, mime)
  → filesRepo.insertFile(metadata)
  → 201 { id, original_name, storage_path, ... }
```

### Typical download/preview flow

```
Client GET /me/files/:id/view  (or /download)
  → files.routes validates auth + ownership
  → filesRepo.findFileById(id)
  → storageService.getSignedViewUrl(path)  (or getSignedDownloadUrl)
  → { url }  (client redirects/fetches the signed URL)
```

### Delete flow

```
Client DELETE /me/files/:id
  → files.routes validates auth + ownership
  → storageService.deleteFile(path)   ← GCS
  → filesRepo.deleteFileRecord(id)    ← DB
  → 204
```

## Local development

If `GCS_BUCKET_NAME` is not set, `isConfigured()` returns `false`. Modules can gate file routes behind this check to avoid crashes in local/test environments without GCS credentials.
