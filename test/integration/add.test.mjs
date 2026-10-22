import assert from "node:assert/strict";
import test from "node:test";
import { project } from "./helpers.mjs";

test("collect then add creates an English-plus-project configuration without duplicates", (t) => {
  const fixture = project(t, "collect");
  assert.equal(fixture.collect("*.md").status, 0);
  const result = fixture.add("./.spellcheck.txt");
  assert.equal(result.status, 0, result.stderr);
  const config = fixture.read(".markdownlint.json");
  assert.deepEqual(JSON.parse(config), {
    "spellcheck": { "dictionaries": { "en": [ "@cspell/dict-en_us", "./.spellcheck.txt" ] } }
  });
  assert.equal(fixture.add(".spellcheck.txt").status, 0);
  assert.equal(fixture.read(".markdownlint.json"), config);
  const linted = fixture.run("example.md");
  assert.equal(linted.status, 0, linted.stderr);
});

test("add preserves other settings and selected languages", (t) => {
  const fixture = project(t, "vocabulary");
  fixture.write("custom.json", JSON.stringify({
    "MD013": false,
    "spellcheck": {
      "dictionaries": { "es": [ "@cspell/dict-es-es" ] },
      "autocorrect": true, "markdown": { "frontMatter": false }
    }
  }));
  const result = fixture.add("./words.txt", "--config", "custom.json", "--language", "es");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fixture.read("custom.json")), {
    "MD013": false,
    "spellcheck": {
      "dictionaries": { "es": [ "@cspell/dict-es-es", "./words.txt" ] },
      "autocorrect": true, "markdown": { "frontMatter": false }
    }
  });
});

test("add places new vocabulary in the selected language without inventing a language dictionary", (t) => {
  const fixture = project(t, "vocabulary");
  const result = fixture.add("./words.txt", "--language", "es");
  assert.equal(result.status, 0, result.stderr);
  const config = fixture.read(".markdownlint.json");
  assert.deepEqual(JSON.parse(config).spellcheck.dictionaries, {
    "en": [ "@cspell/dict-en_us" ], "es": [ "./words.txt" ]
  });
  assert.equal(fixture.add("./words.txt", "--language", "es").status, 0);
  assert.equal(fixture.read(".markdownlint.json"), config);
  assert.equal(fixture.add("./words.txt", "--language", "").status, 1);
});

test("add rejects missing files, disabled spelling, and invalid JSON without overwriting settings", (t) => {
  const fixture = project(t, "vocabulary");
  assert.equal(fixture.add("./missing.txt").status, 1);
  assert.throws(() => fixture.read(".markdownlint.json"), /ENOENT/u);
  for (const original of [ "{", "[]", '{"spellcheck":false}', '{"spellcheck":{"enabled":false}}',
    '{"spellcheck":"yes"}', '{"spellcheck":{"dictionaryFiles":[]}}',
    '{"spellcheck":{"dictionaries":null}}', '{"spellcheck":{"dictionaries":[]}}',
    '{"spellcheck":{"dictionaries":[null]}}', '{"spellcheck":{"frontMatter":false}}',
    '{"spellcheck":{"markdown":false}}', '{"spellcheck":{"dictionaries":["@cspell/dict-en_us"]}}' ]) {
    fixture.write(".markdownlint.json", original);
    const result = fixture.add("./words.txt");
    assert.equal(result.status, 1);
    assert.equal(fixture.read(".markdownlint.json"), original);
  }
});

test("add rejects unsupported configuration formats and invalid command arguments", (t) => {
  const fixture = project(t, "vocabulary");
  const unsupported = fixture.add("./words.txt", "--config", "settings.yaml");
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.stderr, /\.json configuration/u);
  for (const args of [ [], [ "words.txt", "extra.txt" ], [ "example.md" ] ]) {
    const result = fixture.add(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/u);
  }
});

test("CLI help and usage errors describe collect and add", (t) => {
  const fixture = project(t, "basic");
  const help = fixture.command("--help");
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /collect.*\n.*add/u);
  for (const args of [ [], [ "collect" ], [ "unknown" ], [ "--unknown" ] ]) {
    const result = fixture.command(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:|Unknown option/u);
  }
});
