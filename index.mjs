import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { createCollection, createSpellingDictionary, createSpellingDictionaryFromTrieFile } from "cspell-dictionary";
import { frontMatter } from "./front-matter.mjs";
import { dictionaryEntries, markdownOptions } from "./configuration.mjs";

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
const wordPattern = /[\p{L}\p{M}\p{N}\p{Pc}]+(?:['’][\p{L}\p{M}\p{N}\p{Pc}]+)*/gu;
const wordOnly = /^\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*$/u;
const nonProsePattern = /(?:https?:\/\/|mailto:|www\.)[^\s<>]+|[\p{L}\p{N}_.+-]+@[\p{L}\p{N}_.-]+/giu;
const dictionaryCache = new Map();
const suggestionCache = new WeakMap();
const suggestionOptions = { "numSuggestions": 3, "numChanges": 2, "timeout": 100 };

function suggest(dictionary, word) {
  let cache = suggestionCache.get(dictionary);
  if (!cache) {
    cache = new Map();
    suggestionCache.set(dictionary, cache);
  }
  if (!cache.has(word)) {
    const suggestions = dictionary.suggest(word, suggestionOptions);
    if (cache.size >= 256) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(word, suggestions);
  }
  return cache.get(word);
}

function getDictionaries(packages) {
  if (packages.some((name) => !(name.endsWith(".txt") || /^(?:@[\w.-]+\/)?[\w.-]+$/u.test(name)))) {
    throw new Error("spellcheck.dictionaries entries must be CSpell package names or .txt file paths.");
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
    const dictionary = dictionaries[0];
    return {
      "has": (word, options) => dictionary.has(word, options),
      "suggest": (word) => suggest(dictionary, word)
    };
  }
  const collection = createCollection(dictionaries, "spellcheck");
  return {
    "has": (word, options) => collection.has(word, options),
    "suggest": (word, options) => {
      // Collection suggestions do not apply each dictionary's weighted edit costs.
      const ranked = dictionaries.flatMap((dictionary) => suggest(dictionary, word))
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

function* dataTokens(tokens) {
  for (const token of tokens) {
    if (excludedTypes.has(token.type)) {
      continue;
    }
    if (token.type === "data") {
      yield token;
    } else {
      yield* dataTokens(token.children || []);
    }

  }
}

function* proseTokens(tokens) {
  let previous;
  for (const token of dataTokens(tokens)) {
    if (previous && previous.endLine === token.startLine && previous.endColumn === token.startColumn) {
      previous = { ...previous, "text": previous.text + token.text, "endLine": token.endLine, "endColumn": token.endColumn };
    } else {
      if (previous) {
        yield previous;
      }
      previous = token;
    }
  }
  if (previous) {
    yield previous;
  }
}

function liquidRanges(params) {
  const offsets = [];
  let offset = 0;
  for (const line of params.lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const position = (line, column) => offsets[line - 1] + column - 1;
  const code = [];
  function visit(tokens) {
    for (const token of tokens) {
      if ([ "codeFenced", "codeIndented", "codeText" ].includes(token.type)) {
        code.push([ position(token.startLine, token.startColumn), position(token.endLine, token.endColumn) ]);
      } else {
        visit(token.children || []);
      }
    }
  }
  visit(params.parsers.micromark.tokens);
  const source = params.lines.join("\n");
  const ranges = [];
  const opener = /\{\{|\{%/gu;
  let cursor = 0;
  while (cursor < source.length) {
    opener.lastIndex = cursor;
    const match = opener.exec(source);
    if (!match) {
      break;
    }
    const start = match.index;
    const containingCode = code.find(([ first, last ]) => first <= start && start < last);
    if (containingCode) {
      cursor = containingCode[1];
      continue;
    }
    const closing = match[0] === "{{" ? "}}" : "%}";
    const end = source.indexOf(closing, start + 2);
    if (end === -1) {
      cursor = start + 2;
    } else {
      ranges.push([ start, end + 2 ]);
      cursor = end + 2;
    }
  }
  return { ranges, position };
}

function standalone(line, first, last) {
  return !/[\p{L}\p{M}\p{N}\p{Pc}](?:[.-])?$/u.test(line.slice(0, first)) &&
    !/^(?:[.-])?[\p{L}\p{M}\p{N}\p{Pc}]/u.test(line.slice(last));
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
      const markdown = markdownOptions(config);
      const dictionary = getDictionaries([ ...new Set(Object.values(dictionaryEntries(config.dictionaries)).flat()) ]);
      const correct = (word) => dictionary.has(word, { "ignoreCase": false });
      const suggestionsByWord = new Map();
      const liquid = liquidRanges(params);
      const front = frontMatter(params, markdown.frontMatter);
      const frontLiquid = front.native ? liquidRanges({
        "lines": front.lines, "parsers": { "micromark": { "tokens": [] } }
      }) : liquid;
      const tokens = [
        ...front.tokens,
        ...[ ...proseTokens(params.parsers.micromark.tokens) ].filter((token) => token.startLine > front.endLine)
      ];
      for (const token of tokens) {
        const text = token.text.replace(nonProsePattern, (match) => " ".repeat(match.length));
        const lines = text.split(/\r\n|\r|\n/u);
        let textOffset = 0;
        for (const [ index, line ] of lines.entries()) {
          const tokenOffset = textOffset;
          textOffset += line.length + (text.startsWith("\r\n", tokenOffset + line.length) ? 2 : 1);
          let lineNumber = token.startLine + index;
          const startColumn = index ? 1 : token.startColumn;
          for (const match of line.matchAll(wordPattern)) {
            const word = match[0];
            if (!wordOnly.test(word) || correct(word)) {
              continue;
            }
            const mapped = token.mapping?.slice(tokenOffset + match.index, tokenOffset + match.index + word.length);
            const firstPosition = mapped?.[0][0];
            const lastPosition = mapped?.at(-1)[1];
            if (firstPosition) {
              lineNumber = firstPosition.line;
            }
            const source = (token.frontMatter ? front.lines : params.lines)[lineNumber - 1];
            const first = firstPosition ? firstPosition.column - 1 : startColumn - 1 + match.index;
            const last = lastPosition ?
              (lastPosition.line === lineNumber ? lastPosition.column - 1 : source.length) : first + word.length;
            const tokenLiquid = token.frontMatter ? frontLiquid : liquid;
            const offset = tokenLiquid.position(lineNumber, first + 1);
            if (tokenLiquid.ranges.some(([ start, end ]) => offset < end && offset + word.length > start)) {
              continue;
            }
            // Do not diagnose fragments of entity-encoded words.
            if (/&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);$/iu.test(source.slice(0, first)) ||
                /^&(?:#x[\da-f]+|#\d+|[a-z][\da-z]+);/iu.test(source.slice(last))) {
              continue;
            }
            let suggestions = suggestionsByWord.get(word);
            if (!suggestions && includeSuggestions) {
              suggestions = dictionary.suggest(word, suggestionOptions)
                .map((suggestion) => suggestion.word);
              suggestionsByWord.set(word, suggestions);
            }
            suggestions ??= [];
            let fix = config.autocorrect && (!token.frontMatter || token.allowFix) &&
              source.slice(first, last) === word && standalone(source, first, last) ?
              replacement(word, suggestions, correct) : undefined;
            if (fix && token.frontMatter && !token.safeFix(tokenOffset + match.index, word.length, fix)) {
              fix = undefined;
            }
            onError({
              lineNumber,
              ...(token.frontMatter && front.native ? { "frontMatter": true } : {}),
              "detail": `Misspelled word: "${word}".${suggestions.length ? ` Suggestions: ${suggestions.join(", ")}.` : ""}`,
              "range": [ first + 1, word.length ],
              ...(token.frontMatter ? { "range": [ first + 1, last - first ], "context": word } : {}),
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
