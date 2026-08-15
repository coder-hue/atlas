# Atlas Shield

Atlas Shield has two implementations. The current test browser uses the lightweight
Manifest V3 component in `browser-profile/extensions/atlas-shield`, which blocks
requests inside Chromium without a proxy. This directory contains the earlier
localhost-only DNS filtering sidecar and remains the prototype for future native
DNS integration.

The DNS prototype provides:

- UDP DNS forwarding through a configurable upstream resolver
- a localhost HTTP/HTTPS CONNECT proxy for immediate stock-Chromium testing
- exact and subdomain blocking from plain, hosts-file, or common adblock entries
- an allowlist that overrides blocked parent domains
- `0.0.0.0` and `::` responses for blocked address lookups
- random localhost ports, graceful shutdown, list reload with `SIGHUP`
- localhost health and aggregate statistics endpoints
- atomic HTTPS blocklist updates

It does not change the operating system's DNS settings and therefore only protects
browser traffic once Chromium's resolver is wired to it. Do not use its HTTP proxy
for the normal Atlas browser path; it exists only for diagnostics.

## Run it

Node.js 22 or newer is required.

```sh
npm test
npm start
```

Startup prints exactly one machine-readable event like:

```json
{"event":"ready","dns":"127.0.0.1:53144","proxy":"http://127.0.0.1:53146","control":"http://127.0.0.1:53145","pid":12345}
```

Refresh the configured blocklist and signal a running process to reload it:

```sh
npm run update-lists
kill -HUP <pid>
```

## Chromium lifecycle contract

1. Package a Node runtime and this directory as a browser resource, or compile the
   service into a standalone executable during production packaging.
2. Launch it as a child process during browser startup with
   `--config <profile-path>/atlas-shield.json`.
3. Read newline-delimited JSON from stdout. Wait for `event: "ready"` before enabling
   filtering.
4. Configure the browser profile's host resolver to send its DNS requests to the
   returned localhost UDP address. This requires a small Chromium network-service
   integration because stock extension APIs cannot select a custom DNS port.
5. Display aggregate values from `/stats` in the built-in extension. Do not expose
   the endpoint beyond localhost.
6. Send `SIGHUP` after changing lists and terminate the child process during normal
   browser shutdown. If the child exits unexpectedly, fall back to the normal
   resolver instead of breaking navigation.

## Configuration

Paths in `config/default.json` are relative to the configuration file. Production
builds should copy the configuration and list files into the user's browser profile
so updates never modify application resources.

For a production release, replace the Node packaging with a small signed native
binary, add TCP DNS fallback, verify downloaded list signatures or pinned hashes,
and connect the resolver through Chromium's Network Service.
