import test from "node:test";
import assert from "node:assert/strict";
import { DomainFilter, extractDomains } from "../src/blocklist.js";

test("extracts plain, hosts-file, and adblock domains", () => {
  const domains = extractDomains(`
    example.com
    0.0.0.0 ads.example.net # comment
    127.0.0.1 tracker.example.org
    ||metrics.example.io^
    localhost
  `);

  assert.deepEqual([...domains].sort(), [
    "ads.example.net",
    "example.com",
    "metrics.example.io",
    "tracker.example.org"
  ]);
});

test("blocks subdomains and lets the allowlist override a parent", () => {
  const filter = new DomainFilter(
    new Set(["example.com"]),
    new Set(["safe.example.com"])
  );

  assert.equal(filter.shouldBlock("ads.example.com"), true);
  assert.equal(filter.shouldBlock("safe.example.com"), false);
  assert.equal(filter.shouldBlock("child.safe.example.com"), false);
  assert.equal(filter.shouldBlock("example.net"), false);
});
