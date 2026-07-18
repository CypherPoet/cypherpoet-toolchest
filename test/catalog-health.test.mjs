import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildReadme,
  renderPluginTable,
  validateCatalogHealth,
} from "../scripts/catalog-health.mjs";

const SOURCE_URL =
  "https://github.com/CypherPoet/custom-agent-skills.git";

function fallbackHomepage(name) {
  return `https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/${name}`;
}

function sourceFor(name, includeRef = false) {
  return {
    source: "git-subdir",
    url: SOURCE_URL,
    path: `plugins/${name}`,
    ...(includeRef ? { ref: "main" } : {}),
  };
}

function codexEntry(name, category = "Developer Tools") {
  return {
    name,
    source: sourceFor(name, true),
    policy: {
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    },
    category,
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function refreshReadme(fixture) {
  const claudeCatalog = await readJson(fixture.claudeCatalogPath);
  const codexCatalog = await readJson(fixture.codexCatalogPath);
  const readme = await readFile(fixture.readmePath, "utf8");
  await writeFile(
    fixture.readmePath,
    buildReadme(readme, claudeCatalog.plugins, codexCatalog.plugins),
  );
}

async function createFixture(t) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "catalog-health-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));

  const catalogRoot = join(fixtureRoot, "catalog");
  const sourceRepo = join(fixtureRoot, "source");
  const claudeCatalogPath = join(
    catalogRoot,
    ".claude-plugin/marketplace.json",
  );
  const codexCatalogPath = join(
    catalogRoot,
    ".agents/plugins/marketplace.json",
  );
  const registryPath = join(sourceRepo, "scripts/plugin-registry.json");
  const readmePath = join(catalogRoot, "README.md");

  const dualNames = Array.from(
    { length: 22 },
    (_, index) => `cypherpoet-dual-${String(index + 1).padStart(2, "0")}`,
  );
  const claudeOnlyNames = [
    "cypherpoet-claude-only-01",
    "cypherpoet-claude-only-02",
  ];
  const unpublishedName = "cypherpoet-unpublished";
  const manifests = new Map();

  for (const [index, name] of [
    ...dualNames,
    ...claudeOnlyNames,
    unpublishedName,
  ].entries()) {
    const manifest = {
      name,
      version: `1.0.${index}`,
      description:
        name === dualNames[1]
          ? "Description with a | delimiter and a \\ path."
          : `${name} description.`,
      ...(name === dualNames[0] ? {} : { homepage: fallbackHomepage(name) }),
    };
    manifests.set(name, manifest);
    await writeJson(
      join(sourceRepo, "plugins", name, ".claude-plugin/plugin.json"),
      manifest,
    );
    if (dualNames.includes(name) || name === unpublishedName) {
      await writeJson(
        join(sourceRepo, "plugins", name, ".codex-plugin/plugin.json"),
        manifest,
      );
    }
  }

  const dualHarnessPlugins = Object.fromEntries(
    [...dualNames, unpublishedName]
      .sort()
      .map((name) => [name, { category: "Developer Tools" }]),
  );
  const claudeOnlyPlugins = Object.fromEntries(
    claudeOnlyNames.map((name) => [name, "Harness-specific behavior."]),
  );
  await writeJson(registryPath, {
    dual_harness_plugins: dualHarnessPlugins,
    claude_only_plugins: claudeOnlyPlugins,
  });

  const publishedNames = [...dualNames, ...claudeOnlyNames].sort();
  const claudePlugins = publishedNames.map((name) => {
    const manifest = manifests.get(name);
    return {
      name,
      source: sourceFor(name),
      description: manifest.description,
      homepage: manifest.homepage ?? fallbackHomepage(name),
    };
  });
  const codexPlugins = dualNames.map((name) => codexEntry(name));
  await writeJson(claudeCatalogPath, {
    name: "cypherpoet-toolchest",
    plugins: claudePlugins,
  });
  await writeJson(codexCatalogPath, {
    name: "cypherpoet-toolchest",
    plugins: codexPlugins,
  });

  const readmeShell = [
    "# Fixture",
    "",
    "<!-- BEGIN:PLUGINS-TABLE (generated) -->",
    "",
    "stale",
    "",
    "<!-- END:PLUGINS-TABLE -->",
    "",
  ].join("\n");
  await writeFile(
    readmePath,
    buildReadme(readmeShell, claudePlugins, codexPlugins),
  );

  return {
    catalogRoot,
    claudeCatalogPath,
    codexCatalogPath,
    dualNames,
    claudeOnlyNames,
    readmePath,
    registryPath,
    sourceRepo,
    unpublishedName,
  };
}

function validate(fixture) {
  return validateCatalogHealth({
    catalogRoot: fixture.catalogRoot,
    sourceRepo: fixture.sourceRepo,
  });
}

test("accepts the current 24 Claude / 22 Codex state and unpublished source plugins", async (t) => {
  const fixture = await createFixture(t);
  const result = validate(fixture);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.counts, { claude: 24, codex: 22 });
});

test("reports duplicate and unsorted catalog names", async (t) => {
  await t.test("duplicate", async (t) => {
    const fixture = await createFixture(t);
    const catalog = await readJson(fixture.claudeCatalogPath);
    catalog.plugins.splice(1, 0, structuredClone(catalog.plugins[0]));
    await writeJson(fixture.claudeCatalogPath, catalog);
    await refreshReadme(fixture);

    assert.ok(
      validate(fixture).errors.some((error) => error.includes("duplicate plugin")),
    );
  });

  await t.test("unsorted", async (t) => {
    const fixture = await createFixture(t);
    const catalog = await readJson(fixture.codexCatalogPath);
    [catalog.plugins[0], catalog.plugins[1]] = [
      catalog.plugins[1],
      catalog.plugins[0],
    ];
    await writeJson(fixture.codexCatalogPath, catalog);

    assert.ok(
      validate(fixture).errors.some((error) =>
        error.includes("Codex catalog plugins must be sorted"),
      ),
    );
  });
});

test("reports missing and extra Codex entries", async (t) => {
  await t.test("missing dual-harness plugin", async (t) => {
    const fixture = await createFixture(t);
    const catalog = await readJson(fixture.codexCatalogPath);
    const [removed] = catalog.plugins.splice(0, 1);
    await writeJson(fixture.codexCatalogPath, catalog);
    await refreshReadme(fixture);

    assert.ok(
      validate(fixture).errors.includes(
        `Codex catalog is missing dual-harness plugin "${removed.name}".`,
      ),
    );
  });

  await t.test("extra Claude-only plugin", async (t) => {
    const fixture = await createFixture(t);
    const catalog = await readJson(fixture.codexCatalogPath);
    const extraName = fixture.claudeOnlyNames[0];
    catalog.plugins.push(codexEntry(extraName));
    catalog.plugins.sort((left, right) => left.name.localeCompare(right.name));
    await writeJson(fixture.codexCatalogPath, catalog);
    await refreshReadme(fixture);

    assert.ok(
      validate(fixture).errors.includes(
        `Codex catalog has unexpected plugin "${extraName}".`,
      ),
    );
  });
});

test("reports classification drift", async (t) => {
  const fixture = await createFixture(t);
  const registry = await readJson(fixture.registryPath);
  const pluginName = fixture.dualNames[0];
  delete registry.dual_harness_plugins[pluginName];
  registry.claude_only_plugins[pluginName] = "Incorrectly reclassified.";
  await writeJson(fixture.registryPath, registry);

  assert.ok(
    validate(fixture).errors.includes(
      `Codex catalog has unexpected plugin "${pluginName}".`,
    ),
  );
});

test("aggregates metadata, source, category, and policy drift", async (t) => {
  const fixture = await createFixture(t);
  const pluginName = fixture.dualNames[0];
  const claudeCatalog = await readJson(fixture.claudeCatalogPath);
  const claudePlugin = claudeCatalog.plugins.find(
    (plugin) => plugin.name === pluginName,
  );
  claudePlugin.description = "Drifted description.";
  claudePlugin.source.url = "https://example.com/wrong.git";
  await writeJson(fixture.claudeCatalogPath, claudeCatalog);

  const codexCatalog = await readJson(fixture.codexCatalogPath);
  const codexPlugin = codexCatalog.plugins.find(
    (plugin) => plugin.name === pluginName,
  );
  codexPlugin.source.ref = "develop";
  codexPlugin.category = "Wrong";
  codexPlugin.policy.installation = "BLOCKED";
  codexPlugin.policy.authentication = "NEVER";
  await writeJson(fixture.codexCatalogPath, codexCatalog);
  await refreshReadme(fixture);

  const errors = validate(fixture).errors.join("\n");
  assert.match(errors, /description/);
  assert.match(errors, /source\.url/);
  assert.match(errors, /source\.ref/);
  assert.match(errors, /category/);
  assert.match(errors, /policy\.installation/);
  assert.match(errors, /policy\.authentication/);
});

test("reports source manifest name and version mismatches", async (t) => {
  const fixture = await createFixture(t);
  const pluginName = fixture.dualNames[0];
  const manifestPath = join(
    fixture.sourceRepo,
    "plugins",
    pluginName,
    ".codex-plugin/plugin.json",
  );
  const manifest = await readJson(manifestPath);
  manifest.name = "wrong-name";
  manifest.version = "9.9.9";
  await writeJson(manifestPath, manifest);

  const errors = validate(fixture).errors.join("\n");
  assert.match(errors, /Codex source manifest.* name/);
  assert.match(errors, /Codex source manifest.* version/);
});

test("reports a stale README table", async (t) => {
  const fixture = await createFixture(t);
  const readme = await readFile(fixture.readmePath, "utf8");
  await writeFile(fixture.readmePath, readme.replace("description", "stale"));

  assert.ok(
    validate(fixture).errors.some((error) =>
      error.includes("README plugins table is out of sync"),
    ),
  );
});

test("escapes Markdown table delimiters", () => {
  const table = renderPluginTable(
    [
      {
        name: "example-plugin",
        homepage: "https://example.com/a|b",
        description: "A | B \\ C.",
      },
    ],
    [],
  );

  assert.match(table, /https:\/\/example\.com\/a\\\|b/);
  assert.match(table, /A \\\| B \\\\ C/);
  assert.match(table, /\| ✅ \| — \|/);
});

test("the check command requires an explicit source checkout", () => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/check-catalogs.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--source-repo/);
});
