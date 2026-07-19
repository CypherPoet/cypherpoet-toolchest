import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildReadme,
  comparePluginNames,
  EXPECTED_CODEX_POLICY,
  expectedHomepage,
  renderPluginTable,
  SOURCE_DEFAULT_BRANCH,
  SOURCE_REPOSITORY_URL,
  validateCatalogHealth,
} from "../scripts/catalog-health.mjs";

function fallbackHomepage(name) {
  return expectedHomepage(name, undefined);
}

function sourceFor(name, includeRef = false) {
  return {
    source: "git-subdir",
    url: SOURCE_REPOSITORY_URL,
    path: `plugins/${name}`,
    ...(includeRef ? { ref: SOURCE_DEFAULT_BRANCH } : {}),
  };
}

function codexEntry(name, category = "Developer Tools") {
  return {
    name,
    source: sourceFor(name, true),
    policy: { ...EXPECTED_CODEX_POLICY },
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
    catalog.plugins.sort((left, right) =>
      comparePluginNames(left.name, right.name),
    );
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

test("reports structurally invalid catalogs and manifests", async (t) => {
  await t.test("non-object catalog", async (t) => {
    const fixture = await createFixture(t);
    await writeFile(fixture.claudeCatalogPath, "[]\n");

    const errors = validate(fixture).errors;
    assert.ok(errors.includes("Claude catalog must be a JSON object."));
  });

  await t.test("missing plugins array without claiming README drift", async (t) => {
    const fixture = await createFixture(t);
    await writeJson(fixture.claudeCatalogPath, { name: "cypherpoet-toolchest" });

    const errors = validate(fixture).errors;
    assert.ok(errors.includes("Claude catalog must contain a plugins array."));
    assert.ok(
      !errors.some((error) => error.includes("README plugins table is out of sync")),
    );
  });

  await t.test("non-object source manifest", async (t) => {
    const fixture = await createFixture(t);
    const manifestPath = join(
      fixture.sourceRepo,
      "plugins",
      fixture.dualNames[0],
      ".claude-plugin/plugin.json",
    );
    await writeFile(manifestPath, "null\n");

    assert.ok(
      validate(fixture).errors.includes(
        `Claude source manifest for "${fixture.dualNames[0]}" must be a JSON object.`,
      ),
    );
  });
});

test("reports a Claude catalog entry pinned to a non-default ref", async (t) => {
  const fixture = await createFixture(t);
  const catalog = await readJson(fixture.claudeCatalogPath);
  catalog.plugins[0].source.ref = "develop";
  await writeJson(fixture.claudeCatalogPath, catalog);

  assert.ok(
    validate(fixture).errors.some((error) =>
      /Claude catalog plugin .* source\.ref/.test(error),
    ),
  );
});

test("accepts a registry-less source repo as all Claude-only", async (t) => {
  const fixture = await createFixture(t);
  await rm(fixture.registryPath);
  await writeJson(fixture.codexCatalogPath, {
    name: "cypherpoet-toolchest",
    plugins: [],
  });
  await refreshReadme(fixture);

  const result = validate(fixture);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.counts, { claude: 24, codex: 0 });
});

test("escapes Markdown table delimiters and link-breaking URL characters", () => {
  const table = renderPluginTable(
    [
      {
        name: "example-plugin",
        homepage: "https://example.com/a|b",
        description: "A | B \\ C.",
      },
      {
        name: "other-plugin",
        homepage: "https://example.com/docs (beta)",
        description: "D.",
      },
    ],
    [],
  );

  assert.match(table, /https:\/\/example\.com\/a\\\|b/);
  assert.match(table, /A \\\| B \\\\ C/);
  assert.match(table, /\| ✅ \| — \|/);
  assert.match(table, /https:\/\/example\.com\/docs%20%28beta%29/);
});

test("names the offending entry when the table cannot be rendered", () => {
  assert.throws(
    () => renderPluginTable([{ name: "x-plugin", homepage: "https://e.com" }], []),
    /Claude catalog plugin "x-plugin" must have a description\./,
  );
  assert.throws(
    () => renderPluginTable([{ name: "x-plugin", description: "D." }], []),
    /Claude catalog plugin "x-plugin" must have a homepage\./,
  );
  assert.throws(
    () => renderPluginTable([null], []),
    /Claude catalog entry 1 must have a plugin name\./,
  );
});

test("the check command requires an explicit source checkout", async (t) => {
  const scriptPath = fileURLToPath(
    new URL("../scripts/check-catalogs.mjs", import.meta.url),
  );

  await t.test("no arguments", () => {
    const result = spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--source-repo/);
  });

  await t.test("equals form is accepted", () => {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--source-repo=/nonexistent-source-checkout"],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /not a directory/);
  });
});
