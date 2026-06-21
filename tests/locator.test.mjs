import test from "node:test";
import assert from "node:assert/strict";
import { hasPositionOnlyLocator, rankLocators } from "../packages/locator/src/index.mjs";

test("ranks semantic locators before position fallback", () => {
  const ranked = rankLocators({
    primary: { kind: "position", x: 1, y: 2 },
    fallbacks: [{ kind: "text", text: "Search" }, { kind: "ax", role: "AXTextField" }]
  });

  assert.equal(ranked[0].kind, "ax");
  assert.equal(ranked[1].kind, "text");
  assert.equal(ranked.at(-1).kind, "position");
});

test("detects position-only steps", () => {
  assert.equal(hasPositionOnlyLocator({ target: { primary: { kind: "position" } } }), true);
  assert.equal(hasPositionOnlyLocator({ target: { primary: { kind: "ax" } } }), false);
});
