import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtures = new URL("../fixtures/", import.meta.url);
export const expected = (name) => readFileSync(new URL(name, fixtures), "utf8");

export function project(t, name, config = {}) {
  const dir = mkdtempSync(join(tmpdir(), "spellcheck-integration-"));
  t.after(() => rmSync(dir, { "recursive": true }));
  cpSync(new URL(`${name}/`, fixtures), dir, { "recursive": true });
  symlinkSync(fileURLToPath(new URL("../../node_modules/", import.meta.url)), join(dir, "node_modules"), "dir");
  const entry = fileURLToPath(new URL("../../index.mjs", import.meta.url));
  const cli = fileURLToPath(new URL("../../node_modules/markdownlint-cli2/markdownlint-cli2-bin.mjs", import.meta.url));
  writeFileSync(join(dir, ".markdownlint-cli2.jsonc"), JSON.stringify({
    "frontMatter": "a^",
    "customRules": [ entry ],
    "config": { "default": false, "spellcheck": config }
  }));
  return {
    "write": (name, text) => writeFileSync(join(dir, name), text),
    "read": (name) => readFileSync(join(dir, name), "utf8"),
    "run": (...args) => run(cli, args),
    "collect": (...args) => run(fileURLToPath(new URL("../../cli.mjs", import.meta.url)), [ "collect", ...args ]),
    "add": (...args) => run(fileURLToPath(new URL("../../cli.mjs", import.meta.url)), [ "add", ...args ]),
    "command": (...args) => run(fileURLToPath(new URL("../../cli.mjs", import.meta.url)), args)
  };
  function run(entryPoint, args) {
    const result = spawnSync(process.execPath, [ entryPoint, ...args ], { "cwd": dir, "encoding": "utf8" });
    assert.ifError(result.error);
    return result;
  }
}
