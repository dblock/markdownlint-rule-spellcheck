import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import formatter from "markdownlint-rule-spellcheck/vocabulary-formatter";

test("formatter defaults to a cwd-relative candidate file when no output path is configured", async () => {
  const writes = [];
  await formatter({
    "directory": process.cwd(),
    "results": [],
    "fsPromises": { "writeFile": async (...args) => writes.push(args) },
    "logMessage": () => {}
  });
  assert.deepEqual(writes, [ [
    resolve(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\n",
    { "flag": "wx" }
  ] ]);
});

test("formatter rejects invalid output paths and unrecognized spelling diagnostics before writing", async () => {
  const options = {
    "directory": process.cwd(),
    "results": [],
    "fsPromises": { "writeFile": async () => assert.fail("must not write") },
    "logMessage": () => assert.fail("must not report success")
  };
  for (const output of [ "", " ", null, 42 ]) {
    await assert.rejects(formatter(options, output), /nonempty string/u);
  }
  await assert.rejects(formatter({
    ...options,
    "results": [ { "ruleNames": [ "spellcheck" ], "errorDetail": "Rule threw an exception." } ]
  }), /Cannot collect spelling candidate/u);
});
