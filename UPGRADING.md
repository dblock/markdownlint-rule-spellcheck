# Upgrading

## 0.2.0

Requires markdownlint 0.42.0 or later.

Remove `"frontMatter": "a^"` from `.markdownlint-cli2.jsonc`. YAML front matter checking now uses markdownlint's native support and no longer requires disabling header stripping.
