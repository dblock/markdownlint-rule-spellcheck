import assert from "node:assert/strict";
import test from "node:test";
import { expected, project } from "./helpers.mjs";

test("Liquid exclusions preserve surrounding prose fixes and source positions", (t) => {
  const fixture = project(t, "liquid", { "autocorrect": true });
  const result = fixture.run("example.md");
  assert.equal(result.status, 1, result.stderr);
  for (const location of [ "3:23", "5:23", "9:4", "11:20", "17:4", "19:4" ]) {
    assert.match(result.stderr, new RegExp(`example\\.md:${location} error spellcheck`, "u"));
  }
  assert.doesNotMatch(result.stderr, /Misspelled word: "(?:hiddenwrng|conditionwrng|multilinewrng|inlinewrng|unfinishedwrng)"/u);
  fixture.run("--fix", "example.md");
  assert.equal(fixture.read("example.md"), expected("liquid/example.expected.md"));
});

test("collection ignores Liquid contents but retains unmatched openers and surrounding prose", (t) => {
  const fixture = project(t, "liquid");
  const result = fixture.collect("example.md");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fixture.read(".spellcheck.txt"),
    "# Review these candidates: remove typos before using this dictionary.\nhelo\nunmatchedwrng\n");
});
