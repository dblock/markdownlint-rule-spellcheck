# markdownlint-rule-spellcheck

[![CI](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/ci.yml)
[![Lint](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml/badge.svg)](https://github.com/dblock/markdownlint-rule-spellcheck/actions/workflows/lint.yml)
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

## Configuration

In `.markdownlint.json`:

```json
{
  "spellcheck": {
    "dictionaryFiles": [".spellcheck.txt"],
    "autocorrect": false
  }
}
```

Both options are optional. `dictionaryFiles` defaults to `[]`; paths are relative to the working directory, not the Markdown file. Each file contains one case-sensitive accepted word per line; blank lines and `#` comments are ignored.

American English is bundled for offline use. Other languages, `cspell.json`, Hunspell files, and system or personal dictionaries are not supported.

## Corrections

By default, diagnostics include suggestions but no fixes. Set `autocorrect: true` and run `npx markdownlint-cli2 --fix "**/*.md"` to enable replacements.

For example, `helo` becomes `hello`. Only the first suggestion is considered, and it must be a valid word exactly one insertion, deletion, substitution, or adjacent transposition away. Fixes preserve lowercase or title case; ALL CAPS, mixed case, and words inside dotted, hyphenated, numbered, or identifier-like tokens are left unchanged. Review the diff: a one-edit correction can still change your meaning.

## Scope

Checks spelling, not grammar, in headings, paragraphs, lists, quotes, tables, link labels, and image descriptions.

Skips code, HTML blocks and tags, front matter, link destinations/titles/reference definitions, URLs, email addresses, and entity-encoded word fragments. Does not split identifiers or include technical dictionaries; add project terms through `dictionaryFiles`.
