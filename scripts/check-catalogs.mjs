import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCatalogHealth } from "./catalog-health.mjs";

function readSourceRepoArgument(arguments_) {
  let value;
  if (arguments_.length === 1 && arguments_[0].startsWith("--source-repo=")) {
    value = arguments_[0].slice("--source-repo=".length);
  } else if (arguments_.length === 2 && arguments_[0] === "--source-repo") {
    value = arguments_[1];
  }

  if (!value) {
    throw new Error(
      "Usage: npm run check -- --source-repo <path-to-custom-agent-skills>",
    );
  }

  return resolve(value);
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
