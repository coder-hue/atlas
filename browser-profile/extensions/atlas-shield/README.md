# Atlas Shield component extension

This Manifest V3 extension converts the configured Atlas Shield domain list into
Chromium `declarativeNetRequest` rules. It blocks inside Chromium's network request
path and does not proxy page traffic.

Generate `rules.json` from the repository root:

```sh
./scripts/prepare-shield.sh
```

The generated file is intentionally ignored because it is derived from the public
blocklist URL in `atlas-shield/config/default.json`. The generator caps the static
ruleset at 25,000 blocked domains and adds higher-priority allow rules for OpenAI
and ChatGPT domains.
