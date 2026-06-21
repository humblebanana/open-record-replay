import test from "node:test";
import assert from "node:assert/strict";
import { redactionPreview } from "../packages/privacy/src/index.mjs";

test("flags sensitive-looking input", () => {
  const result = redactionPreview("api_key=sk-testsecret123456");
  assert.equal(result.sensitive, true);
  assert.ok(result.candidates.some((candidate) => candidate.kind === "api_key"));
});

test("does not flag normal YouTube query", () => {
  const result = redactionPreview("study jazz music");
  assert.equal(result.sensitive, false);
});
