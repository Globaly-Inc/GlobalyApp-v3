# Shared Pagination

Query-param parsing and paginated response builder.

## Location

```
backend/src/shared/pagination.ts
```

## API

### `PaginationSchema`

Zod schema for parsing `?page=&limit=` query params:

| Param   | Type    | Default | Constraints   |
| ------- | ------- | ------- | ------------- |
| `page`  | integer | `1`     | min 1         |
| `limit` | integer | `20`    | min 1, max 100 |

### `paginationToOffset(input)`

Converts `{ page, limit }` to `{ limit, offset }` for SQL queries.

```ts
paginationToOffset({ page: 3, limit: 20 })
// → { limit: 20, offset: 40 }
```

### `buildPaginatedResponse(data, total, input)`

Wraps query results in a standard envelope:

```json
{
  "data": [...],
  "meta": {
    "page": 3,
    "limit": 20,
    "total": 157,
    "totalPages": 8
  }
}
```

## Usage

```ts
import { PaginationSchema, paginationToOffset, buildPaginatedResponse } from "../shared/pagination.js";

const input = PaginationSchema.parse(req.query);
const { limit, offset } = paginationToOffset(input);

const [data, total] = await Promise.all([
  repo.list(limit, offset),
  repo.count(),
]);

return buildPaginatedResponse(data, total, input);
```
