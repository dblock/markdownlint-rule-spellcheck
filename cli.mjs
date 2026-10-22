#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { globby } from "globby";
import { lint } from "markdownlint/sync";
import rule from "./index.mjs";

const usage = "Usage: markdownlint-rule-spellcheck collect <globs...> [--output .spellcheck.txt] [--dictionary package-or-file ...]\n       markdownlint-rule-spellcheck add <dictionary.txt> [--config .markdownlint.json]";

try {
  const { values, positionals } = parseArgs({
    "allowPositionals": true,
    "options": {
      "output": { "type": "string", "default": ".spellcheck.txt" },
      "dictionary": { "type": "string", "multiple": true },
      "config": { "type": "string", "default": ".markdownlint.json" },
      "help": { "type": "boolean" }
    }
  });
  if (values.help) {
    console.log(usage);
  } else {
    const [ command, ...patterns ] = positionals;
    if (command === "add") {
      if (patterns.length !== 1 || !patterns[0].endsWith(".txt")) {
        throw new Error(usage);
      }
      readFileSync(patterns[0], "utf8");
      if (!values.config.endsWith(".json")) {
        throw new Error("add supports .json configuration files only.");
      }
      const exists = existsSync(values.config);
      const config = exists ? JSON.parse(readFileSync(values.config, "utf8")) : {};
      const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
      if (!object(config)) {
        throw new Error("Configuration must be a JSON object.");
      }
      const spelling = config.spellcheck;
      if (spelling === false || (object(spelling) && spelling.enabled === false)) {
        throw new Error("spellcheck is disabled; enable it before adding a dictionary.");
      }
      if (spelling !== undefined && spelling !== true && !object(spelling)) {
        throw new Error("spellcheck must be true or an object.");
      }
      const settings = object(spelling) ? { ...spelling } : {};
      if (settings.dictionaryFiles !== undefined) {
        throw new Error("Replace spellcheck.dictionaryFiles with dictionaries before using add.");
      }
      const dictionaries = settings.dictionaries === undefined ? [ "@cspell/dict-en_us" ] : settings.dictionaries;
      if (!Array.isArray(dictionaries) || !dictionaries.length ||
          dictionaries.some((name) => typeof name !== "string" || !name)) {
        throw new Error("spellcheck.dictionaries must be a nonempty array of strings.");
      }
      const path = resolve(patterns[0]);
      const entry = `./${relative(process.cwd(), path).split("\\").join("/")}`;
      settings.dictionaries = dictionaries.some((name) => name.endsWith(".txt") && resolve(name) === path) ?
        dictionaries : [ ...dictionaries, entry ];
      config.spellcheck = settings;
      // dictionary paths are cwd-relative, even when configuration lives elsewhere.
      writeFileSync(values.config, `${JSON.stringify(config, null, 2)}\n`, { "flag": exists ? "w" : "wx" });
      console.log(`Added ${entry} to ${values.config}.`);
    } else if (command === "collect" && patterns.length) {
      const files = await globby(patterns, { "ignore": [ "node_modules/**", "coverage/**" ], "gitignore": true });
      if (!files.length) {
        throw new Error("No Markdown files matched the supplied patterns.");
      }
      const words = new Set();
      const collector = {
        ...rule,
        "function": (params, onError) => rule.function(params, (error) => {
          const [ column, length ] = error.range;
          words.add(params.lines[error.lineNumber - 1].slice(column - 1, column - 1 + length));
          onError(error);
        })
      };
      for (const file of files) {
        lint({
          "strings": { [file]: readFileSync(file, "utf8") },
          "customRules": [ collector ],
          "config": {
            "default": false,
            "spellcheck": { "dictionaries": values.dictionary ?? [ "@cspell/dict-en_us" ] }
          }
        });
      }
      const entries = [ ...words ].sort();
      writeFileSync(values.output, [
        "# Review these candidates: remove typos before using this dictionary.",
        ...entries, ""
      ].join("\n"), { "flag": "wx" });
      console.log(`Created ${values.output} with ${entries.length} candidate words. Review before adding it to dictionaries.`);
    } else {
      throw new Error(usage);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
