# Contributing

Install dependencies, lint, and run the tests:

```sh
npm ci
npm run lint
npm test
```

For behavior changes, add a focused test in `test/spellcheck.test.mjs` and update `CHANGELOG.md`.

Linting checks JavaScript with ESLint and Markdown with markdownlint. Markdown paragraphs stay on one source line.
