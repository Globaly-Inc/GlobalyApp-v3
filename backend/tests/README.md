# Backend tests

`node --test` (Node built-in) via `tsx`. No test framework dependency.

```bash
# one-time: create the scratch database and migrate it
createdb globalyapp_test    # or: CREATE DATABASE globalyapp_test;
DB_NAME=globalyapp_test node --import tsx node_modules/knex/bin/cli.js migrate:latest --knexfile knexfile.ts --env globalyapp

# run
DB_NAME=globalyapp_test npm test
```

**`DB_NAME=globalyapp_test` is not optional.** `resetDb()` truncates every table it touches, so pointing
these at the dev database would wipe it.

Notes:
- `--test-concurrency=1` is required (and set in the `test` script): the files share one database, so
  running them in parallel lets one file's `TRUNCATE` land in the middle of another's test.
- `helpers.ts` builds a lean Fastify app with the core plugins and the modules under test rather than the
  full `buildServer()`, which also starts the pool-eviction timer and the queue workers — those would keep
  the process alive and make these tests depend on LavinMQ being up.
- Requests go through `app.inject()` with a real signed JWT, so the auth plugin, the zod schemas and the
  route handlers are all exercised.

Coverage map (each file states which behaviour it protects):
| File | Protects |
|---|---|
| `completion.test.ts` | all ten completion points reachable; badges never disagree with the percentage; the stored column is refreshed by scoring writes and not by work-experience writes; a client cannot forge the percentage that gates enquiries; the backfill is correct and idempotent |
| `feed.test.ts` | delete/author ownership; forged author rejected; the three visibility rules; cursor paging completeness and stability; reaction add/update/remove semantics and count integrity (including the double-tap race) |
| `invitations.test.ts` | invite authorization by account or verified email; duplicate acceptance idempotency; case-insensitive email matching; token hashing; silent-drift detection; the watermark blind spot the full ID audit closes; idempotent membership repair |
| `home.test.ts` | position confirmation *and* later position changes; own-rows-only counts; the true enquiry total; partial-failure degradation; favourites referential integrity and soft-delete re-add |
| `feed-media.test.ts` | media type allow-list; a post cannot reference media the caller did not upload; media-only vs empty posts; the 4-attachment cap; AI compose strictness and its no-provider-key path |
| `storage-local.test.ts` | the local storage driver: upload → signed URL → read back **with no Authorization header** (as an `<img>` does); tampered/unsigned/expired/repointed signatures refused; path traversal blocked |

The GCS upload and the Gemini call are not exercised (no bucket, no key in test) — the tests cover the rules
around them: ownership, type validation, request shape, and clean degradation when either is absent.
