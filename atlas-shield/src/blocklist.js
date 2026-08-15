import { readFile } from "node:fs/promises";
import { domainToASCII } from "node:url";

const IGNORED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "broadcasthost",
  "ip6-allnodes",
  "ip6-allrouters"
]);

function normalizeDomain(value) {
  const candidate = value.trim().replace(/^\.+|\.+$/g, "").toLowerCase();
  if (!candidate || candidate.includes("/") || candidate.includes(":")) return null;

  const ascii = domainToASCII(candidate);
  if (!ascii || ascii.length > 253 || IGNORED_HOSTS.has(ascii)) return null;

  const labels = ascii.split(".");
  if (labels.some((label) =>
    !label ||
    label.length > 63 ||
    !/^[a-z0-9-]+$/.test(label) ||
    label.startsWith("-") ||
    label.endsWith("-")
  )) return null;

  return ascii;
}

function domainsFromLine(rawLine) {
  let line = rawLine.replace(/\s*[#!].*$/, "").trim();
  if (!line) return [];

  if (line.startsWith("||") && line.endsWith("^")) {
    line = line.slice(2, -1);
  }

  const parts = line.split(/\s+/);
  const firstIsAddress = /^(?:0\.0\.0\.0|127\.0\.0\.1|::|::1)$/.test(parts[0]);
  const candidates = firstIsAddress ? parts.slice(1) : [parts[0]];
  return candidates.map(normalizeDomain).filter(Boolean);
}

export function extractDomains(text) {
  const result = new Set();
  for (const line of text.split(/\r?\n/)) {
    for (const domain of domainsFromLine(line)) result.add(domain);
  }
  return result;
}

async function readDomainFiles(paths, logger) {
  const domains = new Set();
  for (const filePath of paths) {
    try {
      const text = await readFile(filePath, "utf8");
      for (const domain of extractDomains(text)) domains.add(domain);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      logger?.warn?.(`List file not found: ${filePath}`);
    }
  }
  return domains;
}

function containsDomainOrParent(set, domain) {
  let candidate = domain;
  while (candidate) {
    if (set.has(candidate)) return true;
    const separator = candidate.indexOf(".");
    if (separator === -1) return false;
    candidate = candidate.slice(separator + 1);
  }
  return false;
}

export class DomainFilter {
  constructor(blocked = new Set(), allowed = new Set()) {
    this.blocked = blocked;
    this.allowed = allowed;
  }

  static async fromFiles(blocklistFiles = [], allowlistFiles = [], logger) {
    const [blocked, allowed] = await Promise.all([
      readDomainFiles(blocklistFiles, logger),
      readDomainFiles(allowlistFiles, logger)
    ]);
    return new DomainFilter(blocked, allowed);
  }

  shouldBlock(domain) {
    const normalized = normalizeDomain(domain);
    if (!normalized || containsDomainOrParent(this.allowed, normalized)) return false;
    return containsDomainOrParent(this.blocked, normalized);
  }

  get size() {
    return this.blocked.size;
  }
}
