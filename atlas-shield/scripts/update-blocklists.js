#!/usr/bin/env node
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractDomains } from "../src/blocklist.js";
import { loadConfig } from "../src/config.js";

function configArgument(argv) {
  const index = argv.indexOf("--config");
  if (index === -1 || !argv[index + 1]) throw new Error("Usage: update-blocklists --config <path>");
  return argv[index + 1];
}

const config = await loadConfig(configArgument(process.argv.slice(2)));
if (!config.blocklistSources.length) throw new Error("No blocklistSources are configured");

const domains = new Set();
for (const source of config.blocklistSources) {
  const url = new URL(source);
  if (url.protocol !== "https:") throw new Error(`Only HTTPS list sources are allowed: ${source}`);
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not download ${source}: HTTP ${response.status}`);
  for (const domain of extractDomains(await response.text())) domains.add(domain);
}

const output = [...domains].sort().join("\n") + "\n";
await mkdir(path.dirname(config.blocklistOutput), { recursive: true });
const temporaryPath = `${config.blocklistOutput}.${process.pid}.tmp`;
await writeFile(temporaryPath, output, { encoding: "utf8", mode: 0o600 });
await rename(temporaryPath, config.blocklistOutput);
process.stdout.write(`${JSON.stringify({ event: "updated", domains: domains.size, output: config.blocklistOutput })}\n`);
