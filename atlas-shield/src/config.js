import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

function resolveFiles(baseDirectory, values = []) {
  if (!Array.isArray(values)) throw new Error("List file configuration must be an array");
  return values.map((value) => path.resolve(baseDirectory, value));
}

function validPort(value, allowZero = false) {
  return Number.isInteger(value) && value >= (allowZero ? 0 : 1) && value <= 65535;
}

export async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  const baseDirectory = path.dirname(absolutePath);
  const raw = JSON.parse(await readFile(absolutePath, "utf8"));

  const config = {
    dns: {
      host: raw.dns?.host ?? "127.0.0.1",
      port: raw.dns?.port ?? 0
    },
    control: {
      host: raw.control?.host ?? "127.0.0.1",
      port: raw.control?.port ?? 0
    },
    proxy: {
      host: raw.proxy?.host ?? "127.0.0.1",
      port: raw.proxy?.port ?? 0
    },
    upstream: {
      host: raw.upstream?.host ?? "1.1.1.1",
      port: raw.upstream?.port ?? 53,
      timeoutMs: raw.upstream?.timeoutMs ?? 2500
    },
    blockResponseTtl: raw.blockResponseTtl ?? 60,
    maxConcurrentQueries: raw.maxConcurrentQueries ?? 1024,
    blocklistFiles: resolveFiles(baseDirectory, raw.blocklistFiles),
    allowlistFiles: resolveFiles(baseDirectory, raw.allowlistFiles),
    blocklistSources: raw.blocklistSources ?? [],
    blocklistOutput: path.resolve(baseDirectory, raw.blocklistOutput ?? "blocklist.txt")
  };

  if (config.dns.host !== "127.0.0.1" && config.dns.host !== "::1") {
    throw new Error("The DNS listener must bind to localhost");
  }
  if (config.control.host !== "127.0.0.1" && config.control.host !== "::1") {
    throw new Error("The control listener must bind to localhost");
  }
  if (config.proxy.host !== "127.0.0.1" && config.proxy.host !== "::1") {
    throw new Error("The proxy listener must bind to localhost");
  }
  if (!validPort(config.dns.port, true) || !validPort(config.control.port, true) || !validPort(config.proxy.port, true)) {
    throw new Error("Listener ports must be between 0 and 65535");
  }
  if (!validPort(config.upstream.port) || !Number.isInteger(config.upstream.timeoutMs) || config.upstream.timeoutMs < 100) {
    throw new Error("Invalid upstream DNS configuration");
  }
  if (!isIP(config.upstream.host)) {
    throw new Error("The upstream DNS host must be a numeric IP address");
  }
  if (!Number.isInteger(config.blockResponseTtl) || config.blockResponseTtl < 0) {
    throw new Error("blockResponseTtl must be a non-negative integer");
  }
  if (!Number.isInteger(config.maxConcurrentQueries) || config.maxConcurrentQueries < 1) {
    throw new Error("maxConcurrentQueries must be a positive integer");
  }

  return config;
}
