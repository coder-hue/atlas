#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { startShield } from "./server.js";

function configArgument(argv) {
  const index = argv.indexOf("--config");
  if (index === -1) {
    const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(sourceDirectory, "../config/default.json");
  }
  if (!argv[index + 1]) throw new Error("--config requires a file path");
  return argv[index + 1];
}

function emit(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

try {
  const config = await loadConfig(configArgument(process.argv.slice(2)));
  const shield = await startShield(config, {
    warn(message) { emit({ event: "warning", message }); }
  });

  emit({
    event: "ready",
    dns: `${shield.dnsAddress.address}:${shield.dnsAddress.port}`,
    proxy: `http://${shield.proxyAddress.address}:${shield.proxyAddress.port}`,
    control: `http://${shield.controlAddress.address}:${shield.controlAddress.port}`,
    pid: process.pid
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    await shield.stop();
    emit({ event: "stopped", signal });
  };

  process.on("SIGHUP", async () => {
    try {
      const domains = await shield.reload();
      emit({ event: "reloaded", domains });
    } catch (error) {
      emit({ event: "warning", message: `Reload failed: ${error.message}` });
    }
  });
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: "fatal", message: error.message })}\n`);
  process.exitCode = 1;
}
