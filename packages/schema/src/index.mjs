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
  "recorder.started",
  "recorder.stopped",
  "recorder.paused",
  "recorder.resumed",
  "recorder.observation_failed",
  "recording_control.stop_clicked",
  "recording_control.pause_clicked",
  "recording_control.resume_clicked",
  "ui.control.visible"
];

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

function requireFields(value, fields, path, errors) {
  for (const field of fields) {
    if (value?.[field] === undefined || value?.[field] === null) errors.push(`${path}.${field} is required`);
  }
}
