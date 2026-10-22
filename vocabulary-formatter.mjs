import { resolve } from "node:path";

export default async function vocabularyFormatter({ directory, results, fsPromises, logMessage }, output = ".spellcheck.txt") {
  if (typeof output !== "string" || !output.trim()) {
    throw new Error("The spelling candidate output path must be a nonempty string.");
  }
  const words = new Set();
  for (const result of results) {
    if (result.ruleNames.includes("spellcheck")) {
      const match = /^Misspelled word: "([^"]+)"\./u.exec(result.errorDetail);
      if (!match) {
        throw new Error(`Cannot collect spelling candidate: ${result.errorDetail}`);
      }
      words.add(match[1]);
    }
  }
  const entries = [ ...words ].sort();
  await fsPromises.writeFile(resolve(directory, output), [
    "# Review these candidates: remove typos before using this dictionary.",
    ...entries, ""
  ].join("\n"), { "flag": "wx" });
  logMessage(`Created ${output} with ${entries.length} candidate words. Review before adding it to dictionaries.`);
}
