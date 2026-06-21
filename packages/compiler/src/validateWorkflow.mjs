import { hasPositionOnlyLocator } from "../../locator/src/index.mjs";
import { validateWorkflow } from "../../schema/src/index.mjs";

export function validateWorkflowWithWarnings(workflow) {
  const errors = validateWorkflow(workflow);
  const warnings = [];
  for (const step of workflow.steps ?? []) {
    if (hasPositionOnlyLocator(step)) {
      warnings.push({
        code: "POSITION_ONLY_LOCATOR",
        step_id: step.id,
        message: "Step relies only on position locators."
      });
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
