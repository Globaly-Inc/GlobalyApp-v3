# Shared Errors

Typed application error classes that map to HTTP status codes. Caught by `error-handler.plugin.ts` and serialised to JSON responses automatically.

## Location

```
backend/src/shared/errors.ts
```

## Error Classes

All extend the base `AppError` class:

```ts
class AppError extends Error {
  statusCode: number;
  code: string;
}
```

| Class              | HTTP Status | Code           | Default Message  |
| ------------------ | ----------- | -------------- | ---------------- |
| `BadRequestError`  | 400         | `BAD_REQUEST`  | "Bad request"    |
| `UnauthorizedError`| 401         | `UNAUTHORIZED` | "Unauthorized"   |
| `ForbiddenError`   | 403         | `FORBIDDEN`    | "Forbidden"      |
| `NotFoundError`    | 404         | `NOT_FOUND`    | "Not found"      |
| `ConflictError`    | 409         | `CONFLICT`     | "Conflict"       |

## Usage

```ts
import { NotFoundError, BadRequestError } from "../shared/errors.js";

throw new NotFoundError("User not found");
throw new BadRequestError("Invalid email format");
```

Custom messages override the defaults. The error handler plugin reads `statusCode` and `code` from any `AppError` instance and returns:

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "User not found" }
```

Non-`AppError` exceptions become `500 Internal Server Error`.
