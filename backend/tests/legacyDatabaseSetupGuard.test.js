import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { setupDatabase } from "../src/config/setupDatabase.js";

const setupUrl = new URL("../src/config/setupDatabase.js", import.meta.url);
const setupPath = fileURLToPath(setupUrl);
const setupSource = readFileSync(setupUrl, "utf8");
const disabledMessage =
  /disabled.*no database operation was attempted.*recovery proof.*versioned migration/is;

test("exported legacy database setup rejects with recovery requirements", async () => {
  await assert.rejects(setupDatabase(), disabledMessage);
});

test("direct legacy database setup invocation exits non-zero with the same guard", () => {
  const result = spawnSync(process.execPath, [setupPath], {
    encoding: "utf8",
    timeout: 5_000,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, disabledMessage);
  assert.equal(result.stdout, "");
});

test("legacy setup source has no database connection or schema execution path", () => {
  assert.doesNotMatch(setupSource, /(?:from|require\s*\()\s*["']pg["']/i);
  assert.doesNotMatch(setupSource, /\b(?:Pool|Client)\b|\.connect\s*\(|\.query\s*\(/);
  assert.doesNotMatch(setupSource, /Schema\.sql|Seed\.sql|readFile/i);
  assert.doesNotMatch(
    setupSource,
    /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i,
  );
});
