# markdownlint-rule-spellcheck

[![Test](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/test.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/test.yml)
[![Lint](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml)
[![Coverage](https://coveralls.io/repos/github/dblock/markdownlint-rule-spellcheck/badge.svg?branch=main)](https://coveralls.io/github/dblock/markdownlint-rule-spellcheck?branch=main)
[![Node.js: >=22.18](https://img.shields.io/badge/node-%3E%3D22.18-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A [markdownlint](https://github.com/DavidAnson/markdownlint) custom rule for prose spelling, powered by [CSpell](https://github.com/streetsidesoftware/cspell).

## Contents

- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Corrections](#corrections)
- [Scope](#scope)
- [Contributing](CONTRIBUTING.md)

## Installation

Requires Node.js 22.18 or later and markdownlint 0.41.1 or later.

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

`collect` refuses to overwrite an existing file. `add` creates or updates `.markdownlint.json`, preserving existing settings and keeping English unless you have selected other dictionaries. Repeating `add` does not duplicate entries. Use `--config path/to/config.json` to update another JSON configuration; JSONC and YAML are not supported by this command.

## Configuration

In `.markdownlint.json`:

```json
{
  "spellcheck": {
    "dictionaries": ["@cspell/dict-en_us", "./.spellcheck.txt"],
    "autocorrect": false
  }
}
```

Both options are optional. Local `.txt` dictionary paths are relative to the working directory, not the Markdown file; use `./.spellcheck.txt` as a project convention. Each file contains one case-sensitive word per line; blank lines and `#` comments are ignored. File dictionaries contribute both accepted words and suggestions, and are reread on each lint invocation. Missing files are errors.

American English is included for offline use. To replace it, install a CSpell dictionary package:

```sh
npm install --save-dev @cspell/dict-es-es
```

Then configure `.markdownlint.json`:

```json
{
  "spellcheck": {
    "dictionaries": ["@cspell/dict-es-es"]
  }
}
```

Omitting `dictionaries` uses American English. An explicit nonempty list replaces it and supplies both accepted words and suggestions. To combine English with technical vocabulary, install `@cspell/dict-software-terms` and use `["@cspell/dict-en_us", "@cspell/dict-software-terms"]`.

Packages are resolved from the working directory; English is included with the rule. Each package must export a JSON configuration with `dictionaryDefinitions` pointing to `.trie` or `.txt` files, optionally gzipped. All definitions in those packages are loaded offline; configuration imports, language settings, and other CSpell configuration are not applied. Direct Hunspell files and system or personal dictionaries are not supported.

### Creating a project dictionary

Collect unknown words into a new file, then remove typos before adding it to `dictionaries`:

```sh
npx markdownlint-rule-spellcheck collect "**/*.md" --output .spellcheck.txt
```

The command writes sorted, unique candidates and refuses to overwrite an existing file. It uses English by default; repeat `--dictionary` to select packages or existing `.txt` dictionaries. It checks the supplied files with normal Markdown exclusions and suppression comments, but does not load markdownlint configuration. Normal linting never creates or updates dictionaries.

## Corrections

By default, diagnostics include suggestions but no fixes. Set `autocorrect: true` and run `npx markdownlint-cli2 --fix "**/*.md"` to enable replacements.

For example, `helo` becomes `hello`. Only the first suggestion is considered, and it must be a valid word exactly one insertion, deletion, substitution, or adjacent transposition away. Fixes preserve lowercase or title case; ALL CAPS, mixed case, and words inside dotted, hyphenated, numbered, or identifier-like tokens are left unchanged. Review the diff: a one-edit correction can still change your meaning.

## Scope

Checks spelling, not grammar, in headings, paragraphs, lists, quotes, tables, link labels, and image descriptions.

Skips code, HTML blocks and tags, front matter, link destinations/titles/reference definitions, URLs, email addresses, and entity-encoded word fragments. Does not split identifiers; add project terms through `.txt` dictionaries or install technical dictionaries.
