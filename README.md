# 🛍️ CypherPoet Toolchest

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) catalog of custom themed plugins — agent tooling, dev workflow utilities, and more. This repo holds only the catalog (`.claude-plugin/marketplace.json`); each plugin's source lives in a separate repo and is sparse-cloned on demand.

[![X](https://img.shields.io/badge/%40cypher__poet-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/cypher_poet) [![PayPal](https://img.shields.io/badge/PayPal-003087?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/ncp/payment/L6M553P28YPDY) [![Cash App](https://img.shields.io/badge/Cash_App-00C244?style=for-the-badge&logo=cashapp&logoColor=white)](https://cash.app/$CypherPoet) [![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/cypherpoet)

## ⚡ Quickstart

Inside Claude Code:

```shell
/plugin marketplace add CypherPoet/cypherpoet-toolchest
/plugin install cypherpoet-agent-tooling@cypherpoet-toolchest
```

Each commit to a plugin source repo's `main` becomes a new version. Pick up changes with `/plugin marketplace update cypherpoet-toolchest` (or rely on background refresh).

## 📦 Plugins

| Plugin | Catalog | Description |
|---|---|---|
| [`cypherpoet-agent-tooling`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-agent-tooling) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-agent-tooling/CATALOG.md) | Agent tooling for Claude Code workflow, memory, and docs |
| [`cypherpoet-blender-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-blender-kit) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-blender-kit/CATALOG.md) | Blender 3D modeling and MCP integration |
| [`cypherpoet-expo-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-expo-kit) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-expo-kit/CATALOG.md) | Expo / React Native prototyping |
| [`cypherpoet-git-flow`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-git-flow) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-git-flow/CATALOG.md) | Git commit and changelog hygiene |
| [`cypherpoet-mobile-dev`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-mobile-dev) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-mobile-dev/CATALOG.md) | iOS App Store publishing best practices |
| [`cypherpoet-svg-tools`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-svg-tools) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-svg-tools/CATALOG.md) | SVG optimization and cleanup |
| [`cypherpoet-threejs-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-threejs-kit) | [skills](https://github.com/CypherPoet/custom-agent-skills/blob/main/plugins/cypherpoet-threejs-kit/CATALOG.md) | Three.js / WebGPU / WebGL tooling |

Install a plugin:

```shell
/plugin install <plugin-name>@cypherpoet-toolchest
```

## 🧭 How a typical install resolves

The catalog uses [`git-subdir`](https://code.claude.com/docs/en/plugin-marketplaces#git-subdirectories) sources, so installing one plugin only fetches that plugin's subdirectory — not the entire source repo.

```text
1. /plugin install cypherpoet-git-flow@cypherpoet-toolchest
2. Claude Code reads marketplace.json from this repo
3. Finds the entry: { name, source: git-subdir, url: <source>, path: "plugins/cypherpoet-git-flow" }
4. Sparse-clones just plugins/cypherpoet-git-flow/ from the source repo
5. Caches it at ~/.claude/plugins/cache/cypherpoet-toolchest/cypherpoet-git-flow/<commit-sha>/
6. Loads the plugin; skills appear under /cypherpoet-git-flow:<skill-name>
```

## 🔄 Update model

Plugins omit a fixed `version` in their `plugin.json`, so each commit to `main` in the source repo is a new version. Claude Code resolves the version to the current commit SHA when you `/plugin marketplace update` or when the background refresh fires.

This means **plugin content updates reach consumers automatically** — no catalog change is needed when you edit a plugin's skills. The `marketplace.json` here only changes when a plugin is **added, removed, or has its name/description edited**.

## 🛠 Catalog maintenance

> This section is for the catalog maintainer. Plugin consumers don't need to read further.

This catalog is maintained **explicitly, via pull requests** — there is no CI auto-sync, no cron, and no tokens. The source repo (`custom-agent-skills`) owns the tooling: run its **`marketplace-publish`** skill to open a PR here that adds or updates a single plugin's entry, and its **`marketplace-sync-check`** skill to audit which plugins are/aren't listed. Both run on your local `gh` credentials.

```
.
├── .claude-plugin/
│   └── marketplace.json   # The catalog — hand-maintained via publish PRs
└── README.md
```

To add or update a plugin: from the source repo, run `marketplace-publish <plugin>` (it opens a PR here). To remove one: delete its entry from `plugins[]` in a PR. Keep the array sorted by `name`.

## 📝 License

Plugin licenses are governed by their respective source repositories. This catalog itself is provided as-is.
