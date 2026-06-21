import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildYouTubeWorkflow, compileWorkflow } from "../packages/compiler/src/youtubeWorkflow.mjs";
import { createSession, stopSession } from "../packages/core-engine/src/store.mjs";
import { createOpenRecordReplayServer } from "../packages/mcp-server/src/server.mjs";
import {
  listSessionEventResources,
  listSessionResources,
  listWorkflowResources,
  listWorkflowTraceResources,
  readSessionEventsResource,
  readSessionResource,
  readWorkflowResource,
  readWorkflowTraceResource
} from "../packages/mcp-server/src/resources.mjs";
import { replayWorkflow } from "../packages/replayer/src/index.mjs";

test("MCP resources expose session, events, workflow, and latest trace artifacts", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "orr-mcp-resources-"));
  const previousCwd = process.cwd();
  process.chdir(tmp);
  try {
    const session = await createSession({ name: "resource-test", out: "runs", recorder: false });
    const stopped = await stopSession({ sessionId: session.id, out: "runs" });
    const { workflow } = await compileWorkflow({ session: stopped, out: "workflows" });
    const { trace } = await replayWorkflow({ workflow, out: "runs" });

    const sessionResource = await readSessionResource(new URL(`session://${stopped.id}`), { id: stopped.id });
    assert.equal(JSON.parse(sessionResource.contents[0].text).id, stopped.id);

    const eventsResource = await readSessionEventsResource(new URL(`session://${stopped.id}/events`), { id: stopped.id });
    assert.match(eventsResource.contents[0].text, /"kind":"session.started"/);
    assert.match(eventsResource.contents[0].text, /"kind":"session.ended"/);

    const workflowResource = await readWorkflowResource(new URL(`workflow://${workflow.id}`), { id: workflow.id });
    assert.equal(JSON.parse(workflowResource.contents[0].text).id, workflow.id);

    const traceResource = await readWorkflowTraceResource(new URL(`workflow://${workflow.id}/trace`), { id: workflow.id });
    assert.equal(JSON.parse(traceResource.contents[0].text).id, trace.id);

    assert.ok((await listSessionResources()).resources.some((resource) => resource.uri === `session://${stopped.id}`));
    assert.ok((await listSessionEventResources()).resources.some((resource) => resource.uri === `session://${stopped.id}/events`));
    assert.ok((await listWorkflowResources()).resources.some((resource) => resource.uri === `workflow://${workflow.id}`));
    assert.ok((await listWorkflowTraceResources()).resources.some((resource) => resource.uri === `workflow://${workflow.id}/trace`));
  } finally {
    process.chdir(previousCwd);
    await rm(tmp, { recursive: true, force: true });
  }
});

test("MCP server registers Phase 1 resource templates", () => {
  const server = createOpenRecordReplayServer();
  const templates = Object.keys(server._registeredResourceTemplates).sort();
  const tools = Object.keys(server._registeredTools).sort();

  assert.deepEqual(templates, [
    "session",
    "session-events",
    "workflow",
    "workflow-trace"
  ]);
  assert.equal(server._registeredResources["ui://active-window-tree"].name, "active-window-tree");
  assert.ok(tools.includes("permissions_check"));
  assert.ok(tools.includes("permissions_request"));
  assert.ok(tools.includes("record_start"));
  assert.ok(tools.includes("record_stop"));
  assert.ok(tools.includes("skill_prepare"));

  const workflow = buildYouTubeWorkflow({ session: { id: "sess_test" }, events: [] });
  assert.equal(workflow.kind, "workflow");
});
