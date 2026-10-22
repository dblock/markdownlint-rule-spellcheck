import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createCollection, createSpellingDictionary, createSpellingDictionaryFromTrieFile } from "cspell-dictionary";

const require = createRequire(import.meta.url);
const excludedTypes = new Set([
  "autolink",
  "codeFenced",
  "codeIndented",
  "codeText",
  "definition",
  "htmlFlow",
  "htmlText",
  "reference",
  "resource"
]);
const wordPattern = /(?<![\p{L}\p{M}\p{N}_])[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*(?![\p{L}\p{M}\p{N}_])/gu;
const wordOnly = /^[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*$/u;
const nonProsePattern = /(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+/giu;
const dictionaryCache = new Map();

function getDictionaries(packages) {
  if (!Array.isArray(packages) || !packages.length ||
      packages.some((name) => typeof name !== "string" || !name ||
        !(name.endsWith(".txt") || /^(?:@[\w.-]+\/)?[\w.-]+$/u.test(name)))) {
    throw new Error("spellcheck.dictionaries must be a nonempty array of CSpell package names or .txt file paths.");
  }
  const localRequire = createRequire(resolve("package.json"));
  const dictionaries = packages.flatMap((name) => {
    if (name.endsWith(".txt")) {
      return createSpellingDictionary(
        [ ...readVocabulary(name) ], name, resolve(name), { "caseSensitive": true }
      );
    }
    if (isAbsolute(name) || name.startsWith(".")) {
      throw new Error(`Invalid dictionary package name: ${name}. Local dictionaries must be .txt files.`);
    }
    const configPath = name === "@cspell/dict-en_us" ? require.resolve(name) : localRequire.resolve(name);
    if (dictionaryCache.has(configPath)) {
      return dictionaryCache.get(configPath);
    }
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (!Array.isArray(config.dictionaryDefinitions) || !config.dictionaryDefinitions.length) {
      throw new Error(`No dictionary definitions in ${configPath}.`);
    }
    const loaded = config.dictionaryDefinitions.map((definition) => {
      if (!definition || typeof definition.name !== "string" || typeof definition.path !== "string") {
        throw new Error(`Invalid dictionary definition in ${configPath}.`);
      }
      const path = resolve(dirname(configPath), definition.path);
      if (!/\.(?:trie|txt)(?:\.gz)?$/u.test(path)) {
        throw new Error(`Unsupported dictionary format: ${path}. Expected .trie or .txt, optionally gzipped.`);
      }
      const bytes = readFileSync(path);
      const data = path.endsWith(".gz") ? gunzipSync(bytes) : bytes;
      return /\.trie(?:\.gz)?$/u.test(path) ?
        createSpellingDictionaryFromTrieFile(data, definition.name, path, definition) :
        createSpellingDictionary(data.toString("utf8").split(/\r?\n/u), definition.name, path, definition);
    });
    dictionaryCache.set(configPath, loaded);
    return loaded;
  });
  if (dictionaries.length === 1) {
    return dictionaries[0];
  }
  const collection = createCollection(dictionaries, "spellcheck");
  return {
    "has": (word, options) => collection.has(word, options),
    "suggest": (word, options) => {
      // Collection suggestions do not apply each dictionary's weighted edit costs.
      const ranked = dictionaries.flatMap((dictionary) => dictionary.suggest(word, options))
        .sort((a, b) => a.cost - b.cost);
      const seen = new Set();
      return ranked.filter(({ word: suggestion }) => {
        if (seen.has(suggestion) || collection.isForbidden(suggestion) || collection.isNoSuggestWord(suggestion)) {
          return false;
        }
        seen.add(suggestion);
        return true;
      }).slice(0, options.numSuggestions);
    }
  };
}

function readVocabulary(file) {
  const words = new Set();
  const path = resolve(file);
  for (const [ index, line ] of readFileSync(path, "utf8").split(/\r?\n/u).entries()) {
    const word = line.trim();
    if (!word || word.startsWith("#")) {
      continue;
    }
    if (!wordOnly.test(word)) {
      throw new Error(`Invalid vocabulary word at ${path}:${index + 1}: ${word}`);
    }
    words.add(word);
  }
  return words;
}

function* proseTokens(tokens) {
  for (const token of tokens) {
    if (excludedTypes.has(token.type)) {
      continue;
    }
    if (token.type === "data") {
      yield token;
    } else {
      yield* proseTokens(token.children || []);
    }
  }
}

function standalone(line, first, last) {
  return !/[\p{L}\p{M}\p{N}_](?:[.-])?$/u.test(line.slice(0, first)) &&
    !/^(?:[.-])?[\p{L}\p{M}\p{N}_]/u.test(line.slice(last));
}

// One insertion, deletion, substitution, or adjacent transposition; CSpell's weighted
// suggestion cost is not an edit distance.
function oneEditAway(left, right) {
  const a = Array.from(left);
  const b = Array.from(right);
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  let first = 0;
  while ((first < a.length) && (a[first] === b[first])) {
    first++;
  }
  if (first === Math.min(a.length, b.length)) {
    return a.length !== b.length;
  }
  const suffix = (x, y) => a.slice(x).join("") === b.slice(y).join("");
  if (a.length === b.length) {
    return suffix(first + 1, first + 1) ||
      ((a[first] === b[first + 1]) && (a[first + 1] === b[first]) && suffix(first + 2, first + 2));
  }
  return a.length > b.length ? suffix(first + 1, first) : suffix(first, first + 1);
}

function replacement(word, suggestions, correct) {
  const lower = word.toLowerCase();
  const title = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  if ((word !== lower) && ((word !== title(word)) || (word === word.toUpperCase()))) {
    return undefined;
  }
  const suggestion = suggestions[0]?.toLowerCase();
  if (!suggestion || !wordOnly.test(suggestion) || !oneEditAway(lower, suggestion)) {
    return undefined;
  }
  const result = word === lower ? suggestion : title(suggestion);
  return correct(result) ? result : undefined;
}

export function createRule({ suggestions: includeSuggestions = true } = {}) {
  /** @type {import("markdownlint").Rule} */
  const rule = {
    "names": [ "spellcheck" ],
    "description": "Prose words should be spelled correctly",
    "information": new URL("https://github.com/dblock/markdownlint-rule-spellcheck"),
    "tags": [ "spelling" ],
    "parser": "micromark",
    "function": (params, onError) => {
      const config = params.config;
      if ((config.autocorrect !== undefined) && (typeof config.autocorrect !== "boolean")) {
        throw new Error("spellcheck.autocorrect must be a boolean.");
      }
      if (config.dictionaryFiles !== undefined) {
        throw new Error("spellcheck.dictionaryFiles has been replaced by spellcheck.dictionaries. Include English explicitly alongside .txt files.");
      }
      const dictionary = getDictionaries(config.dictionaries === undefined ? [ "@cspell/dict-en_us" ] : config.dictionaries);
      const correct = (word) => dictionary.has(word, { "ignoreCase": false });
      const suggestionsByWord = new Map();
      for (const token of proseTokens(params.parsers.micromark.tokens)) {
        const text = token.text.replace(nonProsePattern, (match) => " ".repeat(match.length));
        const lines = text.split(/\r\n|\r|\n/u);
        for (const [ index, line ] of lines.entries()) {
          const lineNumber = token.startLine + index;
          const startColumn = index ? 1 : token.startColumn;
          const source = params.lines[lineNumber - 1];
          for (const match of line.matchAll(wordPattern)) {
            const word = match[0];
            if (correct(word)) {
              continue;
            }
            const first = startColumn - 1 + match.index;
            const last = first + word.length;
            // Do not diagnose fragments of entity-encoded words.
            if (/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);$/iu.test(source.slice(0, first)) ||
                /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/iu.test(source.slice(last))) {
              continue;
            }
            let suggestions = suggestionsByWord.get(word);
            if (!suggestions && includeSuggestions) {
              suggestions = dictionary.suggest(word, { "numSuggestions": 3, "numChanges": 2, "timeout": 100 })
                .map((suggestion) => suggestion.word);
              suggestionsByWord.set(word, suggestions);
            }
            suggestions ??= [];
            const fix = config.autocorrect && standalone(source, first, last) ?
              replacement(word, suggestions, correct) : undefined;
            onError({
              lineNumber,
              "detail": `Misspelled word: "${word}".${suggestions.length ? ` Suggestions: ${suggestions.join(", ")}.` : ""}`,
              "range": [ first + 1, word.length ],
              ...(fix ? {
                "fixInfo": { "editColumn": first + 1, "deleteCount": word.length, "insertText": fix }
              } : {})
            });
          }
        }
      }
    }
  };
  return rule;
}

export default createRule();
