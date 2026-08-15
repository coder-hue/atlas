import dgram from "node:dgram";
import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { encodeQuery, parseQuestion } from "../src/dns.js";
import { startShield } from "../src/server.js";

function bindUdp(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function ask(port, query) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("Test DNS timeout"));
    }, 1000);
    socket.once("message", (message) => {
      clearTimeout(timer);
      socket.close();
      resolve(message);
    });
    socket.send(query, port, "127.0.0.1");
  });
}

function proxyGet(proxyPort, url) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port: proxyPort,
      method: "GET",
      path: url
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response));
    });
    request.once("error", reject);
    request.end();
  });
}

test("blocks listed domains and forwards other queries", async (context) => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "atlas-shield-test-"));
  const blocklistPath = path.join(temporaryDirectory, "blocklist.txt");
  await writeFile(blocklistPath, "blocked.example\n", "utf8");
  context.after(() => rm(temporaryDirectory, { recursive: true, force: true }));

  const upstream = dgram.createSocket("udp4");
  const upstreamAddress = await bindUdp(upstream);
  upstream.on("message", (message, remote) => {
    const response = Buffer.from(message);
    response.writeUInt16BE(0x8180, 2);
    upstream.send(response, remote.port, remote.address);
  });
  context.after(() => upstream.close());

  const config = {
    dns: { host: "127.0.0.1", port: 0 },
    control: { host: "127.0.0.1", port: 0 },
    proxy: { host: "127.0.0.1", port: 0 },
    upstream: { host: "127.0.0.1", port: upstreamAddress.port, timeoutMs: 500 },
    blockResponseTtl: 60,
    maxConcurrentQueries: 16,
    blocklistFiles: [blocklistPath],
    allowlistFiles: []
  };
  const shield = await startShield(config, { warn() {} });
  context.after(() => shield.stop());
  const blockedQuery = encodeQuery("cdn.blocked.example", 1, 9);
  const blockedResponse = await ask(shield.dnsAddress.port, blockedQuery);
  assert.equal(blockedResponse.readUInt16BE(0), 9);
  assert.deepEqual([...blockedResponse.subarray(-4)], [0, 0, 0, 0]);
  assert.equal(shield.stats.blocked, 1);

  const allowedQuery = encodeQuery("example.com", 1, 10);
  const allowedResponse = await ask(shield.dnsAddress.port, allowedQuery);
  assert.equal(allowedResponse.readUInt16BE(0), 10);
  assert.equal(parseQuestion(allowedResponse).name, "example.com");
  assert.equal(shield.stats.forwarded, 1);

  const blockedHttp = await proxyGet(shield.proxyAddress.port, "http://blocked.example/ad.js");
  assert.equal(blockedHttp.statusCode, 403);
  assert.equal(blockedHttp.headers["x-atlas-shield"], "blocked");
  assert.equal(shield.stats.proxyBlocked, 1);
});
