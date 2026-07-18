import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCatalogHealth } from "./catalog-health.mjs";

function readSourceRepoArgument(arguments_) {
  const sourceRepoIndexes = arguments_
    .map((argument, index) => (argument === "--source-repo" ? index : -1))
    .filter((index) => index !== -1);

  if (
    sourceRepoIndexes.length !== 1 ||
    arguments_.length !== 2 ||
    sourceRepoIndexes[0] !== 0 ||
    !arguments_[1]
  ) {
    throw new Error(
      "Usage: npm run check -- --source-repo <path-to-custom-agent-skills>",
    );
  }

  return resolve(arguments_[1]);
}

let sourceRepo;
try {
  sourceRepo = readSourceRepoArgument(process.argv.slice(2));
  if (!existsSync(sourceRepo) || !statSync(sourceRepo).isDirectory()) {
    throw new Error(`Source repository is not a directory: ${sourceRepo}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const catalogRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { counts, errors } = validateCatalogHealth({ catalogRoot, sourceRepo });

if (errors.length > 0) {
  console.error(`Catalog health failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Catalog health passed: ${counts.claude} Claude Code plugins, ${counts.codex} Codex plugins.`,
);
