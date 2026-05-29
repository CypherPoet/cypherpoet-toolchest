// Regenerates the Plugins table in README.md from .claude-plugin/marketplace.json,
// the single source of truth. Run with no args to rewrite the table, or with --check
// to exit non-zero when the table is out of sync (for CI / pre-commit use).
import { readFileSync, writeFileSync } from "node:fs";

const BEGIN = "<!-- BEGIN:PLUGINS-TABLE";
const END = "<!-- END:PLUGINS-TABLE -->";

const { plugins } = JSON.parse(
  readFileSync(".claude-plugin/marketplace.json", "utf8"),
);

const rows = [...plugins]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(
    (plugin) =>
      `| [\`${plugin.name}\`](${plugin.homepage}) | ${plugin.description.replace(/\.$/, "")} |`,
  );

const table = ["| Plugin | Description |", "| --- | --- |", ...rows].join("\n");

const readme = readFileSync("README.md", "utf8");
const begin = readme.indexOf(BEGIN);
const end = readme.indexOf(END);
if (begin === -1 || end === -1) {
  throw new Error("PLUGINS-TABLE markers not found in README.md");
}
const afterBeginLine = readme.indexOf("\n", begin) + 1;
const next =
  readme.slice(0, afterBeginLine) + "\n" + table + "\n\n" + readme.slice(end);

if (process.argv.includes("--check")) {
  if (next !== readme) {
    console.error(
      "README plugins table is out of sync. Run: node scripts/sync-readme-table.mjs",
    );
    process.exit(1);
  }
} else {
  writeFileSync("README.md", next);
}
