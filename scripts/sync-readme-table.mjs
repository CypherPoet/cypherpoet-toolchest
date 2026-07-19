import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadme,
  CLAUDE_CATALOG_PATH,
  CODEX_CATALOG_PATH,
  README_PATH,
  readCatalogPlugins,
} from "./catalog-health.mjs";

const catalogRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(catalogRoot, README_PATH);

let readme;
let next;
try {
  const claudePlugins = readCatalogPlugins(
    join(catalogRoot, CLAUDE_CATALOG_PATH),
    "Claude catalog",
  );
  const codexPlugins = readCatalogPlugins(
    join(catalogRoot, CODEX_CATALOG_PATH),
    "Codex catalog",
  );
  readme = readFileSync(readmePath, "utf8");
  next = buildReadme(readme, claudePlugins, codexPlugins);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (process.argv.includes("--check")) {
  if (next !== readme) {
    console.error(
      "README plugins table is out of sync. Run: node scripts/sync-readme-table.mjs",
    );
    process.exit(1);
  }
} else {
  writeFileSync(readmePath, next);
}
