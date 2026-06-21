import test from "node:test";
import assert from "node:assert/strict";
import { inspectOfficialRecordingContract } from "../packages/core-engine/src/recordingContract.mjs";

test("official recording contract passes action-level semantic streams", () => {
  const events = [
    { id: 1, kind: "session.started", timestamp: "2026-06-21T00:00:00Z" },
    {
      id: 2,
      kind: "window.changed",
      timestamp: "2026-06-21T00:00:01Z",
      app: { name: "Feishu" },
      window: { title: "飞书" },
      ax: { mode: "fullTree", text: "x".repeat(1500) }
    },
    {
      id: 3,
      kind: "mouse.click",
      timestamp: "2026-06-21T00:00:02Z",
      mouse: { button: "left", target: { role: "AXButton", title: "Upload" } }
    },
    {
      id: 4,
      kind: "keyboard.text_input",
      timestamp: "2026-06-21T00:00:03Z",
      keyboard: { text: "hello" }
    },
    {
      id: 5,
      kind: "selection.changed",
      timestamp: "2026-06-21T00:00:04Z",
      selection: { target: { role: "AXList" }, selectedItems: [{ title: "file.png" }] }
    },
    { id: 6, kind: "session.ended", timestamp: "2026-06-21T00:00:05Z" }
  ];

  assert.equal(inspectOfficialRecordingContract(events).status, "passed");
});

test("official recording contract rejects screenshot-only semantic streams", () => {
  const events = [
    { id: 1, kind: "session.started", timestamp: "2026-06-21T00:00:00Z" },
    {
      id: 2,
      kind: "window.changed",
      timestamp: "2026-06-21T00:00:01Z",
      app: { name: "Feishu" },
      window: { title: "飞书" },
      ax: { mode: "fullTree", text: "飞书" }
    },
    { id: 3, kind: "screen.screenshot", timestamp: "2026-06-21T00:00:02Z", screenshot: { path: "1.png" } },
    { id: 4, kind: "session.ended", timestamp: "2026-06-21T00:00:03Z" }
  ];

  const result = inspectOfficialRecordingContract(events);
  assert.equal(result.status, "failed");
  assert.match(result.failures.join("\n"), /Missing action-level events/);
  assert.match(result.failures.join("\n"), /AX capture is too shallow/);
});
