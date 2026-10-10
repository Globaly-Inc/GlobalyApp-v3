// Run: node --import tsx tests/parse-origin-list.ts
import assert from "node:assert/strict";
import { parseOriginList } from "../src/config";

assert.deepEqual(parseOriginList("http://localhost:3001"), ["http://localhost:3001"]);
assert.deepEqual(
  parseOriginList(" https://web.globalyai.com/, https://app.globalyai.com ,,"),
  ["https://web.globalyai.com", "https://app.globalyai.com"],
);
assert.deepEqual(parseOriginList(""), []);
console.log("parse-origin-list: ok");
