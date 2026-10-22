import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createSpellingDictionaryFromTrieFile } from "cspell-dictionary";

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
let english;

function getEnglish() {
  if (!english) {
    const configPath = require.resolve("@cspell/dict-en_us");
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const definition = config.dictionaryDefinitions.find(({ name }) => name === "en_us");
    const path = resolve(dirname(configPath), definition.path);
    english = createSpellingDictionaryFromTrieFile(
      gunzipSync(readFileSync(path)),
      definition.name,
      path,
      definition
    );
  }
  return english;
}

function readVocabulary(files) {
  if (!Array.isArray(files) || files.some((file) => typeof file !== "string" || !file)) {
    throw new Error("spellcheck.dictionaryFiles must be an array of nonempty file paths.");
  }
  const words = new Set();
  for (const file of files) {
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
    const vocabulary = readVocabulary(config.dictionaryFiles === undefined ? [] : config.dictionaryFiles);
    const dictionary = getEnglish();
    const correct = (word) => vocabulary.has(word) || dictionary.has(word, { "ignoreCase": false });
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
          if (!suggestions) {
            suggestions = dictionary.suggest(word, { "numSuggestions": 3, "numChanges": 2, "timeout": 100 })
              .map((suggestion) => suggestion.word);
            suggestionsByWord.set(word, suggestions);
          }
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

export default rule;
