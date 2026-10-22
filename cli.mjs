#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { dictionaryEntries, markdownOptions } from "./configuration.mjs";

const usage = "Usage: markdownlint-rule-spellcheck collect <globs...> [--output .spellcheck.txt] [--dictionary package-or-file ...]\n       markdownlint-rule-spellcheck add <dictionary.txt> [--config .markdownlint.json] [--language en]";

try {
  const { values, positionals } = parseArgs({
    "allowPositionals": true,
    "options": {
      "output": { "type": "string", "default": ".spellcheck.txt" },
      "dictionary": { "type": "string", "multiple": true },
      "language": { "type": "string", "default": "en" },
      "config": { "type": "string", "default": ".markdownlint.json" },
      "help": { "type": "boolean" }
    }
  });
  if (values.help) {
    console.log(usage);
  } else {
    const [ command, ...patterns ] = positionals;
    if (!values.language.trim()) {
      throw new Error("--language must be nonempty.");
    }
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
      markdownOptions(settings);
      const dictionaries = dictionaryEntries(settings.dictionaries);
      const entries = Object.hasOwn(dictionaries, values.language) ? dictionaries[values.language] : [];
      const path = resolve(patterns[0]);
      const entry = `./${relative(process.cwd(), path).split("\\").join("/")}`;
      settings.dictionaries = {
        ...dictionaries,
        [values.language]: entries.some((name) => name.endsWith(".txt") && resolve(name) === path) ?
          entries : [ ...entries, entry ]
      };
      config.spellcheck = settings;
      // dictionary paths are cwd-relative, even when configuration lives elsewhere.
      writeFileSync(values.config, `${JSON.stringify(config, null, 2)}\n`, { "flag": exists ? "w" : "wx" });
      console.log(`Added ${entry} to ${values.config}.`);
    } else if (command === "collect" && patterns.length) {
      const [ { globby }, { lint }, { createRule } ] = await Promise.all([
        import("globby"), import("markdownlint/sync"), import("./index.mjs")
      ]);
      const files = await globby(patterns, { "ignore": [ "node_modules/**", "coverage/**" ], "gitignore": true });
      if (!files.length) {
        throw new Error("No Markdown files matched the supplied patterns.");
      }
      const words = new Set();
      const rule = createRule({ "suggestions": false });
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        const errors = lint({
          "frontMatter": null,
          "strings": { content },
          "customRules": [ rule ],
          "config": {
            "default": false,
            "spellcheck": { "dictionaries": { [values.language]: values.dictionary ?? [ "@cspell/dict-en_us" ] } }
          }
        }).content;
        const lines = content.split(/\r\n|\r|\n/u);
        for (const error of errors) {
          const [ column, length ] = error.errorRange;
          words.add(error.errorContext || lines[error.lineNumber - 1].slice(column - 1, column - 1 + length));
        }
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
