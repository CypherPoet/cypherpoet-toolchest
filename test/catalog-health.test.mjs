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
  EXPECTED_CODEX_DISPLAY_NAME,
  EXPECTED_CODEX_POLICY,
  expectedHomepage,
  renderPluginTable,
  SOURCE_DEFAULT_BRANCH,
  SOURCE_REPOSITORY_URL,
  validateCatalogHealth,
} from "../scripts/catalog-health.mjs";

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
  const claude = await readJson(fixture.claudeCatalogPath);
  const codex = await readJson(fixture.codexCatalogPath);
  const readme = await readFile(fixture.readmePath, "utf8");
  await writeFile(fixture.readmePath, buildReadme(readme, claude.plugins, codex.plugins));
}

async function writeClaudeManifest(sourceRepo, name, overrides = {}) {
  const manifest = {
    name,
    version: "1.0.0",
    description: `${name} description.`,
    homepage: expectedHomepage(name, undefined),
    ...overrides,
  };
  await writeJson(
    join(sourceRepo, "plugins", name, ".claude-plugin/plugin.json"),
    manifest,
  );
  return manifest;
}

async function writeCodexManifest(sourceRepo, name, overrides = {}) {
  const manifest = {
    name,
    version: "1.0.0",
    description: `${name} Codex description.`,
    interface: { category: "Developer Tools", displayName: name },
    ...overrides,
  };
  await writeJson(
    join(sourceRepo, "plugins", name, ".codex-plugin/plugin.json"),
    manifest,
  );
  return manifest;
}

async function createFixture(t) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "catalog-health-"));
  t.after(() => rm(fixtureRoot, { recursive: true, force: true }));
  const catalogRoot = join(fixtureRoot, "catalog");
  const sourceRepo = join(fixtureRoot, "source");
  const claudeCatalogPath = join(catalogRoot, ".claude-plugin/marketplace.json");
  const codexCatalogPath = join(catalogRoot, ".agents/plugins/marketplace.json");
  const readmePath = join(catalogRoot, "README.md");

  const bothName = "cypherpoet-both";
  const claudeOnlyName = "cypherpoet-claude-only";
  const codexOnlyName = "cypherpoet-codex-only";
  const unpublishedName = "cypherpoet-unpublished";
  const claudeManifests = new Map();
  for (const name of [bothName, claudeOnlyName, unpublishedName]) {
    claudeManifests.set(name, await writeClaudeManifest(sourceRepo, name));
  }
  for (const name of [bothName, codexOnlyName, unpublishedName]) {
    await writeCodexManifest(sourceRepo, name);
  }

  const claudePlugins = [bothName, claudeOnlyName]
    .sort(comparePluginNames)
    .map((name) => {
      const manifest = claudeManifests.get(name);
      return {
        name,
        source: sourceFor(name),
        description: manifest.description,
        homepage: manifest.homepage,
      };
    });
  const codexPlugins = [bothName, codexOnlyName]
    .sort(comparePluginNames)
    .map((name) => codexEntry(name));

  await writeJson(claudeCatalogPath, {
    name: "cypherpoet-toolchest",
    plugins: claudePlugins,
  });
  await writeJson(codexCatalogPath, {
    name: "cypherpoet-toolchest",
    interface: { displayName: EXPECTED_CODEX_DISPLAY_NAME },
    plugins: codexPlugins,
  });
  const shell = [
    "# Fixture",
    "",
    "<!-- BEGIN:PLUGINS-TABLE (generated) -->",
    "",
    "stale",
    "",
    "<!-- END:PLUGINS-TABLE -->",
    "",
  ].join("\n");
  await writeFile(readmePath, buildReadme(shell, claudePlugins, codexPlugins));

  return {
    bothName,
    catalogRoot,
    claudeCatalogPath,
    claudeOnlyName,
    codexCatalogPath,
    codexOnlyName,
    readmePath,
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

test("accepts independent platform catalogs and unpublished source manifests", async (t) => {
  const fixture = await createFixture(t);
  assert.deepEqual(validate(fixture), {
    counts: { claude: 2, codex: 2 },
    errors: [],
  });
});

test("requires the exact Codex marketplace display name", async (t) => {
  for (const [label, mutate, expected] of [
    ["missing", (catalog) => delete catalog.interface, "interface must be an object"],
    ["empty", (catalog) => { catalog.interface.displayName = ""; }, "interface.displayName"],
    ["incorrect", (catalog) => { catalog.interface.displayName = "Wrong"; }, "interface.displayName"],
  ]) {
    await t.test(label, async (caseContext) => {
      const fixture = await createFixture(caseContext);
      const catalog = await readJson(fixture.codexCatalogPath);
      mutate(catalog);
      await writeJson(fixture.codexCatalogPath, catalog);
      assert.ok(validate(fixture).errors.some((error) => error.includes(expected)));
    });
  }
});

test("catalog membership is explicit rather than inferred from all source manifests", async (t) => {
  const fixture = await createFixture(t);
  assert.deepEqual(validate(fixture).errors, []);
  const catalog = await readJson(fixture.codexCatalogPath);
  catalog.plugins = catalog.plugins.filter((plugin) => plugin.name !== fixture.bothName);
  await writeJson(fixture.codexCatalogPath, catalog);
  await refreshReadme(fixture);
  assert.deepEqual(validate(fixture).errors, []);
});

test("a Codex catalog entry does not require Claude publication", async (t) => {
  const fixture = await createFixture(t);
  assert.ok(
    (await readJson(fixture.codexCatalogPath)).plugins.some(
      (plugin) => plugin.name === fixture.codexOnlyName,
    ),
  );
  assert.ok(
    !(await readJson(fixture.claudeCatalogPath)).plugins.some(
      (plugin) => plugin.name === fixture.codexOnlyName,
    ),
  );
  assert.deepEqual(validate(fixture).errors, []);
});

test("the README table includes Codex-only catalog entries", async (t) => {
  const fixture = await createFixture(t);
  const readme = await readFile(fixture.readmePath, "utf8");
  const row = readme
    .split("\n")
    .find((line) => line.includes(`\`${fixture.codexOnlyName}\``));
  assert.ok(row);
  assert.match(
    row,
    /\| — \| ✅ \| — \|$/u,
  );
});

test("Codex category comes from the authored Codex manifest", async (t) => {
  const fixture = await createFixture(t);
  const path = join(
    fixture.sourceRepo,
    "plugins",
    fixture.bothName,
    ".codex-plugin/plugin.json",
  );
  const manifest = await readJson(path);
  manifest.interface.category = "Creativity";
  manifest.interface.displayName = "A card-only change";
  await writeJson(path, manifest);
  const errors = validate(fixture).errors;
  assert.ok(errors.some((error) => error.includes("category")));
  assert.ok(!errors.some((error) => error.includes("displayName")));
});

test("removing a platform manifest invalidates only its published entry", async (t) => {
  const fixture = await createFixture(t);
  await rm(
    join(
      fixture.sourceRepo,
      "plugins",
      fixture.bothName,
      ".codex-plugin/plugin.json",
    ),
  );
  const errors = validate(fixture).errors;
  assert.ok(errors.some((error) => error.includes("Codex source manifest") && error.includes("could not be read")));
  assert.ok(!errors.some((error) => error.includes("Claude source manifest") && error.includes("could not be read")));
});

test("aggregates metadata, source, category, and policy drift", async (t) => {
  const fixture = await createFixture(t);
  const claude = await readJson(fixture.claudeCatalogPath);
  const claudePlugin = claude.plugins.find((plugin) => plugin.name === fixture.bothName);
  claudePlugin.description = "Drifted.";
  claudePlugin.source.url = "https://example.com/wrong.git";
  await writeJson(fixture.claudeCatalogPath, claude);
  const codex = await readJson(fixture.codexCatalogPath);
  const codexPlugin = codex.plugins.find((plugin) => plugin.name === fixture.bothName);
  codexPlugin.source.ref = "develop";
  codexPlugin.category = "Wrong";
  codexPlugin.policy.installation = "BLOCKED";
  codexPlugin.policy.authentication = "NEVER";
  await writeJson(fixture.codexCatalogPath, codex);
  await refreshReadme(fixture);
  const errors = validate(fixture).errors.join("\n");
  for (const field of [
    "description",
    "source.url",
    "source.ref",
    "category",
    "policy.installation",
    "policy.authentication",
  ]) {
    assert.match(errors, new RegExp(field.replace(".", "\\.")));
  }
});

test("reports duplicate, unsorted, and invalid catalog entries", async (t) => {
  const fixture = await createFixture(t);
  const catalog = await readJson(fixture.codexCatalogPath);
  catalog.plugins.push(structuredClone(catalog.plugins[0]));
  [catalog.plugins[0], catalog.plugins[1]] = [catalog.plugins[1], catalog.plugins[0]];
  await writeJson(fixture.codexCatalogPath, catalog);
  const errors = validate(fixture).errors.join("\n");
  assert.match(errors, /duplicate plugin/u);
  assert.match(errors, /sorted by name/u);
});

test("reports malformed and misshapen source manifests", async (t) => {
  for (const [content, expected] of [
    ["{\n", "could not be parsed"],
    ["null\n", "must be a JSON object"],
  ]) {
    await t.test(expected, async (caseContext) => {
      const fixture = await createFixture(caseContext);
      const path = join(
        fixture.sourceRepo,
        "plugins",
        fixture.bothName,
        ".codex-plugin/plugin.json",
      );
      await writeFile(path, content);
      assert.ok(validate(fixture).errors.some((error) => error.includes(expected)));
    });
  }
});

test("reports source manifest name and version failures", async (t) => {
  const fixture = await createFixture(t);
  const path = join(
    fixture.sourceRepo,
    "plugins",
    fixture.bothName,
    ".codex-plugin/plugin.json",
  );
  const manifest = await readJson(path);
  manifest.name = "wrong-name";
  manifest.version = "wrong";
  await writeJson(path, manifest);
  const errors = validate(fixture).errors.join("\n");
  assert.match(errors, /Codex source manifest.* name/u);
  assert.match(errors, /Codex source manifest.* version/u);
});

test("reports a stale README table", async (t) => {
  const fixture = await createFixture(t);
  const readme = await readFile(fixture.readmePath, "utf8");
  await writeFile(fixture.readmePath, readme.replace("description", "stale"));
  assert.ok(
    validate(fixture).errors.some((error) => error.includes("README plugins table is out of sync")),
  );
});

test("escapes Markdown table delimiters and link-breaking URL characters", () => {
  const table = renderPluginTable(
    [
      { name: "example-plugin", homepage: "https://example.com/a|b", description: "A | B \\ C." },
      { name: "other-plugin", homepage: "https://example.com/docs (beta)", description: "D." },
    ],
    [],
  );
  assert.match(table, /https:\/\/example\.com\/a\\\|b/u);
  assert.match(table, /A \\\| B \\\\ C/u);
  assert.match(table, /\| ✅ \| — \|/u);
  assert.match(table, /https:\/\/example\.com\/docs%20%28beta%29/u);
});

test("names the offending entry when the table cannot be rendered", () => {
  assert.throws(
    () => renderPluginTable([{ name: "x-plugin", homepage: "https://e.com" }], []),
    /must have a description/u,
  );
  assert.throws(
    () => renderPluginTable([{ name: "x-plugin", description: "D." }], []),
    /must have a homepage/u,
  );
});

test("the check command requires an explicit source checkout", async (t) => {
  const scriptPath = fileURLToPath(new URL("../scripts/check-catalogs.mjs", import.meta.url));
  await t.test("no arguments", () => {
    const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--source-repo/u);
  });
  await t.test("equals form", () => {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "--source-repo=/nonexistent-source-checkout"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /not a directory/u);
  });
});
