import dgram from "node:dgram";
import http from "node:http";
import net from "node:net";
import { DomainFilter } from "./blocklist.js";
import { buildBlockedResponse, buildErrorResponse, parseQuestion } from "./dns.js";

function bindDns(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.bind(port, host);
  });
}

function listenHttp(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function forwardUdp(query, upstream, activeSockets) {
  return new Promise((resolve, reject) => {
    const family = upstream.host.includes(":") ? "udp6" : "udp4";
    const socket = dgram.createSocket(family);
    activeSockets.add(socket);
    let settled = false;

    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeSockets.delete(socket);
      socket.close();
      if (error) reject(error);
      else resolve(response);
    };

    const timer = setTimeout(
      () => finish(new Error("Upstream DNS timeout")),
      upstream.timeoutMs
    );
    timer.unref?.();

    socket.once("error", (error) => finish(error));
    socket.on("message", (message) => {
      if (message.length >= 2 && message.readUInt16BE(0) === query.readUInt16BE(0)) {
        finish(null, message);
      }
    });
    socket.connect(upstream.port, upstream.host, () => {
      socket.send(query, (error) => {
        if (error) finish(error);
      });
    });
  });
}

export async function startShield(config, logger = console) {
  const proxyConfig = config.proxy ?? { host: "127.0.0.1", port: 0 };
  let filter = await DomainFilter.fromFiles(
    config.blocklistFiles,
    config.allowlistFiles,
    logger
  );
  const startedAt = Date.now();
  const activeSockets = new Set();
  const proxyTunnels = new Set();
  let activeQueries = 0;
  let stopping = false;
  const stats = {
    queries: 0,
    blocked: 0,
    forwarded: 0,
    errors: 0,
    proxyRequests: 0,
    proxyBlocked: 0
  };

  const dnsServer = dgram.createSocket(config.dns.host === "::1" ? "udp6" : "udp4");
  dnsServer.on("message", async (query, remote) => {
    if (stopping) return;
    stats.queries += 1;

    let question;
    try {
      question = parseQuestion(query);
    } catch {
      stats.errors += 1;
      return;
    }

    if (filter.shouldBlock(question.name)) {
      stats.blocked += 1;
      const response = buildBlockedResponse(query, question, config.blockResponseTtl);
      dnsServer.send(response, remote.port, remote.address);
      return;
    }

    if (activeQueries >= config.maxConcurrentQueries) {
      stats.errors += 1;
      const response = buildErrorResponse(query);
      if (response) dnsServer.send(response, remote.port, remote.address);
      return;
    }

    activeQueries += 1;
    try {
      const response = await forwardUdp(query, config.upstream, activeSockets);
      stats.forwarded += 1;
      if (!stopping) dnsServer.send(response, remote.port, remote.address);
    } catch (error) {
      stats.errors += 1;
      logger?.warn?.(error.message);
      const response = buildErrorResponse(query);
      if (!stopping && response) dnsServer.send(response, remote.port, remote.address);
    } finally {
      activeQueries -= 1;
    }
  });

  const controlServer = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");

    if (request.method === "GET" && request.url === "/health") {
      response.end(JSON.stringify({ status: "ok", uptimeMs: Date.now() - startedAt }));
      return;
    }
    if (request.method === "GET" && request.url === "/stats") {
      response.end(JSON.stringify({ ...stats, blocklistDomains: filter.size }));
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const proxyServer = http.createServer((request, response) => {
    stats.proxyRequests += 1;
    let target;
    try {
      target = new URL(request.url.startsWith("http://")
        ? request.url
        : `http://${request.headers.host}${request.url}`);
    } catch {
      stats.errors += 1;
      response.writeHead(400).end();
      return;
    }

    if (filter.shouldBlock(target.hostname)) {
      stats.proxyBlocked += 1;
      response.writeHead(403, { "content-type": "text/plain", "x-atlas-shield": "blocked" });
      response.end("Blocked by Atlas Shield\n");
      return;
    }

    const headers = { ...request.headers, host: target.host };
    delete headers["proxy-connection"];
    const upstreamRequest = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      method: request.method,
      path: `${target.pathname}${target.search}`,
      headers
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstreamRequest.on("error", (error) => {
      stats.errors += 1;
      logger?.warn?.(`Proxy request failed: ${error.message}`);
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.pipe(upstreamRequest);
  });

  proxyServer.on("connect", (request, clientSocket, head) => {
    stats.proxyRequests += 1;
    let target;
    try {
      target = new URL(`http://${request.url}`);
    } catch {
      stats.errors += 1;
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }

    if (filter.shouldBlock(target.hostname)) {
      stats.proxyBlocked += 1;
      clientSocket.end("HTTP/1.1 403 Forbidden\r\nX-Atlas-Shield: blocked\r\n\r\n");
      return;
    }

    const upstreamSocket = net.connect(Number(target.port) || 443, target.hostname);
    proxyTunnels.add(clientSocket);
    proxyTunnels.add(upstreamSocket);
    const forget = () => {
      proxyTunnels.delete(clientSocket);
      proxyTunnels.delete(upstreamSocket);
    };
    clientSocket.once("close", forget);
    upstreamSocket.once("close", forget);
    upstreamSocket.once("connect", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.once("error", (error) => {
      stats.errors += 1;
      logger?.warn?.(`Proxy tunnel failed: ${error.message}`);
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    clientSocket.once("error", () => upstreamSocket.destroy());
  });

  let dnsAddress;
  let controlAddress;
  let proxyAddress;
  try {
    dnsAddress = await bindDns(dnsServer, config.dns.port, config.dns.host);
    controlAddress = await listenHttp(controlServer, config.control.port, config.control.host);
    proxyAddress = await listenHttp(proxyServer, proxyConfig.port, proxyConfig.host);
  } catch (error) {
    try { dnsServer.close(); } catch {}
    try { controlServer.close(); } catch {}
    try { proxyServer.close(); } catch {}
    throw error;
  }

  return {
    dnsAddress,
    controlAddress,
    proxyAddress,
    stats,
    async reload() {
      filter = await DomainFilter.fromFiles(
        config.blocklistFiles,
        config.allowlistFiles,
        logger
      );
      return filter.size;
    },
    async stop() {
      if (stopping) return;
      stopping = true;
      for (const socket of activeSockets) socket.close();
      activeSockets.clear();
      for (const socket of proxyTunnels) socket.destroy();
      proxyTunnels.clear();
      await Promise.allSettled([close(dnsServer), close(controlServer), close(proxyServer)]);
    }
  };
}
