export const eventKinds = [
  "session.started",
  "session.ended",
  "window.changed",
  "mouse.click",
  "mouse.drag",
  "keyboard.text_input",
  "keyboard.submit",
  "keyboard.shortcut",
  "selection.changed",
  "ax.snapshot",
  "ax.diff",
  "screenshot.captured",
  "wait.idle",
  "screen.screenshot",
  "browser.page_observed",
  "recorder.started",
  "recorder.stopped",
  "recorder.paused",
  "recorder.resumed",
  "recorder.observation_failed",
  "recording_control.stop_clicked",
  "recording_control.pause_clicked",
  "recording_control.resume_clicked",
  "ui.control.visible",
  "media.playback_started"
];

export const actionKinds = [
  "open_app",
  "navigate",
  "click",
  "type",
  "submit",
  "wait",
  "skip_ad_if_visible",
  "assert_playback_started"
];

export const locatorKinds = ["ax", "text", "image", "css", "url", "position"];
export const assertionKinds = ["exists", "url_contains", "playback_started", "text_present", "value_changed"];

export function validateSession(value) {
  const errors = [];
  requireFields(value, ["schema_version", "kind", "id", "status", "started_at", "artifacts"], "$", errors);
  if (value.kind !== "session") errors.push("$.kind must be session");
  if (!value.artifacts?.events_path) errors.push("$.artifacts.events_path is required");
  return errors;
}

export function validateEvent(value) {
  const errors = [];
  requireFields(value, ["id", "kind", "timestamp"], "$", errors);
  if (!eventKinds.includes(value.kind)) errors.push(`$.kind unsupported event kind: ${value.kind}`);
  return errors;
}

export function validateWorkflow(value) {
  const errors = [];
  requireFields(value, ["schema_version", "kind", "id", "name", "steps"], "$", errors);
  if (value.kind !== "workflow") errors.push("$.kind must be workflow");
  if (!Array.isArray(value.steps) || value.steps.length === 0) errors.push("$.steps must contain at least one step");
  for (const [index, step] of (value.steps || []).entries()) {
    errors.push(...validateStep(step, `$.steps[${index}]`));
  }
  return errors;
}

export function validateStep(step, path = "$") {
  const errors = [];
  requireFields(step, ["id", "name", "action", "assertions"], path, errors);
  if (!actionKinds.includes(step.action?.kind)) errors.push(`${path}.action.kind unsupported: ${step.action?.kind}`);
  if (!Array.isArray(step.assertions) || step.assertions.length === 0) {
    errors.push(`${path}.assertions must contain at least one assertion`);
  }
  for (const [index, assertion] of (step.assertions || []).entries()) {
    if (!assertionKinds.includes(assertion.kind)) {
      errors.push(`${path}.assertions[${index}].kind unsupported: ${assertion.kind}`);
    }
  }
  return errors;
}

export function validateReplayTrace(value) {
  const errors = [];
  requireFields(value, ["schema_version", "kind", "id", "workflow_id", "status", "steps"], "$", errors);
  if (value.kind !== "replay_trace") errors.push("$.kind must be replay_trace");
  if (!Array.isArray(value.steps)) errors.push("$.steps must be an array");
  return errors;
}

function requireFields(value, fields, path, errors) {
  for (const field of fields) {
    if (value?.[field] === undefined || value?.[field] === null) errors.push(`${path}.${field} is required`);
  }
}
