import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_CATALOG_PATH = ".claude-plugin/marketplace.json";
export const CODEX_CATALOG_PATH = ".agents/plugins/marketplace.json";
export const README_PATH = "README.md";
export const REGISTRY_PATH = "scripts/plugin-registry.json";

const SOURCE_REPOSITORY_URL =
  "https://github.com/CypherPoet/custom-agent-skills.git";
const TABLE_BEGIN = "<!-- BEGIN:PLUGINS-TABLE";
const TABLE_END = "<!-- END:PLUGINS-TABLE -->";
const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path, label, errors) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label} could not be parsed: ${error.message}`);
    return undefined;
  }
}

function readText(path, label, errors) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${label} could not be read: ${error.message}`);
    return undefined;
  }
}

function getPlugins(catalog, label, errors) {
  if (!isObject(catalog)) {
    return [];
  }
  if (!Array.isArray(catalog.plugins)) {
    errors.push(`${label} must contain a plugins array.`);
    return [];
  }
  return catalog.plugins;
}

function validateCatalogNames(plugins, label, errors) {
  const names = [];
  const seen = new Set();

  for (const [index, plugin] of plugins.entries()) {
    if (!isObject(plugin)) {
      errors.push(`${label} entry ${index + 1} must be an object.`);
      continue;
    }

    const { name } = plugin;
    if (typeof name !== "string" || !PLUGIN_NAME_PATTERN.test(name)) {
      errors.push(`${label} entry ${index + 1} has an invalid plugin name.`);
      continue;
    }

    names.push(name);
    if (seen.has(name)) {
      errors.push(`${label} contains duplicate plugin "${name}".`);
    }
    seen.add(name);
  }

  const sortedNames = [...names].sort((left, right) =>
    left.localeCompare(right),
  );
  if (names.some((name, index) => name !== sortedNames[index])) {
    errors.push(`${label} plugins must be sorted by name.`);
  }

  return names;
}

function validateCatalogIdentity(catalog, label, errors) {
  if (isObject(catalog) && catalog.name !== "cypherpoet-toolchest") {
    errors.push(`${label} name must be "cypherpoet-toolchest".`);
  }
}

function compareField(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(
      `${label} must be ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`,
    );
  }
}

function validateSource(source, pluginName, requireMainRef, label, errors) {
  if (!isObject(source)) {
    errors.push(`${label} source must be an object.`);
    return;
  }

  compareField(errors, `${label} source.source`, source.source, "git-subdir");
  compareField(
    errors,
    `${label} source.url`,
    source.url,
    SOURCE_REPOSITORY_URL,
  );
  compareField(
    errors,
    `${label} source.path`,
    source.path,
    `plugins/${pluginName}`,
  );
  if (requireMainRef) {
    compareField(errors, `${label} source.ref`, source.ref, "main");
  }
}

function validateManifest(manifest, pluginName, label, errors) {
  if (!isObject(manifest)) {
    return;
  }

  compareField(errors, `${label} name`, manifest.name, pluginName);
  if (
    typeof manifest.version !== "string" ||
    !VERSION_PATTERN.test(manifest.version)
  ) {
    errors.push(`${label} version must be a semantic version.`);
  }
  if (typeof manifest.description !== "string" || !manifest.description.trim()) {
    errors.push(`${label} description must be a non-empty string.`);
  }
  if (
    manifest.homepage !== undefined &&
    (typeof manifest.homepage !== "string" || !manifest.homepage.trim())
  ) {
    errors.push(`${label} homepage must be a non-empty string when present.`);
  }
}

function expectedHomepage(pluginName, manifest) {
  if (typeof manifest?.homepage === "string" && manifest.homepage.trim()) {
    return manifest.homepage;
  }
  return `https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/${pluginName}`;
}

function validateRegistry(registry, errors) {
  if (!isObject(registry)) {
    return { claudeOnlyPlugins: {}, dualHarnessPlugins: {} };
  }

  const dualHarnessPlugins = isObject(registry.dual_harness_plugins)
    ? registry.dual_harness_plugins
    : {};
  const claudeOnlyPlugins = isObject(registry.claude_only_plugins)
    ? registry.claude_only_plugins
    : {};

  if (!isObject(registry.dual_harness_plugins)) {
    errors.push("Source registry dual_harness_plugins must be an object.");
  }
  if (!isObject(registry.claude_only_plugins)) {
    errors.push("Source registry claude_only_plugins must be an object.");
  }

  for (const [name, metadata] of Object.entries(dualHarnessPlugins)) {
    if (!PLUGIN_NAME_PATTERN.test(name)) {
      errors.push(`Source registry has invalid dual-harness name "${name}".`);
    }
    if (
      !isObject(metadata) ||
      typeof metadata.category !== "string" ||
      !metadata.category.trim()
    ) {
      errors.push(
        `Source registry dual-harness plugin "${name}" needs a category.`,
      );
    }
    if (Object.hasOwn(claudeOnlyPlugins, name)) {
      errors.push(`Source registry classifies "${name}" in both harness sets.`);
    }
  }

  for (const [name, reason] of Object.entries(claudeOnlyPlugins)) {
    if (!PLUGIN_NAME_PATTERN.test(name)) {
      errors.push(`Source registry has invalid Claude-only name "${name}".`);
    }
    if (typeof reason !== "string" || !reason.trim()) {
      errors.push(
        `Source registry Claude-only plugin "${name}" needs a reason.`,
      );
    }
  }

  return { claudeOnlyPlugins, dualHarnessPlugins };
}

export function escapeMarkdownTableCell(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\r?\n\s*/g, " ");
}

export function renderPluginTable(claudePlugins, codexPlugins) {
  const codexNames = new Set(codexPlugins.map((plugin) => plugin.name));
  const rows = [...claudePlugins]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((plugin) => {
      const name = escapeMarkdownTableCell(plugin.name);
      const homepage = escapeMarkdownTableCell(plugin.homepage);
      const description = escapeMarkdownTableCell(
        plugin.description.replace(/\.$/, ""),
      );
      const codexAvailability = codexNames.has(plugin.name) ? "✅" : "—";
      return `| [\`${name}\`](${homepage}) | ✅ | ${codexAvailability} | ${description} |`;
    });

  return [
    "| Plugin | Claude Code | Codex | Description |",
    "| --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function replacePluginTable(readme, table) {
  const begin = readme.indexOf(TABLE_BEGIN);
  const end = readme.indexOf(TABLE_END);
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error("PLUGINS-TABLE markers not found in README.md");
  }

  const afterBeginLine = readme.indexOf("\n", begin);
  if (afterBeginLine === -1 || afterBeginLine > end) {
    throw new Error("PLUGINS-TABLE begin marker must occupy its own line");
  }

  return (
    readme.slice(0, afterBeginLine + 1) +
    "\n" +
    table +
    "\n\n" +
    readme.slice(end)
  );
}

export function buildReadme(readme, claudePlugins, codexPlugins) {
  return replacePluginTable(
    readme,
    renderPluginTable(claudePlugins, codexPlugins),
  );
}

export function validateCatalogHealth({ catalogRoot, sourceRepo }) {
  const errors = [];
  const claudeCatalog = readJson(
    join(catalogRoot, CLAUDE_CATALOG_PATH),
    "Claude catalog",
    errors,
  );
  const codexCatalog = readJson(
    join(catalogRoot, CODEX_CATALOG_PATH),
    "Codex catalog",
    errors,
  );
  const registry = readJson(
    join(sourceRepo, REGISTRY_PATH),
    "Source registry",
    errors,
  );
  const readme = readText(join(catalogRoot, README_PATH), "README", errors);

  validateCatalogIdentity(claudeCatalog, "Claude catalog", errors);
  validateCatalogIdentity(codexCatalog, "Codex catalog", errors);

  const claudePlugins = getPlugins(claudeCatalog, "Claude catalog", errors);
  const codexPlugins = getPlugins(codexCatalog, "Codex catalog", errors);
  const claudeNames = validateCatalogNames(
    claudePlugins,
    "Claude catalog",
    errors,
  );
  const codexNames = validateCatalogNames(codexPlugins, "Codex catalog", errors);
  const { claudeOnlyPlugins, dualHarnessPlugins } = validateRegistry(
    registry,
    errors,
  );

  const claudeNameSet = new Set(claudeNames);
  const codexNameSet = new Set(codexNames);
  const classifiedNames = new Set([
    ...Object.keys(dualHarnessPlugins),
    ...Object.keys(claudeOnlyPlugins),
  ]);
  const claudeManifests = new Map();

  for (const pluginName of [...classifiedNames].sort()) {
    const manifestRoot = join(sourceRepo, "plugins", pluginName);
    const claudeManifest = readJson(
      join(manifestRoot, ".claude-plugin/plugin.json"),
      `Claude source manifest for "${pluginName}"`,
      errors,
    );
    validateManifest(
      claudeManifest,
      pluginName,
      `Claude source manifest for "${pluginName}"`,
      errors,
    );
    claudeManifests.set(pluginName, claudeManifest);

    if (Object.hasOwn(dualHarnessPlugins, pluginName)) {
      const codexManifest = readJson(
        join(manifestRoot, ".codex-plugin/plugin.json"),
        `Codex source manifest for "${pluginName}"`,
        errors,
      );
      validateManifest(
        codexManifest,
        pluginName,
        `Codex source manifest for "${pluginName}"`,
        errors,
      );
      if (isObject(claudeManifest) && isObject(codexManifest)) {
        for (const field of ["name", "version", "description", "homepage"]) {
          compareField(
            errors,
            `Codex source manifest for "${pluginName}" ${field}`,
            codexManifest[field],
            claudeManifest[field],
          );
        }
      }
    }
  }

  for (const pluginName of claudeNames) {
    const isDualHarness = Object.hasOwn(dualHarnessPlugins, pluginName);
    const isClaudeOnly = Object.hasOwn(claudeOnlyPlugins, pluginName);
    if (!isDualHarness && !isClaudeOnly) {
      errors.push(`Published Claude plugin "${pluginName}" is unclassified.`);
    }
  }

  const expectedCodexNames = new Set(
    claudeNames.filter((name) => Object.hasOwn(dualHarnessPlugins, name)),
  );
  for (const pluginName of expectedCodexNames) {
    if (!codexNameSet.has(pluginName)) {
      errors.push(
        `Codex catalog is missing dual-harness plugin "${pluginName}".`,
      );
    }
  }
  for (const pluginName of codexNames) {
    if (!expectedCodexNames.has(pluginName)) {
      errors.push(`Codex catalog has unexpected plugin "${pluginName}".`);
    }
    if (!claudeNameSet.has(pluginName)) {
      errors.push(
        `Codex plugin "${pluginName}" is not published for Claude Code.`,
      );
    }
  }

  for (const plugin of claudePlugins) {
    if (!isObject(plugin) || typeof plugin.name !== "string") {
      continue;
    }
    const label = `Claude catalog plugin "${plugin.name}"`;
    validateSource(plugin.source, plugin.name, false, label, errors);
    const manifest = claudeManifests.get(plugin.name);
    if (isObject(manifest)) {
      compareField(
        errors,
        `${label} description`,
        plugin.description,
        manifest.description,
      );
      compareField(
        errors,
        `${label} homepage`,
        plugin.homepage,
        expectedHomepage(plugin.name, manifest),
      );
    }
  }

  for (const plugin of codexPlugins) {
    if (!isObject(plugin) || typeof plugin.name !== "string") {
      continue;
    }
    const label = `Codex catalog plugin "${plugin.name}"`;
    validateSource(plugin.source, plugin.name, true, label, errors);
    const classification = dualHarnessPlugins[plugin.name];
    if (isObject(classification)) {
      compareField(
        errors,
        `${label} category`,
        plugin.category,
        classification.category,
      );
    }
    if (!isObject(plugin.policy)) {
      errors.push(`${label} policy must be an object.`);
    } else {
      compareField(
        errors,
        `${label} policy.installation`,
        plugin.policy.installation,
        "AVAILABLE",
      );
      compareField(
        errors,
        `${label} policy.authentication`,
        plugin.policy.authentication,
        "ON_INSTALL",
      );
    }
  }

  if (typeof readme === "string") {
    try {
      const expectedReadme = buildReadme(readme, claudePlugins, codexPlugins);
      if (expectedReadme !== readme) {
        errors.push(
          "README plugins table is out of sync. Run: node scripts/sync-readme-table.mjs",
        );
      }
    } catch (error) {
      errors.push(
        `README plugins table could not be generated: ${error.message}`,
      );
    }
  }

  return {
    counts: {
      claude: claudePlugins.length,
      codex: codexPlugins.length,
    },
    errors,
  };
}
