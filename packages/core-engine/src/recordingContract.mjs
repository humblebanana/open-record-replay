import { readEvents } from "./store.mjs";

const REQUIRED_CORE_EVENTS = ["session.started", "window.changed", "session.ended"];
const OFFICIAL_ACTION_EVENTS = ["mouse.click", "mouse.drag", "keyboard.text_input", "keyboard.submit", "keyboard.shortcut", "selection.changed"];

export async function validateOfficialRecordingContract({ session, eventsPath = session?.artifacts?.events_path } = {}) {
  if (!eventsPath) throw new Error("eventsPath is required");
  const events = await readEvents(eventsPath);
  return inspectOfficialRecordingContract(events);
}

export function inspectOfficialRecordingContract(events) {
  const eventCounts = countKinds(events);
  const axEvents = events.filter((event) => event.ax?.text);
  const axTextChars = axEvents.reduce((total, event) => total + event.ax.text.length, 0);
  const mouseTargetEvents = events.filter((event) => event.mouse?.target);
  const selectionTargetEvents = events.filter((event) => event.selection?.target || event.selection?.selectedItems);
  const keyboardEvents = events.filter((event) => event.kind.startsWith("keyboard."));
  const screenshotEvents = events.filter((event) => event.kind === "screen.screenshot" || event.kind === "screenshot.captured");

  const failures = [];
  for (const kind of REQUIRED_CORE_EVENTS) {
    if (!eventCounts[kind]) failures.push(`Missing required core event: ${kind}`);
  }

  const actionKindsPresent = OFFICIAL_ACTION_EVENTS.filter((kind) => eventCounts[kind]);
  if (!actionKindsPresent.length) {
    failures.push("Missing action-level events: expected at least one mouse/keyboard/selection event.");
  }
  if (!mouseTargetEvents.length) {
    failures.push("Missing mouse target metadata: mouse.click events must include target role/title/description when available.");
  }
  if (!selectionTargetEvents.length) {
    failures.push("Missing selection metadata: file pickers/lists must emit selection.changed with selectedItems when available.");
  }
  if (!keyboardEvents.length) {
    failures.push("Missing keyboard events: text input or submit events were not captured.");
  }
  if (!axEvents.length || axTextChars < 1000) {
    failures.push(`AX capture is too shallow: captured ${axTextChars} AX text chars; expected full tree/diff scale evidence.`);
  }
  if (screenshotEvents.length > actionKindsPresent.length && !actionKindsPresent.length) {
    failures.push("Screenshots are present but action-level semantic events are absent; screenshots cannot be primary evidence.");
  }

  return {
    status: failures.length ? "failed" : "passed",
    failures,
    metrics: {
      event_count: events.length,
      event_counts: eventCounts,
      action_event_kinds_present: actionKindsPresent,
      ax_event_count: axEvents.length,
      ax_text_chars: axTextChars,
      mouse_target_event_count: mouseTargetEvents.length,
      selection_target_event_count: selectionTargetEvents.length,
      keyboard_event_count: keyboardEvents.length,
      screenshot_event_count: screenshotEvents.length
    }
  };
}

function countKinds(events) {
  const counts = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] || 0) + 1;
  return counts;
}
