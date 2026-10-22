import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("Unicode boundaries skip technical tokens and retain original diagnostic ranges", (t) => {
  const fixture = project(t, "unicode", { "autocorrect": true });
  const before = fixture.run("example.md");
  assert.equal(before.status, 1, before.stderr);
  assert.doesNotMatch(before.stderr, /example\.md:3:/u);
  for (const column of [ 2, 8, 13, 20, 33 ]) {
    assert.match(before.stderr, new RegExp(`example\\.md:5:${column} error spellcheck`, "u"));
  }
  fixture.run("--fix", "example.md");
  assert.equal(fixture.read("example.md"), expected("unicode/example.expected.md"));
});

test("Unicode vocabulary collection includes whole accented words and skips technical tokens", (t) => {
  const fixture = project(t, "unicode");
  const result = fixture.collect("example.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\nhélo\nwrld\n");
});
