import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("collect creates a sorted unique reviewable dictionary and refuses to overwrite it", (t) => {
  const fixture = project(t, "collect");
  const config = fixture.read(".markdownlint-cli2.jsonc");
  const result = fixture.collect("*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"), expected("collect/example.expected.txt"));
  assert.equal(fixture.read("example.md"), expected("collect/example.md"));
  assert.equal(fixture.read(".markdownlint-cli2.jsonc"), config);
  const again = fixture.collect("*.md");
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /EEXIST/u);
  assert.equal(fixture.read(".spellcheck.txt"), expected("collect/example.expected.txt"));
});

test("collect uses selected dictionaries and fails without creating misleading output", (t) => {
  const fixture = project(t, "spanish", { "dictionaries": { "es": [ "@cspell/dict-es-es" ] } });
  const result = fixture.collect("*.md", "--output", "words.txt");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read("words.txt"), "# Review these candidates: remove typos before using this dictionary.\n");
  fixture.write(".markdownlint.json", JSON.stringify({
    "default": false, "spellcheck": { "dictionaries": { "en": [ "./missing.txt" ] } }
  }));
  const missing = fixture.collect("*.md");
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ENOENT/u);
  assert.throws(() => fixture.read(".spellcheck.txt"), /ENOENT/u);
});

test("collect excludes suppressed vocabulary candidates", (t) => {
  const fixture = project(t, "vocabulary", { "dictionaries": { "en": [ "@cspell/dict-en_us", "./words.txt" ] } });
  const result = fixture.collect("example.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\n");
});

test("formatter uses normal lint configuration and ignores other rules and excluded files", (t) => {
  const fixture = project(t, "collection-config");
  fixture.write(".markdownlint-cli2.jsonc", JSON.stringify({
    "customRules": [ new URL("../../index.mjs", import.meta.url).pathname ],
    "ignores": [ "ignored.md" ],
    "fix": true,
    "config": {
      "default": false,
      "MD024": true,
      "spellcheck": {
        "autocorrect": true,
        "dictionaries": { "en": [ "@cspell/dict-en_us", "./project.txt" ] },
        "markdown": { "frontMatter": { "include": [ "title" ] } }
      }
    }
  }));
  const result = fixture.collect("*.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\n");
  assert.equal(fixture.read("example.md"), expected("collection-config/example.md"));
  const fixed = fixture.format("*.md", "remaining.txt", "--fix");
  assert.equal(fixed.status, 1, fixed.stderr);
  assert.equal(fixture.read("remaining.txt"),
    "# Review these candidates: remove typos before using this dictionary.\n");
});

test("collect fails on malformed lint configuration without creating a dictionary", (t) => {
  const fixture = project(t, "collect");
  fixture.write(".markdownlint-cli2.jsonc", "{ invalid");
  const result = fixture.collect("*.md");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unable to parse/u);
  assert.throws(() => fixture.read(".spellcheck.txt"), /ENOENT/u);
});
