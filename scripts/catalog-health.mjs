import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CLAUDE_CATALOG_PATH = ".claude-plugin/marketplace.json";
export const CODEX_CATALOG_PATH = ".agents/plugins/marketplace.json";
export const README_PATH = "README.md";
export const SOURCE_REPOSITORY_URL =
  "https://github.com/CypherPoet/custom-agent-skills.git";
export const SOURCE_DEFAULT_BRANCH = "main";
export const EXPECTED_CODEX_DISPLAY_NAME = "CypherPoet Toolchest";
export const EXPECTED_CODEX_POLICY = {
  installation: "AVAILABLE",
  authentication: "ON_INSTALL",
};

const TABLE_BEGIN = "<!-- BEGIN:PLUGINS-TABLE";
const TABLE_END = "<!-- END:PLUGINS-TABLE -->";
const PLUGIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path, label, errors) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    errors.push(`${label} could not be read: ${error.message}`);
    return undefined;
  }
  try {
    return JSON.parse(text);
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
  if (catalog === undefined) {
    return [];
  }
  if (!isObject(catalog)) {
    errors.push(`${label} must be a JSON object.`);
    return [];
  }
  if (!Array.isArray(catalog.plugins)) {
    errors.push(`${label} must contain a plugins array.`);
    return [];
  }
  return catalog.plugins;
}

export function readCatalogPlugins(path, label) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read: ${error.message}`);
  }
  let catalog;
  try {
    catalog = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} could not be parsed: ${error.message}`);
  }
  if (!isObject(catalog) || !Array.isArray(catalog.plugins)) {
    throw new Error(`${label} must be a JSON object with a plugins array.`);
  }
  return catalog.plugins;
}

export function comparePluginNames(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareField(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(
      `${label} must be ${JSON.stringify(expected)}; found ${JSON.stringify(actual)}.`,
    );
  }
}

function validateCatalogNames(plugins, label, errors) {
  const names = [];
  const seen = new Set();
  for (const [index, plugin] of plugins.entries()) {
    if (!isObject(plugin)) {
      errors.push(`${label} entry ${index + 1} must be an object.`);
      continue;
    }
    if (typeof plugin.name !== "string" || !PLUGIN_NAME_PATTERN.test(plugin.name)) {
      errors.push(`${label} entry ${index + 1} has an invalid plugin name.`);
      continue;
    }
    names.push(plugin.name);
    if (seen.has(plugin.name)) {
      errors.push(`${label} contains duplicate plugin "${plugin.name}".`);
    }
    seen.add(plugin.name);
  }
  const sorted = [...names].sort(comparePluginNames);
  if (names.some((name, index) => name !== sorted[index])) {
    errors.push(`${label} plugins must be sorted by name.`);
  }
  return names;
}

function validateCatalogIdentity(catalog, label, errors) {
  if (isObject(catalog) && catalog.name !== "cypherpoet-toolchest") {
    errors.push(`${label} name must be "cypherpoet-toolchest".`);
  }
}

function validateCodexCatalogInterface(catalog, errors) {
  if (!isObject(catalog)) {
    return;
  }
  if (!isObject(catalog.interface)) {
    errors.push("Codex catalog interface must be an object.");
    return;
  }
  compareField(
    errors,
    "Codex catalog interface.displayName",
    catalog.interface.displayName,
    EXPECTED_CODEX_DISPLAY_NAME,
  );
}

function validateSource(source, pluginName, requireRef, label, errors) {
  if (!isObject(source)) {
    errors.push(`${label} source must be an object.`);
    return;
  }
  compareField(errors, `${label} source.source`, source.source, "git-subdir");
  compareField(errors, `${label} source.url`, source.url, SOURCE_REPOSITORY_URL);
  compareField(errors, `${label} source.path`, source.path, `plugins/${pluginName}`);
  if (requireRef || source.ref !== undefined) {
    compareField(errors, `${label} source.ref`, source.ref, SOURCE_DEFAULT_BRANCH);
  }
}

function validateManifest(manifest, pluginName, label, errors) {
  if (manifest === undefined) {
    return;
  }
  if (!isObject(manifest)) {
    errors.push(`${label} must be a JSON object.`);
    return;
  }
  compareField(errors, `${label} name`, manifest.name, pluginName);
  if (typeof manifest.version !== "string" || !VERSION_PATTERN.test(manifest.version)) {
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

function codexCategory(manifest, label, errors) {
  if (!isObject(manifest)) {
    return undefined;
  }
  if (!isObject(manifest.interface)) {
    errors.push(`${label} interface must be an object.`);
    return undefined;
  }
  if (typeof manifest.interface.category !== "string" || !manifest.interface.category.trim()) {
    errors.push(`${label} interface.category must be a non-empty string.`);
    return undefined;
  }
  return manifest.interface.category;
}

export function expectedHomepage(pluginName, manifest) {
  if (typeof manifest?.homepage === "string" && manifest.homepage.trim()) {
    return manifest.homepage;
  }
  const repositoryPage = SOURCE_REPOSITORY_URL.replace(/\.git$/, "");
  return `${repositoryPage}/tree/${SOURCE_DEFAULT_BRANCH}/plugins/${pluginName}`;
}

export function escapeMarkdownTableCell(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\s*\r?\n\s*/g, " ");
}

function escapeLinkDestination(url) {
  return escapeMarkdownTableCell(url)
    .replace(/ /g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export function renderPluginTable(claudePlugins, codexPlugins) {
  const claudePluginsByName = new Map();
  for (const [index, plugin] of claudePlugins.entries()) {
    if (!isObject(plugin) || typeof plugin.name !== "string" || !plugin.name) {
      throw new Error(`Claude catalog entry ${index + 1} must have a plugin name.`);
    }
    for (const field of ["description", "homepage"]) {
      if (typeof plugin[field] !== "string" || !plugin[field].trim()) {
        throw new Error(`Claude catalog plugin "${plugin.name}" must have a ${field}.`);
      }
    }
    claudePluginsByName.set(plugin.name, plugin);
  }

  const codexPluginsByName = new Map();
  for (const [index, plugin] of codexPlugins.entries()) {
    if (!isObject(plugin) || typeof plugin.name !== "string" || !plugin.name) {
      throw new Error(`Codex catalog entry ${index + 1} must have a plugin name.`);
    }
    codexPluginsByName.set(plugin.name, plugin);
  }

  const names = new Set([
    ...claudePluginsByName.keys(),
    ...codexPluginsByName.keys(),
  ]);
  const rows = [...names]
    .sort(comparePluginNames)
    .map((pluginName) => {
      const claudePlugin = claudePluginsByName.get(pluginName);
      const codexPlugin = codexPluginsByName.get(pluginName);
      let homepage = claudePlugin?.homepage;
      if (homepage === undefined) {
        const source = codexPlugin?.source;
        if (
          !isObject(source) ||
          typeof source.url !== "string" ||
          !source.url.trim() ||
          typeof source.path !== "string" ||
          !source.path.trim()
        ) {
          throw new Error(
            `Codex catalog plugin "${pluginName}" must have a usable source URL and path.`,
          );
        }
        const repositoryPage = source.url.replace(/\.git$/u, "");
        const ref =
          typeof source.ref === "string" && source.ref.trim()
            ? source.ref
            : SOURCE_DEFAULT_BRANCH;
        homepage = `${repositoryPage}/tree/${ref}/${source.path}`;
      }

      const name = escapeMarkdownTableCell(pluginName);
      const link = escapeLinkDestination(homepage);
      const description = claudePlugin
        ? escapeMarkdownTableCell(claudePlugin.description.replace(/\.$/, ""))
        : "—";
      const claudeAvailability = claudePlugin === undefined ? "—" : "✅";
      const codexAvailability = codexPlugin === undefined ? "—" : "✅";
      return `| [\`${name}\`](${link}) | ${claudeAvailability} | ${codexAvailability} | ${description} |`;
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
  return `${readme.slice(0, afterBeginLine + 1)}\n${table}\n\n${readme.slice(end)}`;
}

export function buildReadme(readme, claudePlugins, codexPlugins) {
  return replacePluginTable(readme, renderPluginTable(claudePlugins, codexPlugins));
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
  const readme = readText(join(catalogRoot, README_PATH), "README", errors);

  validateCatalogIdentity(claudeCatalog, "Claude catalog", errors);
  validateCatalogIdentity(codexCatalog, "Codex catalog", errors);
  validateCodexCatalogInterface(codexCatalog, errors);

  const claudePlugins = getPlugins(claudeCatalog, "Claude catalog", errors);
  const codexPlugins = getPlugins(codexCatalog, "Codex catalog", errors);
  validateCatalogNames(claudePlugins, "Claude catalog", errors);
  validateCatalogNames(codexPlugins, "Codex catalog", errors);

  for (const plugin of claudePlugins) {
    if (!isObject(plugin) || typeof plugin.name !== "string") {
      continue;
    }
    const label = `Claude catalog plugin "${plugin.name}"`;
    validateSource(plugin.source, plugin.name, false, label, errors);
    const manifestLabel = `Claude source manifest for "${plugin.name}"`;
    const manifest = readJson(
      join(sourceRepo, "plugins", plugin.name, ".claude-plugin/plugin.json"),
      manifestLabel,
      errors,
    );
    validateManifest(manifest, plugin.name, manifestLabel, errors);
    if (isObject(manifest)) {
      compareField(errors, `${label} description`, plugin.description, manifest.description);
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
    if (!isObject(plugin.policy)) {
      errors.push(`${label} policy must be an object.`);
    } else {
      compareField(
        errors,
        `${label} policy.installation`,
        plugin.policy.installation,
        EXPECTED_CODEX_POLICY.installation,
      );
      compareField(
        errors,
        `${label} policy.authentication`,
        plugin.policy.authentication,
        EXPECTED_CODEX_POLICY.authentication,
      );
    }
    const manifestLabel = `Codex source manifest for "${plugin.name}"`;
    const manifest = readJson(
      join(sourceRepo, "plugins", plugin.name, ".codex-plugin/plugin.json"),
      manifestLabel,
      errors,
    );
    validateManifest(manifest, plugin.name, manifestLabel, errors);
    const category = codexCategory(manifest, manifestLabel, errors);
    if (category !== undefined) {
      compareField(errors, `${label} category`, plugin.category, category);
    }
  }

  const catalogsRenderable =
    Array.isArray(claudeCatalog?.plugins) && Array.isArray(codexCatalog?.plugins);
  if (typeof readme === "string" && catalogsRenderable) {
    try {
      const expectedReadme = buildReadme(readme, claudePlugins, codexPlugins);
      if (expectedReadme !== readme) {
        errors.push(
          "README plugins table is out of sync. Run: node scripts/sync-readme-table.mjs",
        );
      }
    } catch (error) {
      errors.push(`README plugins table could not be generated: ${error.message}`);
    }
  }

  return {
    counts: { claude: claudePlugins.length, codex: codexPlugins.length },
    errors,
  };
}
