import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("front matter checks strings by default and fixes only safe plain values", (t) => {
  const fixture = project(t, "front-matter", { "autocorrect": true });
  const result = fixture.run("--fix", "example.md");
  assert.equal(result.status, 1, result.stderr);
  assert.equal(fixture.read("example.md"), expected("front-matter/example.expected.md"));
  assert.match(result.stderr, /example\.md:14:11.*Misspelled word: "helo"/u);
});

test("front matter nested include and exclude paths traverse array values", (t) => {
  const fixture = project(t, "front-matter", {
    "markdown": { "frontMatter": { "include": [ "authors", "metadata" ], "exclude": [ "metadata.hidden" ] } }
  });
  const result = fixture.run("example.md");
  assert.equal(result.status, 1, result.stderr);
  for (const line of [ 5, 8, 19 ]) {
    assert.match(result.stderr, new RegExp(`example\\.md:${line}:`, "u"));
  }
  for (const line of [ 2, 3, 9, 13, 14 ]) {
    assert.doesNotMatch(result.stderr, new RegExp(`example\\.md:${line}:`, "u"));
  }
});

test("collection uses decoded YAML vocabulary with code and body exclusions intact", (t) => {
  const fixture = project(t, "front-matter");
  const result = fixture.collect("example.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\nmispelled\nwrng\n");
});

test("default Markdown rules do not check YAML header syntax", (t) => {
  const fixture = project(t, "front-matter");
  fixture.write(".markdownlint-cli2.jsonc", JSON.stringify({
    "customRules": [ new URL("../../src/index.mjs", import.meta.url).pathname ],
    "config": { "default": true }
  }));
  fixture.write("example.md", '---\nlabel: helo\nsummary: "hello"\n---\n\n# Hello\n\nhello\n');
  const result = fixture.run("example.md");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /example\.md:2:8.*spellcheck/u);
  assert.doesNotMatch(result.stderr, /error MD\d+/u);
});
