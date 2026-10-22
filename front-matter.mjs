import { isMap, isScalar, isSeq, parseDocument, parse } from "yaml";

export function frontMatter(params, option) {
  const config = option === undefined || option === true ? {} : option;
  if (config !== false && (!config || typeof config !== "object" || Array.isArray(config))) {
    throw new Error("spellcheck.frontMatter must be a boolean or an object.");
  }
  for (const key of [ "include", "exclude" ]) {
    if (config && config[key] !== undefined && (!Array.isArray(config[key]) ||
        config[key].some((path) => typeof path !== "string" || !path || path.split(".").some((part) => !part)))) {
      throw new Error(`spellcheck.frontMatter.${key} must be an array of dotted field paths.`);
    }
  }
  if (params.frontMatterLines.length) {
    if (config !== false) {
      throw new Error('Front matter checking requires "frontMatter": "a^" in .markdownlint-cli2.jsonc (or frontMatter: null in markdownlint API options).');
    }
    return { "endLine": 0, "tokens": [] };
  }
  if (params.lines[0]?.replace(/^\uFEFF/u, "") !== "---") {
    return { "endLine": 0, "tokens": [] };
  }
  const end = params.lines.findIndex((line, index) => index > 0 && /^(?:---|\.\.\.)\s*$/u.test(line));
  if (end < 0) {
    throw new Error("Unterminated YAML front matter.");
  }
  if (config === false) {
    return { "endLine": end + 1, "tokens": [] };
  }
  const source = params.lines.slice(1, end).join("\n");
  const doc = parseDocument(source, { "keepSourceTokens": true, "strict": true });
  if (doc.errors.length || doc.warnings.length) {
    throw new Error(`Invalid YAML front matter: ${(doc.errors[0] || doc.warnings[0]).message}`);
  }
  const offsets = [ 0 ];
  for (const match of source.matchAll(/\n/gu)) {
    offsets.push(match.index + 1);
  }
  const position = (offset) => {
    let line = 0;
    while (line + 1 < offsets.length && offsets[line + 1] <= offset) {
      line++;
    }
    return { "line": line + 2, "column": offset - offsets[line] + 1 };
  };
  const matches = (paths, path) => paths.some((parent) => path === parent || path.startsWith(`${parent}.`));
  const tokens = [];
  function visit(node, path) {
    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key) || typeof pair.key.value !== "string") {
          throw new Error("YAML front matter field names must be strings.");
        }
        visit(pair.value, path ? `${path}.${pair.key.value}` : pair.key.value);
      }
    } else if (isSeq(node)) {
      for (const item of node.items) {
        visit(item, path);
      }
    } else if (isScalar(node) && typeof node.value === "string") {
      if ((config.include && !matches(config.include, path)) || matches(config.exclude || [], path)) {
        return;
      }
      const token = node.srcToken;
      let raw = source.slice(node.range[0], node.range[1]);
      let offset = node.range[0];
      const quoted = node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE";
      if (quoted) {
        raw = raw.slice(1, -1);
        offset++;
      } else if (token.type === "block-scalar") {
        raw = token.source;
        offset = node.range[0] + token.props.reduce((length, prop) => length + prop.source.length, 0);
      }
      let text = "";
      const mapping = [];
      for (let index = 0; index < raw.length;) {
        let length = 1;
        let decoded = raw[index];
        if (node.type === "QUOTE_SINGLE" && raw.startsWith("''", index)) {
          length = 2;
          decoded = "'";
        } else if (node.type === "QUOTE_DOUBLE" && raw[index] === "\\") {
          const escape = /^\\(?:x[\da-f]{2}|u[\da-f]{4}|U[\da-f]{8}|[\s\S])/iu.exec(raw.slice(index))[0];
          length = escape.length;
          if (/^\\\n/u.test(escape)) {
            while (/[ \t]/u.test(raw[index + length] || "") && index + length < raw.length) {
              length++;
            }
            decoded = "";
          } else {
            decoded = parse(`"${escape}"`);
          }
        }
        text += decoded;
        for (let unit = 0; unit < decoded.length; unit++) {
          mapping.push([ position(offset + index), position(offset + index + length) ]);
        }
        index += length;
      }
      tokens.push({
        text, mapping, "frontMatter": true, "allowFix": !quoted && node.type === "PLAIN",
        "safeFix": (start, length, replacement) =>
          typeof parse(text.slice(0, start) + replacement + text.slice(start + length)) === "string"
      });
    }
    // Aliases are not expanded: anchored values are checked at their definition.
  }
  visit(doc.contents, "");
  return { "endLine": end + 1, tokens };
}
