import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { createSpellingDictionaryFromTrieFile } from "cspell-dictionary";
import test from "node:test";
import { applyFixes } from "markdownlint";
import { lint } from "markdownlint/sync";
import rule, { createRule } from "../index.mjs";

function lintContent(content, config = true) {
  return lint({
    "frontMatter": null,
    "strings": { content },
    "customRules": [ rule ],
    "config": { "default": false, "spellcheck": config }
  }).content;
}

function words(content, config) {
  return lintContent(content, config).map((error) =>
    content.split(/\r\n|\r|\n/u)[error.lineNumber - 1].slice(error.errorRange[0] - 1, error.errorRange[0] - 1 + error.errorRange[1]));
}

test("collection mode reports identical ranges without suggestions or fixes", () => {
  const content = "helo mispelled";
  const errors = lint({
    "strings": { content },
    "customRules": [ createRule({ "suggestions": false }) ],
    "config": { "default": false, "spellcheck": { "autocorrect": true } }
  }).content;
  assert.deepEqual(errors.map(({ errorRange }) => errorRange),
    lintContent(content).map(({ errorRange }) => errorRange));
  assert(errors.every((error) => !error.fixInfo && !error.errorDetail.includes("Suggestions:")));
});

test("reuses English suggestions across files without changing diagnostics", (t) => {
  const require = createRequire(import.meta.url);
  const dictionary = createSpellingDictionaryFromTrieFile(
    gunzipSync(readFileSync(new URL("./en_US.trie.gz", pathToFileURL(require.resolve("@cspell/dict-en_us"))))),
    "test", "test", {}
  );
  const spy = t.mock.method(Object.getPrototypeOf(dictionary), "suggest", () => []);
  const first = lintContent("spelingg");
  const second = lintContent("spelingg");
  assert.deepEqual(second, first);
  assert.equal(spy.mock.calls.filter(({ arguments: args }) => args[0] === "spelingg").length, 1);
  for (let index = 0; index < 256; index++) {
    lintContent(`qzxcache${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}`);
  }
  assert.deepEqual(lintContent("spelingg"), first);
  assert.equal(spy.mock.calls.filter(({ arguments: args }) => args[0] === "spelingg").length, 2);
});

test("local dictionary edits invalidate suggestions as well as accepted words", () => {
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-fresh-suggestions-"));
  try {
    const path = join(dir, "words.txt");
    const config = { "dictionaries": { "en": [ path ] }, "autocorrect": true };
    writeFileSync(path, "cat\n");
    assert.equal(applyFixes("cot", lintContent("cot", config)), "cat");
    writeFileSync(path, "cut\n");
    assert.equal(applyFixes("cot", lintContent("cot", config)), "cut");
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

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

test("skips code, HTML blocks, disabled front matter, URLs, emails, link destinations and reference definitions", () => {
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
  assert.deepEqual(lintContent(source, { "markdown": { "frontMatter": false } }), []);
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

test("skips whole numeric and connector tokens and preserves apostrophe and accent ranges", () => {
  assert.deepEqual(words("helo‿wrld helo＿wrld １２helo helo² can't2stop helo_name"), []);
  assert.deepEqual(words("'helo' ‘helo’ helo-wrld _helo_ café hélo"),
    [ "helo", "helo", "helo", "wrld", "helo", "hélo" ]);
  assert.deepEqual(lintContent("can't can’t world's world’s"), []);
});

test("Liquid ranges cross Markdown tokens and CRLF while preserving visible UTF-16 columns", () => {
  const source = "# 😀 {{ **hiddenwrng**\r\nhiddenwrng }}\thelo {% hiddenwrng %} helo\r\n";
  const errors = lintContent(source, { "autocorrect": true });
  assert.deepEqual(errors.map(({ lineNumber, errorRange }) => [ lineNumber, errorRange ]),
    [ [ 2, [ 15, 4 ] ], [ 2, [ 37, 4 ] ] ]);
  assert.equal(applyFixes(source, errors), source.replaceAll("helo", "hello"));
});

test("Liquid ends at its first matching delimiter and leaves unmatched openers literal", () => {
  assert.deepEqual(words("{{ hiddenwrng }} helo {% hiddenwrng %} helo {{ unmatchedwrng"),
    [ "helo", "helo", "unmatchedwrng" ]);
  assert.deepEqual(words("`{{` helo }} {% unmatchedwrng"),
    [ "helo", "unmatchedwrng" ]);
  assert.deepEqual(words("{{ hiddenwrng }} helo {{ hiddenwrng }} helo"),
    [ "helo", "helo" ]);
});

test("loads explicit case-sensitive vocabulary alongside English and rereads changed files", () => {
  const dir = mkdtempSync(join(tmpdir(), "markdownlint-spellcheck-"));
  try {
    const path = join(dir, "words.txt");
    writeFileSync(path, "# Project vocabulary\n\nmispelled\nZqxvterm\n");
    const config = { "dictionaries": { "en": [ "@cspell/dict-en_us", path ] } };
    assert.deepEqual(words("hello mispelled Zqxvterm zqxvterm", config), [ "zqxvterm" ]);
    writeFileSync(path, "Zqxvterm\n");
    assert.deepEqual(words("mispelled", config), [ "mispelled" ]);
    assert.deepEqual(words("Zqxvterm"), [ "Zqxvterm" ], "vocabulary does not leak across configurations");
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("local text dictionaries supply suggestions and replace English when used alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-local-"));
  try {
    const path = join(dir, ".spellcheck.txt");
    writeFileSync(path, "# Project vocabulary\nzqxvterm\n");
    const config = { "dictionaries": { "en": [ path ] }, "autocorrect": true };
    assert.deepEqual(words("zqxvterm hello", config), [ "hello" ]);
    assert.equal(applyFixes("zqxvter", lintContent("zqxvter", config)), "zqxvterm");
    writeFileSync(path, "another\n");
    assert.deepEqual(words("zqxvterm", config), [ "zqxvterm" ]);
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("surfaces invalid configuration and missing or malformed dictionary files", () => {
  for (const dictionaries of [ null, [], "english", [ "" ], [ "../dictionary" ], {},
    { "": [ "@cspell/dict-en_us" ] }, { "en": [] }, { "en": "english" },
    { "en": [ null ] }, { "en": [ "" ] }, { "en": [ "../dictionary" ] } ]) {
    assert.throws(() => lintContent("helo", { dictionaries }), /spellcheck.dictionaries/u);
  }
  assert.throws(() => lintContent("helo", { "dictionaryFiles": "words.txt" }), /dictionaryFiles/u);
  assert.throws(() => lintContent("helo", { "dictionaryFiles": null }), /dictionaryFiles/u);
  assert.throws(() => lintContent("helo", { "autocorrect": "yes" }), /autocorrect/u);
  const dir = mkdtempSync(join(tmpdir(), "markdownlint-spellcheck-"));
  try {
    const path = join(dir, "words.txt");
    assert.throws(() => lintContent("helo", { "dictionaries": { "en": [ "@cspell/dict-en_us", path ] } }), /ENOENT/u);
    writeFileSync(path, "two words\n");
    assert.throws(() => lintContent("helo", { "dictionaries": { "en": [ "@cspell/dict-en_us", path ] } }), /Invalid vocabulary word/u);
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("selected dictionaries replace English without leaking between invocations", () => {
  const spanish = { "dictionaries": { "es": [ "@cspell/dict-es-es" ] } };
  assert.deepEqual(words("hola mundo", spanish), []);
  assert.deepEqual(words("hello", spanish), [ "hello" ]);
  assert.deepEqual(words("hello"), []);
  assert.deepEqual(words("mundo"), [ "mundo" ]);
  const errors = lintContent("holaa", { ...spanish, "autocorrect": true });
  assert.match(errors[0].errorDetail, /Suggestions:/u);
  assert.equal(applyFixes("holaa", errors), "hola");
});

test("language dictionaries combine without implicitly loading English", () => {
  const spanish = { "dictionaries": { "es": [ "@cspell/dict-es-es" ] } };
  assert.deepEqual(words("hello mundo", spanish), [ "hello" ]);
  const combined = {
    "dictionaries": {
      "en": [ "@cspell/dict-en_us" ],
      "es": [ "@cspell/dict-es-es" ]
    }
  };
  assert.deepEqual(words("hello mundo", combined), []);
  assert.equal(applyFixes("holaa", lintContent("holaa", {
    ...combined, "autocorrect": true
  })), "hola");
});

test("rejects old front matter placement and invalid Markdown settings", () => {
  assert.throws(() => lintContent("hello", { "frontMatter": false }), /markdown.frontMatter/u);
  for (const markdown of [ null, false, true, [], "markdown" ]) {
    assert.throws(() => lintContent("hello", { markdown }), /spellcheck.markdown/u);
  }
});

test("combined dictionaries preserve English suggestion weights and add technical suggestions", () => {
  const config = {
    "dictionaries": { "en": [ "@cspell/dict-en_us", "@cspell/dict-software-terms" ] },
    "autocorrect": true
  };
  assert.deepEqual(words("hello webpack", config), []);
  assert.equal(applyFixes("helo", lintContent("helo", config)), "hello");
  const errors = lintContent("webpak", config);
  assert.match(errors[0].errorDetail, /webpack/u);
});

test("rejects malformed dictionary packages before checking prose", () => {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-packages-"));
  try {
    const path = join(dir, "node_modules", "test-dictionary");
    mkdirSync(path, { "recursive": true });
    writeFileSync(join(path, "package.json"), '{"main":"dictionary.json"}');
    process.chdir(dir);
    const config = { "dictionaries": { "en": [ "test-dictionary" ] } };
    for (const [ definition, message ] of [
      [ {}, /No dictionary definitions/u ],
      [ { "dictionaryDefinitions": [] }, /No dictionary definitions/u ],
      [ { "dictionaryDefinitions": [ null ] }, /Invalid dictionary definition/u ],
      [ { "dictionaryDefinitions": [ { "name": "test" } ] }, /Invalid dictionary definition/u ],
      [ { "dictionaryDefinitions": [ { "name": "test", "path": "words.aff" } ] }, /Unsupported dictionary format/u ]
    ]) {
      writeFileSync(join(path, "dictionary.json"), JSON.stringify(definition));
      assert.throws(() => lintContent("helo", config), message);
    }
    assert.throws(() => lintContent("helo", { "dictionaries": { "en": [ "." ] } }), /Invalid dictionary package name/u);
  } finally {
    process.chdir(cwd);
    rmSync(dir, { "recursive": true });
  }
});

test("local dictionary fixes cover edit types but reject multi-edit suggestions", () => {
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-edits-"));
  try {
    const path = join(dir, "words.txt");
    const config = { "dictionaries": { "en": [ path ] }, "autocorrect": true };
    for (const [ target, source, fixed ] of [
      [ "cat", "cta", "cat" ],
      [ "cat", "cot", "cat" ],
      [ "cat", "cart", "cat" ],
      [ "kitten", "kiten", "kitten" ],
      [ "kitten", "kitt", "kitt" ],
      [ "kitten", "kittan", "kitten" ]
    ]) {
      writeFileSync(path, `${target}\n`);
      assert.equal(applyFixes(source, lintContent(source, config)), fixed);
    }
    writeFileSync(path, "cat\n");
    assert.deepEqual(words("wrng&#108;o &amp; wrng", config), [ "wrng" ]);
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

test("front matter defaults to string values with accurate escaped source spans", () => {
  const source = '---\r\ntitle: "he\\u006co"\r\nnested:\r\n  values: [helo, false, 123]\r\n---\r\n\r\nhelo\r\n';
  const errors = lintContent(source);
  assert.deepEqual(errors.map(({ lineNumber, errorRange }) => [ lineNumber, errorRange ]),
    [ [ 2, [ 9, 9 ] ], [ 4, [ 12, 4 ] ], [ 7, [ 1, 4 ] ] ]);
  assert.deepEqual(lintContent(source, { "markdown": { "frontMatter": false } }).map(({ lineNumber }) => lineNumber), [ 7 ]);
  assert.deepEqual(lintContent(source, { "markdown": { "frontMatter": { "include": [] } } }).map(({ lineNumber }) => lineNumber), [ 7 ]);
});

test("front matter includes parent subtrees and exclusions win", () => {
  const source = "---\nauthors:\n  - name: helo\n    bio: mispelled\nmetadata:\n  title: helo\n---\n";
  const config = { "markdown": { "frontMatter": { "include": [ "authors", "metadata.title" ], "exclude": [ "authors.bio" ] } } };
  assert.deepEqual(lintContent(source, config).map(({ lineNumber }) => lineNumber), [ 3, 6 ]);
});

test("front matter aliases are not expanded and block and quoted values are report-only", () => {
  const source = "---\ntitle: &title helo\nalias: *title\nquote: 'can''t helo'\nsummary: >\n  mispelled\n  helo\n---\n";
  const errors = lintContent(source, { "autocorrect": true });
  assert.deepEqual(errors.map(({ lineNumber }) => lineNumber), [ 2, 4, 6, 7 ]);
  assert.equal(applyFixes(source, errors), source.replace("&title helo", "&title hello"));
});

test("plain front matter fixes never change YAML string types", () => {
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-yaml-type-"));
  try {
    const path = join(dir, "words.txt");
    writeFileSync(path, "true\nnull\n");
    const source = "---\nvalue: tru\nother: nul\n---\n";
    assert.equal(applyFixes(source, lintContent(source, {
      "dictionaries": { "en": [ path ] }, "autocorrect": true
    })), source);
  } finally {
    rmSync(dir, { "recursive": true });
  }
});

test("front matter handles escaped continuations without rewriting ambiguous spans", () => {
  const source = '---\ntitle: "he\\\n  lo"\n---\n';
  const errors = lintContent(source, { "autocorrect": true });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].errorContext, "helo");
  assert.equal(errors[0].lineNumber, 2);
  assert.deepEqual(errors[0].errorRange, [ 9, 3 ]);
  assert.equal(applyFixes(source, errors), source);
});

test("front matter can be disabled without changing markdownlint front matter stripping", () => {
  const result = lint({
    "strings": { "source": "---\ntitle: helo\n---\nhello\n" },
    "customRules": [ rule ],
    "config": { "default": false, "spellcheck": { "markdown": { "frontMatter": false } } }
  });
  assert.deepEqual(result.source, []);
});

test("invalid front matter configuration, YAML, and stripped input fail explicitly", () => {
  for (const frontMatter of [ null, [], "yes", { "include": "title" }, { "exclude": [ "" ] }, { "include": [ "a..b" ] } ]) {
    assert.throws(() => lintContent("hello", { "markdown": { frontMatter } }), /frontMatter/u);
  }
  for (const source of [ "---\ntitle: [\n---\n", "---\ntitle: helo\n", "---\na: !unknown helo\n---\n" ]) {
    assert.throws(() => lintContent(source), /YAML front matter/u);
  }
  assert.throws(() => lint({
    "strings": { "source": "---\ntitle: helo\n---\nhello\n" },
    "customRules": [ rule ],
    "config": { "default": false, "spellcheck": true }
  }), /frontMatter.*null/u);
});
