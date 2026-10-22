import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("CLI resolves vocabulary from project cwd and honors suppression while fixing prose", (t) => {
  const fixture = project(t, "vocabulary", { "dictionaries": [ "@cspell/dict-en_us", "./words.txt" ], "autocorrect": true });
  const result = fixture.run("--fix", "example.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read("example.md"), expected("vocabulary/example.expected.md"));
  const clean = fixture.run("example.md");
  assert.equal(clean.status, 0, clean.stderr);
});
