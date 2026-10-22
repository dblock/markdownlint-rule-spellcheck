# Contributor Instructions

- Keep runtime modules in `src/` and the custom rule in `src/index.mjs` compatible with Node.js 22.18 and later. CSpell is ESM-only; do not load private package paths to emulate CommonJS support.
- Use markdownlint's micromark tokens and original source coordinates. Do not reparse or rewrite Markdown to extract prose.
- Front matter is parsed as YAML with source metadata. Use markdownlint's native `frontMatterLines` and `frontMatter: true` diagnostics rather than disabling header stripping. Keep nested field filters, decoded collection words, and report-only ambiguous scalars consistent; never allow a fix to change a YAML string into another type.
- Keep dictionary access offline and explicit. Never discover CSpell configuration or download resources while linting.
- Leave file discovery and lint configuration to markdownlint-cli2. Collect vocabulary through the output formatter, not rule side effects or a separate file scan.
- Configure dictionaries as language-keyed arrays and Markdown-specific options under `spellcheck.markdown`. Explicit dictionaries replace bundled English; all configured languages participate together.
- Add focused tests in `test/spellcheck.test.mjs` for behavior changes, including exact diagnostic and fix ranges and real CSpell dictionaries. CLI integration tests belong in `test/integration/*.test.mjs`, with `.md` fixtures and adjacent `.expected.md` files.
- Autocorrection is opt-in: lowercase/title case, dictionary-valid first suggestion exactly one edit away, outside dotted and identifier-like tokens. ALL CAPS and mixed case remain report-only.
- Run `npm run lint` and `npm test` before committing code changes. Document public changes in `CHANGELOG.md`, including a linked PR number.
- Preserve `* Your contribution here.` as the first entry under `## (Next)` in `CHANGELOG.md`; add new entries below it, never replace or remove it.
- Keep Markdown paragraphs on one source line.
- Use one commit per PR. Do not publish, tag, or merge without explicit authorization.
- For small changes on an existing PR branch, amend and push with `--force-with-lease` automatically. Never force-push `main`.
