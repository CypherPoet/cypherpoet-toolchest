# 🛍️ CypherPoet Skills Marketplace

A [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces) catalog for CypherPoet's collections of agent skills. This repo holds only the marketplace file — the plugins themselves live in their respective repos.

## 📦 Plugins

| Plugin | Source | Description |
|---|---|---|
| `cypherpoet-skills` | [`CypherPoet/custom-agent-skills`](https://github.com/CypherPoet/custom-agent-skills) | Open-source collection of Claude Code skills |
| `cypherpoet-skills-private` | [`CypherPoet/private-custom-agent-skills`](https://github.com/CypherPoet/private-custom-agent-skills) | Private collection — requires read access to the source repo |

## 🚀 Usage

Inside Claude Code:

```shell
# Subscribe to the marketplace (once)
/plugin marketplace add CypherPoet/cypherpoet-skills-marketplace

# Install whichever plugins you want
/plugin install cypherpoet-skills@cypherpoet-skills-marketplace
/plugin install cypherpoet-skills-private@cypherpoet-skills-marketplace

# Refresh later to pick up new commits in the plugin repos
/plugin marketplace update cypherpoet-skills-marketplace
```

Skills install under a namespace matching the plugin name. For example, after installing `cypherpoet-skills`, its skills are reachable as `/cypherpoet-skills:<skill-name>`.

## 🔒 Access notes

`cypherpoet-skills-private` points at a private GitHub repository. Listed plugins appear to anyone who adds the marketplace, but installation of the private plugin only succeeds for accounts with read access — Claude Code uses your local git credentials (`gh auth`, SSH agent, or `GITHUB_TOKEN`).

## 🔄 Automatic updates

Both plugins omit a fixed `version` in their `plugin.json`, so each commit to `main` in the plugin repos becomes a new version. Consumers receive updates on `/plugin marketplace update` or via Claude Code's background refresh.

## 📝 License

Plugin licenses are governed by their respective repositories. This marketplace catalog itself is provided as-is.
