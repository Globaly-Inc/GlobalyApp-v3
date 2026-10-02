/**
 * withCreatorNames — the portal's "Added by <name>" line.
 *
 * What is worth asserting here is not that a name comes back, it is the three ways the lookup
 * can quietly do the wrong thing: query once for a page rather than once per row, leave a
 * system-written row unattributed rather than inventing an author, and survive an id whose user
 * no longer exists.
 */

process.env.NODE_ENV ??= "test";

import { assert, bound, count, finish, reset, row } from "./institution-memory.harness.js";
import { withCreatorName, withCreatorNames } from "../src/modules/institution-memory/repositories/creator-names.repository.js";

const SELECT_USERS = /^select .* from "public"\."platform_users"/i;

const users = [
  { id: 7, display_name: "Priansu  Koirala", first_name: "Priansu", last_name: "Koirala" },
  { id: 8, display_name: null, first_name: "Likhita", last_name: "Magar" },
  { id: 9, display_name: "   ", first_name: null, last_name: null },
];
const routeUsers: [RegExp, () => unknown[]] = [SELECT_USERS, () => users];

async function run() {
  // ── One query per page, not one per row ────────────────────────────────────
  reset([routeUsers]);
  const named = await withCreatorNames([
    row({ created_by: 7 }), row({ created_by: 7 }), row({ created_by: 8 }), row({ created_by: null }),
  ]);
  assert(count(SELECT_USERS) === 1, "four rows, two distinct authors, one lookup", count(SELECT_USERS));
  assert(named[0].created_by_name === "Priansu Koirala", "display_name wins, doubled spaces collapsed", named[0].created_by_name);
  assert(named[2].created_by_name === "Likhita Magar", "no display_name falls back to first + last", named[2].created_by_name);

  // ── A system-written row has no author, and that is not a lookup failure ───
  assert(named[3].created_by_name === null, "created_by null stays null", named[3].created_by_name);

  // ── Nothing to look up must not hit the database at all ────────────────────
  reset([routeUsers]);
  const anonymous = await withCreatorNames([row({ created_by: null }), row({ created_by: null })]);
  assert(count(SELECT_USERS) === 0, "no ids present, no query issued", count(SELECT_USERS));
  assert(anonymous.every((m) => m.created_by_name === null), "every row still carries the key");

  // Empty page: the helper is called on every list response, including the empty one.
  reset([routeUsers]);
  assert((await withCreatorNames([])).length === 0, "empty page returns empty");
  assert(count(SELECT_USERS) === 0, "empty page issues no query", count(SELECT_USERS));

  // ── An id whose user is gone, and a user whose name is all whitespace ──────
  reset([routeUsers]);
  const missing = await withCreatorName(row({ created_by: 404 }));
  assert(missing.created_by_name === null, "deleted user resolves to null, never undefined", missing.created_by_name);

  reset([routeUsers]);
  const blank = await withCreatorName(row({ created_by: 9 }));
  assert(blank.created_by_name === null, "a blank display_name is null, not an empty string", blank.created_by_name);

  // ── Only the ids actually present are asked for, each once ────────────────
  reset([routeUsers]);
  await withCreatorNames([row({ created_by: 7 }), row({ created_by: 7 }), row({ created_by: 8 }), row({ created_by: null })]);
  const values = bound(SELECT_USERS);
  assert(values.length === 2 && values[0] === 7 && values[1] === 8, "binds each distinct id once", values);

  await finish();
}

run().catch((err) => { console.error(err); process.exit(1); });
