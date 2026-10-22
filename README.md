# markdownlint-rule-spellcheck

[![Test](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/test.yml) [![Lint](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml) [![Coverage](https://coveralls.io/repos/github/dblock/markdownlint-rule-spellcheck/badge.svg?branch=main)](https://coveralls.io/github/dblock/markdownlint-rule-spellcheck?branch=main) [![Node.js: >=22.18](https://img.shields.io/badge/node-%3E%3D22.18-brightgreen.svg)](https://nodejs.org/) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [markdownlint](https://github.com/DavidAnson/markdownlint) custom rule for prose spelling, powered by [CSpell](https://github.com/streetsidesoftware/cspell).

## Contents

- [Installation](#installation)
- [Upgrading](UPGRADING.md)
- [Usage](#usage)
- [Configuration](#configuration)
- [YAML front matter](#yaml-front-matter)
- [Corrections](#corrections)
- [Scope](#scope)
- [Contributing](CONTRIBUTING.md)

## Installation

Requires Node.js 22.18 or later and markdownlint 0.42.0 or later.

```sh
npm install --save-dev markdownlint-cli2 markdownlint-rule-spellcheck
```

## Usage

In `.markdownlint-cli2.jsonc`:

```json
{
  "customRules": ["markdownlint-rule-spellcheck"]
}
```

Then:

```sh
npx markdownlint-cli2 "**/*.md"
```

For example, save this as `example.md`:

```markdown
# Say helo to the world
```

Running `npx markdownlint-cli2 example.md` produces:

```text
markdownlint-cli2 v0.24.0 (markdownlint v0.42.0)
Finding: example.md
Linting: 1 file
Summary: 1 issue in 1 file
example.md:1:7 error spellcheck Prose words should be spelled correctly [Misspelled word: "helo". Suggestions: hello, helio, halo.]
```

Spelling checks are enabled by default. Suppress them with `<!-- markdownlint-disable spellcheck -->` or disable `spellcheck` in markdownlint configuration.

To accept project-specific words, collect candidates, review `.spellcheck.txt` and remove typos, then add it to your configuration:

```sh
npx markdownlint-rule-spellcheck collect "**/*.md" --output .spellcheck.txt
# Edit .spellcheck.txt: keep only words you want to accept.
npx markdownlint-rule-spellcheck add ./.spellcheck.txt
npx markdownlint-cli2 "**/*.md"
```

`add` updates `.markdownlint.json` without replacing existing settings or duplicating dictionaries. Use `--config path/to/config.json` for another JSON configuration; JSONC and YAML are not supported by `add`.

## Configuration

In `.markdownlint.json`:

```json
{
  "spellcheck": {
    "dictionaries": {
      "en": ["@cspell/dict-en_us", "./.spellcheck.txt"]
    },
    "autocorrect": false,
    "markdown": {
      "frontMatter": true
    }
  }
}
```

All options are optional. Local `.txt` dictionary paths are relative to the working directory. Each file contains one case-sensitive word per line; blank lines and `#` comments are ignored. Missing files are errors.

American English is included for offline use. To replace it, install a CSpell dictionary package:

```sh
npm install --save-dev @cspell/dict-es-es
```

Then configure `.markdownlint.json`:

```json
{
  "spellcheck": {
    "dictionaries": {
      "es": ["@cspell/dict-es-es", "./.spellcheck.es.txt"]
    }
  }
}
```

Omitting `dictionaries` uses American English. An explicit language map replaces it; include an `en` entry if you still want English. Each language needs a nonempty list of packages or `.txt` files. A word is accepted by any configured dictionary, and suggestions come from all languages. Language keys label the dictionaries; they do not automatically install or select a language.

For English and Spanish together:

```json
{
  "spellcheck": {
    "dictionaries": {
      "en": ["@cspell/dict-en_us", "./.spellcheck.txt"],
      "es": ["@cspell/dict-es-es", "./.spellcheck.es.txt"]
    }
  }
}
```

Create the vocabulary files before referencing them, or omit them. To add technical vocabulary, install `@cspell/dict-software-terms` and append it to the relevant language's list.

Install dictionary packages in your project; English is included with the rule. Only package dictionaries and local `.txt` files are supported, not CSpell configuration imports, Hunspell files, or system dictionaries.

### Creating a project dictionary

Run `collect`:

```sh
npx markdownlint-rule-spellcheck collect "**/*.md" --output .spellcheck.txt
```

Candidates are sorted and deduplicated, using your configured dictionaries, front matter field selections, file exclusions, and suppression comments.

The output path defaults to `.spellcheck.txt` if omitted. Existing files are never overwritten. Review the file and remove typos before adding it to your dictionaries. Normal linting never changes dictionary files.

Use `add --language` to put vocabulary under a specific language (default: `en`):

```sh
npx markdownlint-rule-spellcheck add ./.spellcheck.es.txt --language es
```

`add` preserves other languages and adds the file to the selected language, creating that entry if needed. It does not select a language dictionary for you.

## YAML front matter

YAML front matter checking is enabled by default for string values, including nested objects and arrays. Keys, numbers, booleans, and comments are skipped. Anchored strings are checked once, not at each alias. Malformed YAML is an error.

Select fields in `.markdownlint.json`:

```json
{
  "spellcheck": {
    "markdown": {
      "frontMatter": {
        "include": ["title", "description", "authors.name", "metadata"],
        "exclude": ["metadata.id", "metadata.url"]
      }
    }
  }
}
```

Omitting `include` checks all string values; `include: []` checks none. Dotted paths select nested fields, including fields inside arrays without numeric indices. Selecting a parent includes its subtree; exclusions win. Paths are case-sensitive, not globs.

To skip front matter, set `"spellcheck": { "markdown": { "frontMatter": false } }` in `.markdownlint.json`.

Quoted strings and block values are checked but never autocorrected. Plain values can be corrected only when the result remains a YAML string.

## Corrections

By default, diagnostics include suggestions but no fixes. Set `autocorrect: true` and run `npx markdownlint-cli2 --fix "**/*.md"` to enable replacements.

For example, `helo` becomes `hello`. Fixes use the first suggestion only when it differs by one letter edit or transposition. Lowercase and title case are preserved; ALL CAPS, mixed case, and words inside dotted, hyphenated, numbered, or identifier-like tokens are left unchanged. Review the diff: a correction can still change your meaning.

## Scope

Checks spelling, not grammar, in headings, paragraphs, lists, quotes, tables, link labels, and image descriptions.

Skips code, HTML blocks and tags, link destinations/titles/reference definitions, URLs, email addresses, and entity-encoded word fragments. Does not split identifiers; add project terms through `.txt` dictionaries or install technical dictionaries.

Accented words and apostrophes are supported. Tokens containing numbers or connector punctuation (including underscores) are skipped: `sha256`, `can't2stop`, and `wrong_token`. Hyphens separate words, so `helo-world` flags `helo` but is not autocorrected. Markdown emphasis such as `_helo_` is checked.

Liquid expressions (`{{ ... }}`) and tags (`{% ... %}`), including multiline forms, are skipped; surrounding prose is checked. Each ends at the first matching closing delimiter. Unmatched openers remain ordinary text.
