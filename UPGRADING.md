# Upgrading

## 0.2.0

Requires markdownlint 0.42.0 or later.

Remove `"frontMatter": "a^"` from `.markdownlint-cli2.jsonc`. YAML front matter checking now uses markdownlint's native support and no longer requires disabling header stripping.

The `collect` command now requires markdownlint-cli2 installed in your project and uses your normal lint configuration, including dictionaries and front matter field selections. Configure dictionaries there instead of using `--dictionary` flags. The command enables the [candidate formatter](README.md#creating-a-project-dictionary) for one run without changing configuration files. The `--output` option and `add` command are unchanged.
