import assert from "node:assert/strict";
import test from "node:test";
import { project } from "./helpers.mjs";

test("CLI accepts Spanish instead of English using an installed language dictionary", (t) => {
  const fixture = project(t, "spanish", { "dictionaries": { "es": [ "@cspell/dict-es-es" ] } });
  const result = fixture.run("example.md");
  assert.equal(result.status, 0, result.stderr);
});

test("CLI combines English and installed technical dictionaries", (t) => {
  const fixture = project(t, "technical", {
    "dictionaries": { "en": [ "@cspell/dict-en_us", "@cspell/dict-software-terms" ] }
  });
  const result = fixture.run("example.md");
  assert.equal(result.status, 0, result.stderr);
});

test("CLI fails explicitly when a configured dictionary package is not installed", (t) => {
  const fixture = project(t, "basic", { "dictionaries": { "en": [ "@cspell/dict-does-not-exist" ] } });
  const result = fixture.run("example.md");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Cannot find module.*@cspell\/dict-does-not-exist/u);
});
