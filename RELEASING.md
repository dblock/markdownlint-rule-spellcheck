# Releasing markdownlint-rule-spellcheck

Release only with explicit maintainer authorization. Prepare and push releases directly on the default branch, `main`, without a release PR. Never force-push `main` or move an existing release tag.

## Prepare

Start with a clean working tree and update `main`:

```sh
git switch main
git pull --ff-only origin main
npm ci
```

Choose a Semantic Versioning release number. Use patch versions for fixes, minor versions for compatible features, and major versions for breaking changes. Before 1.0, breaking changes may use a minor version; describe configuration and behavior changes in `CHANGELOG.md`. The first release is `0.1.0`, matching the current package version.

Set the version in `package.json` and `package-lock.json` without creating a commit or tag:

```sh
npm version 0.1.0 --no-git-tag-version
```

Skip this command if the version already matches. In `CHANGELOG.md`, replace the `(Next)` heading with `0.1.0 (YYYY/MM/DD)` using the release date, preserve linked PRs and contributors, and remove any contribution placeholder. Stop if there are no changes to release. Do not update dependencies or dictionaries implicitly during release preparation.

Run the local checks:

```sh
npm run lint
npm run coverage
```

Commit the version and release notes, including the contributor trailer required by your workflow, and push to `main`. Confirm the Lint and Test workflows pass for that exact release commit:

```sh
git add package.json package-lock.json CHANGELOG.md RELEASING.md
git commit -m "Release v0.1.0"
git push origin main
gh run list --branch main --commit "$(git rev-parse HEAD)"
```

## Inspect the package

Build the package from the clean release commit:

```sh
npm pack
tar -tzf markdownlint-rule-spellcheck-0.1.0.tgz
```

Confirm it contains `package.json`, `README.md`, `UPGRADING.md`, `CHANGELOG.md`, `LICENSE`, and the runtime modules in `src/`, including executable `src/cli.mjs`, without tests, coverage reports, local vocabulary, or development artifacts. Runtime dependencies, including bundled English, are installed through `npm` rather than copied into the archive.

Install this exact archive alongside `markdownlint-cli2` in a separate temporary project. Follow the [usage instructions](README.md#usage) and confirm that `helo` produces a spelling diagnostic and becomes `hello` only with `autocorrect: true` and `--fix`. Also check front matter, local dictionaries, the packaged candidate formatter, and the `add` command. Do not use a source checkout or local dependency links for this check.

## Configure publishing

The [Publish workflow](.github/workflows/publish.yml) publishes with provenance when a GitHub release is published. It uses Node 24, installs locked dependencies, and runs the tests before publishing. No package build step is needed.

Configure this package's trusted publisher on the `npm` website with GitHub owner `dblock`, repository `markdownlint-rule-spellcheck`, and workflow filename `publish.yml`. The workflow uses `id-token: write` for authentication without a stored publishing token. Complete any first-publication setup required by the registry before releasing; if it requires an initial authenticated publish, have the maintainer publish the inspected archive from their terminal, then configure trusted publishing for subsequent versions.

Never put credentials or MFA codes in source, command arguments, logs, or documentation. If the first version was published manually, do not run the workflow again for that same version.

## Tag and publish

Create an annotated tag at the exact release commit and a GitHub release with the matching notes from `CHANGELOG.md`. Substitute the chosen version throughout:

```sh
git tag -a v0.1.0 <release-commit> -m "v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --verify-tag --title "v0.1.0" --notes-file <release-notes-file>
```

The published GitHub release starts the Publish workflow. Wait for it to succeed and verify the version on the registry:

```sh
gh run list --workflow publish.yml --limit 5
gh run watch <run-id> --exit-status
npm view markdownlint-rule-spellcheck@0.1.0 version dist.integrity
gh release view v0.1.0
```

In a fresh temporary project, install `markdownlint-rule-spellcheck@0.1.0` and `markdownlint-cli2` from `npm` and repeat the basic spelling check.

The workflow also supports manual dispatch for retrying a failed publication. Select the release tag, not a development branch, and first verify that the version is not already published:

```sh
gh workflow run publish.yml --ref v0.1.0
```

Do not tag unrelated changes that landed afterward. A GitHub release alone does not prove publication succeeded. If a published release is wrong, ship a new version rather than rewriting released history.

## Next development iteration

Add a fresh `## (Next)` section in `CHANGELOG.md` with `* Your contribution here.`. If appropriate, set the next development version with `npm version <next-version> --no-git-tag-version`. Commit and push these changes to `main`. Remove the local release archive after verification; do not commit it.
