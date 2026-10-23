# Contributing

Install dependencies, lint, and run the tests:

```sh
npm ci
npm run lint
npm test
```

For behavior changes, add a focused test in `test/spellcheck.test.mjs` or a CLI integration test in `test/integration/*.test.mjs` and update `CHANGELOG.md`.

Integration tests copy Markdown inputs from `test/fixtures/` into temporary projects and compare fixed files with checked-in `.expected.md` fixtures stored next to their input files.

Run `npm run coverage` for unit and integration coverage, including CLI subprocesses. Reports are written to `coverage/`; CI publishes them to Coveralls on Node 24.

When profiling, measure cold startup separately from repeated files. Suggestions are cached for at most 256 words per dictionary instance; local dictionaries are still reloaded on every lint invocation.

Use the [`collect` command](README.md#creating-a-project-dictionary) to collect vocabulary; review candidates before using the generated file.

Linting checks JavaScript with ESLint and Markdown with markdownlint, including `markdownlint-rule-single-line-paragraphs` to keep paragraphs on one source line.

Documentation is also checked with this project's spelling rule. Fix typos; add legitimate project terms to `.spellcheck.txt`. Test fixtures are excluded because they deliberately contain misspellings.

See the [release guide](RELEASING.md) for release preparation and publishing.
