#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dictionaryEntries, markdownOptions } from "./configuration.mjs";

const usage = "Usage: markdownlint-rule-spellcheck collect <globs...> [--output .spellcheck.txt]\n       markdownlint-rule-spellcheck add <dictionary.txt> [--config .markdownlint.json] [--language en]";

try {
  const { values, positionals } = parseArgs({
    "allowPositionals": true,
    "options": {
      "output": { "type": "string", "default": ".spellcheck.txt" },
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
      const { main } = await import("markdownlint-cli2");
      const status = await main({
        "argv": patterns,
        "optionsOverride": {
          "fix": false,
          "outputFormatters": [ [ fileURLToPath(new URL("./vocabulary-formatter.mjs", import.meta.url)), values.output ] ]
        },
        "logMessage": console.log,
        "logError": (message) => { throw new Error(message); }
      });
      if (status > 1) {
        throw new Error(`markdownlint-cli2 failed with exit code ${status}.`);
      }
    } else {
      throw new Error(usage);
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
