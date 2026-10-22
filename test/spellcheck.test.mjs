import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import rule from "../index.mjs";

function lintContent(content, config = true) {
  return lint({
    "strings": { content },
    "customRules": [ rule ],
    "config": { "default": false, "spellcheck": config }
  }).content;
}

function words(content, config) {
  return lintContent(content, config).map((error) =>
    content.split(/\r\n|\r|\n/u)[error.lineNumber - 1].slice(error.errorRange[0] - 1, error.errorRange[0] - 1 + error.errorRange[1]));
}

test("checks prose in headings, emphasis, lists, quotes, tables, links, and image labels", () => {
  const source = [
    "# helo", "",
    "**mispelled** *helo*", "",
    "- helo", "",
    "> mispelled", "",
    "[helo](https://wrng.invalid) ![mispelled](wrng.png)", "",
    "| helo |", "| --- |", "| mispelled |"
  ].join("\n");
  assert.deepEqual(words(source), [
    "helo", "mispelled", "helo", "helo", "mispelled", "helo", "mispelled", "helo", "mispelled"
  ]);
});

test("skips code, HTML blocks, front matter, URLs, emails, link destinations and reference definitions", () => {
  const source = [
    "---", "layout: wrng", "---", "",
    "`wrng`", "",
    "```ruby", "wrng", "```", "",
    "    wrng", "",
    "<div>wrng</div>", "",
    "<https://wrng.invalid> <person@wrng.invalid>", "",
    "https://wrng.invalid person@wrng.invalid www.wrng.invalid", "",
    "[hello](wrng.md \"wrng\") [hello][wrng]", "",
    "[wrng]: wrng.md \"wrng\""
  ].join("\n");
  assert.deepEqual(lintContent(source), []);
});

test("preserves UTF-16 ranges after Unicode, tabs, inline markup, and CRLF", () => {
  const source = "# 😀 café **helo**\r\n\r\n> \thelo\r\n";
  const errors = lintContent(source);
  assert.equal(errors.length, 2);
  for (const error of errors) {
    const line = source.split("\r\n")[error.lineNumber - 1];
    assert.deepEqual(error.errorRange, [ line.indexOf("helo") + 1, 4 ]);
  }
  assert.equal(applyFixes(source, lintContent(source, { "autocorrect": true })),
    "# 😀 café **hello**\r\n\r\n> \thello\r\n");
});

test("reports repeated words at separate exact source locations", () => {
  const errors = lintContent("helo helo\nmispelled");
  assert.deepEqual(errors.map(({ lineNumber, errorRange }) => [ lineNumber, errorRange ]),
    [ [ 1, [ 1, 4 ] ], [ 1, [ 6, 4 ] ], [ 2, [ 1, 9 ] ] ]);
  assert.match(errors[0].errorDetail, /Suggestions: hello/u);
});

test("does not offer automatic fixes unless explicitly enabled", () => {
  const source = "helo mispelled";
  const errors = lintContent(source);
  assert(errors.every((error) => !error.fixInfo));
  assert.equal(applyFixes(source, errors), source);
  assert.deepEqual(lintContent(source, false), []);
  assert.deepEqual(lintContent("helo", { "enabled": false }), []);
});

test("offers only dictionary-valid one-edit first suggestions for lowercase and title case", () => {
  const source = "helo Helo mispelled HELO heLo xqzvvv";
  assert.equal(applyFixes(source, lintContent(source, { "autocorrect": true })),
    "hello Hello misspelled HELO heLo xqzvvv");
  const sourceWithTranspose = "jumsp";
  const errors = lintContent(sourceWithTranspose, { "autocorrect": true });
  assert.equal(applyFixes(sourceWithTranspose, errors), "jump");
});

test("does not autocorrect dotted, hyphenated, numbered or identifier-like tokens", () => {
  const source = "foo.helo helo-bar helo_name abc123helo helo123 helo";
  assert.equal(applyFixes(source, lintContent(source, { "autocorrect": true })),
    "foo.helo helo-bar helo_name abc123helo helo123 hello");
});

test("does not diagnose entity-encoded word fragments or escape markup", () => {
  assert.deepEqual(lintContent("he&#108;o &amp; \\*hello\\*"), []);
  assert.deepEqual(words("hello &amp; helo"), [ "helo" ]);
});

test("loads explicit case-sensitive vocabulary alongside English and rereads changed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "markdownlint-spellcheck-"));
  try {
    const path = join(dir, "words.txt");
    writeFileSync(path, "# Project vocabulary\n\nmispelled\nZqxvterm\n");
    const config = { "dictionaryFiles": [ path ] };
    assert.deepEqual(words("hello mispelled Zqxvterm zqxvterm", config), [ "zqxvterm" ]);
    writeFileSync(path, "Zqxvterm\n");
    assert.deepEqual(words("mispelled", config), [ "mispelled" ]);
    assert.deepEqual(words("Zqxvterm"), [ "Zqxvterm" ], "vocabulary does not leak across configurations");
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("surfaces invalid configuration and missing or malformed dictionary files", () => {
  assert.throws(() => lintContent("helo", { "dictionaryFiles": "words.txt" }), /dictionaryFiles/u);
  assert.throws(() => lintContent("helo", { "dictionaryFiles": null }), /dictionaryFiles/u);
  assert.throws(() => lintContent("helo", { "autocorrect": "yes" }), /autocorrect/u);
  const dir = mkdtempSync(join(tmpdir(), "markdownlint-spellcheck-"));
  try {
    const path = join(dir, "words.txt");
    assert.throws(() => lintContent("helo", { "dictionaryFiles": [ path ] }), /ENOENT/u);
    writeFileSync(path, "two words\n");
    assert.throws(() => lintContent("helo", { "dictionaryFiles": [ path ] }), /Invalid vocabulary word/u);
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("respects native markdownlint suppression comments", () => {
  const source = "<!-- markdownlint-disable spellcheck -->\nhelo\n<!-- markdownlint-enable spellcheck -->\n\nhelo";
  assert.deepEqual(lintContent(source).map(({ lineNumber }) => lineNumber), [ 5 ]);
});

test("package exports load the actual rule", async () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
  const { default: exported } = await import(packageJson.name);
  assert.equal(exported, rule);
});
