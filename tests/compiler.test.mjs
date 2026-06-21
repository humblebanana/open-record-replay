import test from "node:test";
import assert from "node:assert/strict";
import { buildYouTubeWorkflow } from "../packages/compiler/src/youtubeWorkflow.mjs";
import { validateWorkflowWithWarnings } from "../packages/compiler/src/validateWorkflow.mjs";

test("compiles YouTube demo into asserted replayable steps", () => {
  const workflow = buildYouTubeWorkflow({
    session: { id: "sess_test" },
    events: [{ id: 1 }, { id: 2 }],
    query: "study jazz music"
  });
  const result = validateWorkflowWithWarnings(workflow);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.ok(workflow.steps.length >= 6);
  assert.ok(workflow.steps.every((step) => step.assertions.length > 0));
  assert.equal(workflow.parameters[0].name, "query");
});
