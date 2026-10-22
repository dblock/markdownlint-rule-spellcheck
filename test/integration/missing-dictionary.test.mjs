import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("CLI fails explicitly for a missing project dictionary without changing the file", (t) => {
  const fixture = project(t, "basic", { "dictionaries": [ "@cspell/dict-en_us", "./missing.txt" ], "autocorrect": true });
  const result = fixture.run("--fix", "example.md");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT.*missing\.txt/u);
  assert.equal(fixture.read("example.md"), expected("basic/example.md"));
});
