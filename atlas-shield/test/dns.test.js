import test from "node:test";
import assert from "node:assert/strict";
import { buildBlockedResponse, encodeQuery, parseQuestion } from "../src/dns.js";

test("parses a standard DNS question", () => {
  const query = encodeQuery("ads.example.com", 1, 42);
  const question = parseQuestion(query);
  assert.equal(question.name, "ads.example.com");
  assert.equal(question.type, 1);
  assert.equal(question.class, 1);
});

test("returns 0.0.0.0 for a blocked A query", () => {
  const query = encodeQuery("ads.example.com", 1, 42);
  const question = parseQuestion(query);
  const response = buildBlockedResponse(query, question, 60);

  assert.equal(response.readUInt16BE(0), 42);
  assert.equal(response.readUInt16BE(6), 1);
  assert.deepEqual([...response.subarray(-4)], [0, 0, 0, 0]);
});

test("returns an empty successful answer for a blocked non-address query", () => {
  const query = encodeQuery("ads.example.com", 65, 43);
  const question = parseQuestion(query);
  const response = buildBlockedResponse(query, question, 60);

  assert.equal(response.readUInt16BE(0), 43);
  assert.equal(response.readUInt16BE(6), 0);
  assert.equal(response.readUInt16BE(2) & 0x000f, 0);
});
