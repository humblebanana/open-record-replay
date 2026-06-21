import test from "node:test";
import assert from "node:assert/strict";
import { buildYouTubeWorkflow } from "../packages/compiler/src/youtubeWorkflow.mjs";
import { validateEvent, validateReplayTrace, validateSession, validateWorkflow } from "../packages/schema/src/index.mjs";

test("validates session, event, workflow, and replay trace shapes", () => {
  const session = {
    schema_version: 1,
    kind: "session",
    id: "sess_test",
    status: "completed",
    started_at: "2026-06-21T00:00:00.000Z",
    artifacts: { events_path: "events.jsonl" }
  };
  const event = { id: 1, kind: "session.started", timestamp: "2026-06-21T00:00:00.000Z" };
  const screenshotEvent = {
    id: "rec_2",
    kind: "screen.screenshot",
    timestamp: "2026-06-21T00:00:01.000Z",
    screenshot: { path: "/tmp/orr/000001.png", sequence: 1, format: "png" }
  };
  const browserEvent = {
    id: "rec_3",
    kind: "browser.page_observed",
    timestamp: "2026-06-21T00:00:02.000Z",
    browser: { title: "Example", url: "https://example.com" }
  };
  const workflow = buildYouTubeWorkflow({ session, events: [event] });
  const trace = {
    schema_version: 1,
    kind: "replay_trace",
    id: "trace_test",
    workflow_id: workflow.id,
    status: "dry_run",
    steps: []
  };

  assert.deepEqual(validateSession(session), []);
  assert.deepEqual(validateEvent(event), []);
  assert.deepEqual(validateEvent(screenshotEvent), []);
  assert.deepEqual(validateEvent(browserEvent), []);
  assert.deepEqual(validateWorkflow(workflow), []);
  assert.deepEqual(validateReplayTrace(trace), []);
});
