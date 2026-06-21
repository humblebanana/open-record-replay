import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildYouTubeWorkflow } from "../packages/compiler/src/youtubeWorkflow.mjs";
import { replayWorkflow } from "../packages/replayer/src/index.mjs";

test("dry-run replay writes passed trace without opening Chrome", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "orr-test-"));
  try {
    const workflow = buildYouTubeWorkflow({ session: { id: "sess_test" }, events: [{ id: 1 }] });
    const { trace, tracePath } = await replayWorkflow({ workflow, out: tmp });
    assert.equal(trace.status, "dry_run");
    assert.ok(trace.steps.every((step) => step.status === "passed"));
    assert.match(tracePath, /replay_trace\.json$/);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
