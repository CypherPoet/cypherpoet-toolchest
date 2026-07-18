import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildReadme,
  CLAUDE_CATALOG_PATH,
  CODEX_CATALOG_PATH,
  README_PATH,
} from "./catalog-health.mjs";

const catalogRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { plugins: claudePlugins } = JSON.parse(
  readFileSync(join(catalogRoot, CLAUDE_CATALOG_PATH), "utf8"),
);
const { plugins: codexPlugins } = JSON.parse(
  readFileSync(join(catalogRoot, CODEX_CATALOG_PATH), "utf8"),
);
const readmePath = join(catalogRoot, README_PATH);
const readme = readFileSync(readmePath, "utf8");
const next = buildReadme(readme, claudePlugins, codexPlugins);

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
