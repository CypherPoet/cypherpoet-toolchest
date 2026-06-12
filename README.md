# 💎 CypherPoet Toolchest

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) catalog of custom themed plugins — agent tooling, dev workflow utilities, and more. This repo holds only the catalog (`.claude-plugin/marketplace.json`); each plugin's source lives in a separate repo and is sparse-cloned on demand.

[![X](https://img.shields.io/badge/%40cypher__poet-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/cypher_poet) [![PayPal](https://img.shields.io/badge/PayPal-003087?style=for-the-badge&logo=paypal&logoColor=white)](https://www.paypal.com/ncp/payment/L6M553P28YPDY) [![Cash App](https://img.shields.io/badge/Cash_App-00C244?style=for-the-badge&logo=cashapp&logoColor=white)](https://cash.app/$CypherPoet) [![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=000000)](https://buymeacoffee.com/cypherpoet)

## ⚡ Quickstart

Inside Claude Code, install the marketplace:

```shell
/plugin marketplace add CypherPoet/cypherpoet-toolchest
```

Then install your desired plugins:

```shell
/plugin install <plugin-name>@cypherpoet-toolchest
```

## 📦 Plugins

<!-- BEGIN:PLUGINS-TABLE (generated from .claude-plugin/marketplace.json — edit that file, not this table) -->

| Plugin | Description |
| --- | --- |
| [`cypherpoet-agent-tooling`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-agent-tooling) | Agent tooling for Claude Code workflow, memory, and docs |
| [`cypherpoet-app-store-connect-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-app-store-connect-kit) | Hands-on App Store Connect submission workflow and console navigation |
| [`cypherpoet-apple-app-icons`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-apple-app-icons) | Apple app icons end to end: design one that converts in the App Store (tap-through, audit, A/B testing) and ship it correctly — Icon Composer Liquid Glass .icon plus an appiconset fallback for older OS versions |
| [`cypherpoet-apple-app-store-screenshots`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-apple-app-store-screenshots) | Apple App Store screenshot and app preview specifications |
| [`cypherpoet-blender-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-blender-kit) | Blender 3D modeling and MCP integration |
| [`cypherpoet-expo-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-expo-kit) | Expo / React Native prototyping |
| [`cypherpoet-git-flow`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-git-flow) | Git commit and changelog hygiene |
| [`cypherpoet-marketplace-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-marketplace-kit) | Maintainer toolkit for running a Claude Code plugin marketplace — publish plugins, audit marketplace and catalog sync, regenerate the local catalog, and verify dependency-version tags |
| [`cypherpoet-mobile-dev`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-mobile-dev) | iOS App Store publishing best practices |
| [`cypherpoet-sf-symbols-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-sf-symbols-kit) | Apple SF Symbols end to end: find the right symbol with natural language, export clean recolorable SVGs at any of the 9 weights, browse an HTML gallery, build full icon sets, and convert your own SVG art into importable custom SF Symbol templates |
| [`cypherpoet-svg-tools`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-svg-tools) | SVG optimization and cleanup |
| [`cypherpoet-swift-xcode-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-swift-xcode-kit) | Swift and Xcode development kit: SwiftUI best practices and 2027 SDK migration, UIKit multi-window modernization, XCTest-to-Swift-Testing migration, security-hardening audits of Xcode build settings, C -fbounds-safety guidance, and on-device/simulator UI verification |
| [`cypherpoet-threejs-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-threejs-kit) | Three.js / WebGPU / WebGL tooling |
| [`cypherpoet-webgl-kit`](https://github.com/CypherPoet/custom-agent-skills/tree/main/plugins/cypherpoet-webgl-kit) | Raw WebGL2 + GLSL shader tooling |

<!-- END:PLUGINS-TABLE -->

## 🧭 How a typical install resolves

- Each plugin is isolated and composable: agents, commands, and skills are auto-discovered from its directory structure.

- The catalog uses [`git-subdir`](https://code.claude.com/docs/en/plugin-marketplaces#git-subdirectories) sources, so installing one plugin only fetches that plugin's subdirectory — not the entire source repo.

## 🔄 Update Model

Plugins omit a fixed `version` in their `plugin.json`, so each commit to `main` in the source repo is a new version. Claude Code resolves the version to the current commit SHA when you `/plugin marketplace update` or when the background refresh fires.

This means **plugin content updates reach consumers automatically** — no catalog change is needed when you edit a plugin's skills. The `marketplace.json` here only changes when a plugin is **added, removed, or has an update to one of its [entry fields](https://code.claude.com/docs/en/plugin-marketplaces#marketplace-schema) that the marketplace catalog cares about specifying**.

## 🛠 Catalog Maintenance

> This section is for the catalog maintainer. Plugin consumers don't need to read further.

This catalog is maintained largely via updates from downstream repos. The [`custom-agent-skills`](https://github.com/CypherPoet/custom-agent-skills) repo, for example, run its **`marketplace-publish`** skill to open a PR here that adds or updates a single plugin's entry, and its **`marketplace-sync-check`** skill to audit which plugins are/aren't listed.

The **Plugins** table above is generated from `marketplace.json` — don't edit it by hand. Run `node scripts/sync-readme-table.mjs` to regenerate it (add `--check` to verify it's in sync without writing). A scheduled **catalog-sync [routine](https://code.claude.com/docs/en/routines)** runs this script as part of detecting newly published plugins and opening a sync PR, so the catalog and table stay current without manual upkeep.

```
├── .claude-plugin/
│   └── marketplace.json       # catalog of plugins (source of truth)
├── scripts/
│   └── sync-readme-table.mjs  # regenerates the Plugins table from marketplace.json (supports --check)
└── README.md
```

To remove a plugin: delete its entry from `plugins[]` in [`marketplace.json`](.claude-plugin/marketplace.json) and open a PR. Keep the array sorted by `name`.

## 🪪 License

Plugin licenses are governed by their respective source repositories. This catalog itself is provided as-is.
