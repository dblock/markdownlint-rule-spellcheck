# Contributor Instructions

- Keep the custom rule in `index.mjs` compatible with Node.js 22.18 and later. CSpell is ESM-only; do not load private package paths to emulate CommonJS support.
- Use markdownlint's micromark tokens and original source coordinates. Do not reparse or rewrite Markdown to extract prose.
- Keep dictionary access offline and explicit. Never discover CSpell configuration or download resources while linting.
- Add focused tests in `test/spellcheck.test.mjs` for behavior changes, including exact diagnostic and fix ranges and real CSpell dictionaries. CLI integration tests belong in `test/integration/*.test.mjs`, with `.md` fixtures and adjacent `.expected.md` files.
- Autocorrection is opt-in: lowercase/title case, dictionary-valid first suggestion exactly one edit away, outside dotted and identifier-like tokens. ALL CAPS and mixed case remain report-only.
- Run `npm run lint` and `npm test` before committing code changes. Document public changes in `CHANGELOG.md`, including a linked PR number.
- Keep Markdown paragraphs on one source line.
- Use one commit per PR. Do not publish, tag, or merge without explicit authorization.
- For small changes on an existing PR branch, amend and push with `--force-with-lease` automatically. Never force-push `main`.
