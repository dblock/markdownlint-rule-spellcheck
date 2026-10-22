import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("CLI loads the rule, reports source locations, and fixes a Markdown fixture", (t) => {
  const fixture = project(t, "basic", { "autocorrect": true });
  const diagnostic = fixture.run("example.md");
  assert.equal(diagnostic.status, 1, diagnostic.stderr);
  assert.match(diagnostic.stderr, /example\.md:1:3.*spellcheck/u);
  const fixed = fixture.run("--fix", "example.md");
  assert.equal(fixed.status, 0, fixed.stderr);
  assert.equal(fixture.read("example.md"), expected("basic/example.expected.md"));
});
