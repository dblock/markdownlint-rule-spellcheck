import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("CLI --fix remains report-only without autocorrect across multiple files", (t) => {
  const fixture = project(t, "report-only");
  const result = fixture.run("--fix", "*.md");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /first\.md:1:3.*spellcheck/u);
  assert.match(result.stderr, /second\.md:1:3.*spellcheck/u);
  assert.equal(fixture.read("first.md"), expected("report-only/first.md"));
  assert.equal(fixture.read("second.md"), expected("report-only/second.md"));
});
