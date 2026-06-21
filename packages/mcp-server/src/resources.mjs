import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getSession, listSessions, readEvents, readJson } from "../../core-engine/src/store.mjs";

const DEFAULT_RUNS = "runs";
const WORKFLOW_DIRS = ["workflows", "runs/workflows"];
const TRACE_DIRS = ["runs/traces"];

export async function listSessionResources(out = DEFAULT_RUNS) {
  const sessions = await listSessions(out);
  return {
    resources: sessions.map((session) => ({
      uri: `session://${session.id}`,
      name: `session ${session.id}`,
      mimeType: "application/json"
    }))
  };
}

export async function listSessionEventResources(out = DEFAULT_RUNS) {
  const sessions = await listSessions(out);
  return {
    resources: sessions.map((session) => ({
      uri: `session://${session.id}/events`,
      name: `session ${session.id} events`,
      mimeType: "application/jsonl"
    }))
  };
}

export async function listWorkflowResources() {
  const workflows = await listWorkflows();
  return {
    resources: workflows.map(({ workflow }) => ({
      uri: `workflow://${workflow.id}`,
      name: workflow.name ?? workflow.id,
      mimeType: "application/json"
    }))
  };
}

export async function listWorkflowTraceResources() {
  const workflows = await listWorkflows();
  const resources = [];
  for (const { workflow } of workflows) {
    const trace = await findLatestTraceForWorkflow(workflow.id);
    if (!trace) continue;
    resources.push({
      uri: `workflow://${workflow.id}/trace`,
      name: `${workflow.name ?? workflow.id} latest trace`,
      mimeType: "application/json"
    });
  }
  return { resources };
}

export async function readSessionResource(uri, variables = {}) {
  const sessionId = variables.id ?? uri.hostname;
  const session = await getSession(sessionId, DEFAULT_RUNS);
  return jsonResource(uri, session);
}

export async function readSessionEventsResource(uri, variables = {}) {
  const sessionId = variables.id ?? uri.hostname;
  const session = await getSession(sessionId, DEFAULT_RUNS);
  const events = await readEvents(session.artifacts.events_path);
  return jsonlResource(uri, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

export async function readWorkflowResource(uri, variables = {}) {
  const workflowId = variables.id ?? uri.hostname;
  const { workflow } = await findWorkflow(workflowId);
  return jsonResource(uri, workflow);
}

export async function readWorkflowTraceResource(uri, variables = {}) {
  const workflowId = variables.id ?? uri.hostname;
  const trace = await findLatestTraceForWorkflow(workflowId);
  if (!trace) throw new Error(`Trace not found for workflow: ${workflowId}`);
  return jsonResource(uri, trace.trace);
}

function jsonResource(uri, value) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(value, null, 2)
    }]
  };
}

function jsonlResource(uri, text) {
  return {
    contents: [{
      uri: uri.href,
      mimeType: "application/jsonl",
      text
    }]
  };
}

async function listWorkflows() {
  const workflows = [];
  for (const dir of WORKFLOW_DIRS) {
    const absoluteDir = path.resolve(process.cwd(), dir);
    if (!existsSync(absoluteDir)) continue;
    for (const entry of await readdir(absoluteDir)) {
      if (!entry.endsWith(".json")) continue;
      const file = path.join(absoluteDir, entry);
      try {
        const workflow = await readJson(file);
        if (workflow?.kind !== "workflow" || !workflow.id) continue;
        const metadata = await stat(file);
        workflows.push({ file, workflow, mtimeMs: metadata.mtimeMs });
      } catch {
        // Ignore unrelated JSON files in workflow directories.
      }
    }
  }
  return workflows.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function findWorkflow(idOrName) {
  const workflows = await listWorkflows();
  const match = workflows.find(({ file, workflow }) =>
    workflow.id === idOrName ||
    workflow.name === idOrName ||
    path.basename(file, ".json") === idOrName ||
    path.basename(file, ".workflow.json") === idOrName
  );
  if (!match) throw new Error(`Workflow not found: ${idOrName}`);
  return match;
}

async function findLatestTraceForWorkflow(workflowId) {
  const traces = [];
  for (const dir of TRACE_DIRS) {
    const absoluteDir = path.resolve(process.cwd(), dir);
    if (!existsSync(absoluteDir)) continue;
    for (const entry of await readdir(absoluteDir)) {
      if (!entry.endsWith(".json")) continue;
      const file = path.join(absoluteDir, entry);
      try {
        const trace = await readJson(file);
        if (trace?.kind !== "replay_trace" || trace.workflow_id !== workflowId) continue;
        const metadata = await stat(file);
        traces.push({ file, trace, mtimeMs: metadata.mtimeMs });
      } catch {
        // Ignore unrelated JSON files in trace directories.
      }
    }
  }
  return traces.sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
}
