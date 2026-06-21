import test from "node:test";
import assert from "node:assert/strict";
import { validateEvent, validateSession } from "../packages/schema/src/index.mjs";

test("validates session and native event shapes", () => {
  const session = {
    schema_version: 1,
    kind: "session",
    id: "sess_test",
    status: "completed",
    started_at: "2026-06-21T00:00:00.000Z",
    artifacts: { events_path: "events.jsonl" }
  };
  const event = { id: 1, kind: "session.started", timestamp: "2026-06-21T00:00:00.000Z" };
  const clickEvent = {
    id: 2,
    kind: "mouse.click",
    timestamp: "2026-06-21T00:00:01.000Z",
    mouse: { target: { role: "AXButton", title: "Send" } }
  };

  assert.deepEqual(validateSession(session), []);
  assert.deepEqual(validateEvent(event), []);
  assert.deepEqual(validateEvent(clickEvent), []);
});
