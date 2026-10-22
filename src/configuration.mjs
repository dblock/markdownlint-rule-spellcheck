export function dictionaryEntries(value = { "en": [ "@cspell/dict-en_us" ] }) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length) {
    throw new Error("spellcheck.dictionaries must be a nonempty object mapping languages to dictionary arrays.");
  }
  for (const [ language, entries ] of Object.entries(value)) {
    if (!language.trim() || !Array.isArray(entries) || !entries.length ||
        entries.some((name) => typeof name !== "string" || !name)) {
      throw new Error(`spellcheck.dictionaries.${language} must be a nonempty array of dictionary names or .txt paths.`);
    }
  }
  return value;
}

export function markdownOptions(config) {
  if (config.frontMatter !== undefined) {
    throw new Error("Move spellcheck.frontMatter to spellcheck.markdown.frontMatter.");
  }
  const markdown = config.markdown === undefined ? {} : config.markdown;
  if (!markdown || typeof markdown !== "object" || Array.isArray(markdown)) {
    throw new Error("spellcheck.markdown must be an object.");
  }
  return markdown;
}
