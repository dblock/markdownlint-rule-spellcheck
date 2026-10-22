import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("collect creates a sorted unique reviewable dictionary and refuses to overwrite it", (t) => {
  const fixture = project(t, "collect");
  const result = fixture.collect("*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"), expected("collect/example.expected.txt"));
  assert.equal(fixture.read("example.md"), expected("collect/example.md"));
  const again = fixture.collect("*.md");
  assert.equal(again.status, 1);
  assert.match(again.stderr, /EEXIST/u);
  assert.equal(fixture.read(".spellcheck.txt"), expected("collect/example.expected.txt"));
});

test("collect uses selected dictionaries and fails without creating misleading output", (t) => {
  const fixture = project(t, "spanish");
  const result = fixture.collect("*.md", "--dictionary", "@cspell/dict-es-es", "--output", "words.txt");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read("words.txt"), "# Review these candidates: remove typos before using this dictionary.\n");
  const missing = fixture.collect("*.md", "--dictionary", "./missing.txt");
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ENOENT/u);
  assert.throws(() => fixture.read(".spellcheck.txt"), /ENOENT/u);
  const unmatched = fixture.collect("nothing/*.md");
  assert.equal(unmatched.status, 1);
  assert.match(unmatched.stderr, /No Markdown files matched/u);
});
