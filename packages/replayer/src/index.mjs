import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeJson } from "../../core-engine/src/store.mjs";
import { validateWorkflow } from "../../schema/src/index.mjs";
import { executeYouTubeStep } from "./youtubeExecutor.mjs";

export async function replayWorkflow({ workflow, variables = {}, execute = false, out = "runs" }) {
  const validationErrors = validateWorkflow(workflow);
  if (validationErrors.length) {
    throw new Error(`Invalid workflow:\n${validationErrors.join("\n")}`);
  }

  const trace = {
    schema_version: 1,
    kind: "replay_trace",
    id: `trace_${randomUUID().slice(0, 8)}`,
    workflow_id: workflow.id,
    started_at: new Date().toISOString(),
    ended_at: null,
    status: execute ? "passed" : "dry_run",
    mode: execute ? "execute" : "dry_run",
    steps: []
  };

  for (const step of workflow.steps) {
    const started = Date.now();
    try {
      const result = execute
        ? await executeYouTubeStep(step, variables)
        : { ok: true, message: `Dry-run: ${step.action.kind}` };
      trace.steps.push({
        step_id: step.id,
        name: step.name,
        status: result.ok ? "passed" : "failed",
        message: result.message,
        duration_ms: Date.now() - started
      });
      if (!result.ok) {
        trace.status = "failed";
        break;
      }
    } catch (error) {
      trace.status = "failed";
      trace.steps.push({
        step_id: step.id,
        name: step.name,
        status: "failed",
        error_code: "STEP_EXECUTION_FAILED",
        message: error?.message || String(error),
        duration_ms: Date.now() - started
      });
      break;
    }
  }

  trace.ended_at = new Date().toISOString();
  const tracePath = path.resolve(process.cwd(), out, "traces", `${trace.id}.replay_trace.json`);
  await writeJson(tracePath, trace);
  return { trace, tracePath };
}
