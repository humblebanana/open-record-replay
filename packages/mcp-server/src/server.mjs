#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  checkNativeMacOSPermissions,
  createSession,
  getSession,
  listSessions,
  readEvents,
  stopSession
} from "../../core-engine/src/store.mjs";
import { prepareSkillEvidencePackage } from "../../core-engine/src/skillPackage.mjs";
import { compileWorkflow } from "../../compiler/src/youtubeWorkflow.mjs";
import { validateWorkflowWithWarnings } from "../../compiler/src/validateWorkflow.mjs";
import { replayWorkflow } from "../../replayer/src/index.mjs";
import { readJson } from "../../core-engine/src/store.mjs";
import { redactionPreview } from "../../privacy/src/index.mjs";
import {
  listSessionEventResources,
  listSessionResources,
  listWorkflowResources,
  listWorkflowTraceResources,
  readSessionEventsResource,
  readSessionResource,
  readWorkflowResource,
  readWorkflowTraceResource
} from "./resources.mjs";

export function createOpenRecordReplayServer() {
  const server = new McpServer({
    name: "open-record-replay",
    version: "0.1.0"
  });

  server.tool("permissions_check", {}, async () => json({
    permissions: await checkNativeMacOSPermissions({ request: false })
  }));

  server.tool("permissions_request", {}, async () => json({
    permissions: await checkNativeMacOSPermissions({ request: true })
  }));

  server.tool("record_start", {
    name: z.string().optional(),
    out: z.string().optional(),
    recorder_kind: z.enum(["native-macos", "screen", "chrome-youtube"]).optional(),
    request_permissions: z.boolean().optional(),
    skip_permission_check: z.boolean().optional()
  }, async ({ name, out, recorder_kind, request_permissions, skip_permission_check }) => json(await createSession({
    name,
    out,
    recorderKind: recorder_kind ?? "native-macos",
    preflight: !skip_permission_check,
    requestPermissions: Boolean(request_permissions)
  })));

  server.tool("record_stop", {
    session_id: z.string().optional(),
    out: z.string().optional()
  }, async ({ session_id, out }) => json(await stopSession({ sessionId: session_id ?? "latest", out })));

  server.tool("record_status", {
    session_id: z.string().optional(),
    out: z.string().optional()
  }, async ({ session_id, out }) => json(await getSession(session_id ?? "latest", out)));

  server.tool("session_list", {
    out: z.string().optional()
  }, async ({ out }) => json({ sessions: await listSessions(out) }));

  server.tool("session_get", {
    session_id: z.string().optional(),
    out: z.string().optional()
  }, async ({ session_id, out }) => json(await getSession(session_id ?? "latest", out)));

  server.tool("session_read_events", {
    session_id: z.string().optional(),
    out: z.string().optional()
  }, async ({ session_id, out }) => {
    const session = await getSession(session_id ?? "latest", out);
    return json({ session_id: session.id, events: await readEvents(session.artifacts.events_path) });
  });

  server.tool("skill_prepare", {
    session_id: z.string().optional(),
    runs: z.string().optional(),
    out: z.string().optional()
  }, async ({ session_id, runs, out }) => json(await prepareSkillEvidencePackage({
    sessionId: session_id ?? "latest",
    runs: runs ?? "runs",
    out: out ?? "skill-inputs"
  })));

  server.tool("workflow_compile", {
    session_id: z.string().optional(),
    runs: z.string().optional(),
    out: z.string().optional(),
    query: z.string().optional()
  }, async ({ session_id, runs, out, query }) => {
    const session = await getSession(session_id ?? "latest", runs ?? "runs");
    return json(await compileWorkflow({ session, out: out ?? "workflows", query }));
  });

  server.tool("workflow_get", {
    path: z.string()
  }, async ({ path }) => json(await readJson(path)));

  server.tool("workflow_validate", {
    path: z.string()
  }, async ({ path }) => json(validateWorkflowWithWarnings(await readJson(path))));

  server.tool("workflow_replay", {
    path: z.string(),
    query: z.string().optional(),
    execute: z.boolean().optional(),
    out: z.string().optional()
  }, async ({ path, query, execute, out }) => json(await replayWorkflow({
    workflow: await readJson(path),
    variables: { query },
    execute: Boolean(execute),
    out: out ?? "runs"
  })));

  server.tool("step_replay", {
    path: z.string(),
    step_id: z.string(),
    query: z.string().optional()
  }, async ({ path, step_id, query }) => {
    const workflow = await readJson(path);
    const step = workflow.steps.find((candidate) => candidate.id === step_id);
    if (!step) throw new Error(`Step not found: ${step_id}`);
    return json(await replayWorkflow({ workflow: { ...workflow, steps: [step] }, variables: { query } }));
  });

  server.tool("step_inspect", {
    path: z.string(),
    step_id: z.string()
  }, async ({ path, step_id }) => {
    const workflow = await readJson(path);
    const step = workflow.steps.find((candidate) => candidate.id === step_id);
    if (!step) throw new Error(`Step not found: ${step_id}`);
    return json(step);
  });

  server.tool("redaction_preview", {
    text: z.string()
  }, async ({ text }) => json(redactionPreview(text)));

  registerResources(server);
  return server;
}

export function registerResources(server) {
  server.resource("session", new ResourceTemplate("session://{id}", { list: listSessionResources }), {
    mimeType: "application/json"
  }, readSessionResource);

  server.resource("session-events", new ResourceTemplate("session://{id}/events", { list: listSessionEventResources }), {
    mimeType: "application/jsonl"
  }, readSessionEventsResource);

  server.resource("workflow", new ResourceTemplate("workflow://{id}", { list: listWorkflowResources }), {
    mimeType: "application/json"
  }, readWorkflowResource);

  server.resource("workflow-trace", new ResourceTemplate("workflow://{id}/trace", { list: listWorkflowTraceResources }), {
    mimeType: "application/json"
  }, readWorkflowTraceResource);

  server.resource("active-window-tree", "ui://active-window-tree", async (uri) => ({
    contents: [{
      uri: uri.href,
      text: "Active window AX tree capture is implemented by packages/platform-macos in native builds."
    }]
  }));
}

function json(value) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(value, null, 2)
    }]
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createOpenRecordReplayServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
